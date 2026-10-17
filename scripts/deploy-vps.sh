#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$project_dir"
domain="${1:-}"
pages_origin="${2:-}"
if [[ ! "$domain" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$ ]]; then
  printf 'Usage: bash scripts/deploy-vps.sh atlas.example.com [https://owner.github.io]\n' >&2
  exit 2
fi
if [[ -n "$pages_origin" && ! "$pages_origin" =~ ^https://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]+)?$ ]]; then
  printf 'The Pages origin must be https://owner.github.io, without a repository path.\n' >&2
  exit 2
fi
command -v docker >/dev/null || { printf 'Install Docker Engine and the Compose plugin first. See README.md.\n' >&2; exit 1; }
docker compose version >/dev/null
if [[ ! -e .env ]]; then
  command -v openssl >/dev/null || { printf 'Install openssl to generate an access key.\n' >&2; exit 1; }
  umask 077
  atlas_key="$(openssl rand -hex 32)"
  # noclobber also protects against two simultaneous first deployments.
  ( set -o noclobber
    printf 'ATLAS_TOKEN=%s\nATLAS_DOMAIN=%s\nALLOWED_ORIGINS=%s\n' "$atlas_key" "$domain" "$pages_origin" > .env
  )
  unset atlas_key
else
  if ! grep -Fxq "ATLAS_DOMAIN=$domain" .env; then
    printf '.env already exists with another or missing ATLAS_DOMAIN. Edit it explicitly before deploying.\n' >&2
    exit 1
  fi
  if [[ -n "$pages_origin" ]] && ! grep -Fxq "ALLOWED_ORIGINS=$pages_origin" .env; then
    printf '.env was preserved. Set ALLOWED_ORIGINS explicitly before adding a new Pages origin.\n' >&2
    exit 1
  fi
fi
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d --build
printf '\nStarted https://%s\nThe access key is in .env (ATLAS_TOKEN). It was not printed or sent to GitHub.\n' "$domain"
printf 'Check: docker compose ps\nLogs: docker compose logs --tail=80 atlas caddy\n'
