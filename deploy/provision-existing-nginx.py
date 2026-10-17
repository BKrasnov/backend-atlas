#!/usr/bin/env python3
"""Deploy Atlas alongside an existing HTTPS SPA, without replacing its frontend."""
import argparse
import hashlib
import os
from pathlib import Path
import pwd
import re
import secrets
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.parse
import urllib.request


def run(args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def symlink(target, link):
    temporary = link.with_name(link.name + f'.new-{os.getpid()}')
    temporary.symlink_to(target)
    os.replace(temporary, link)


def origin(value):
    url = urllib.parse.urlsplit(value)
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.path or url.query or url.fragment:
        raise argparse.ArgumentTypeError('Expected an HTTPS origin without a path or credentials')
    return value


parser = argparse.ArgumentParser()
parser.add_argument('--archive', type=Path, required=True)
parser.add_argument('--release', required=True)
parser.add_argument('--public-origin', type=origin, required=True)
parser.add_argument('--allowed-origin', type=origin, required=True)
parser.add_argument('--site-config', type=Path, required=True)
parser.add_argument('--frontend-file', type=Path, required=True)
parser.add_argument('--node-version', default='v24.22.0')
args = parser.parse_args()
if os.geteuid() != 0 or not re.fullmatch(r'[0-9a-f]{7,40}', args.release) or not re.fullmatch(r'v24\.\d+\.\d+', args.node_version):
    raise SystemExit('Run as root with a commit SHA and a Node.js 24 version.')
if not args.site_config.resolve().is_relative_to(Path('/etc/nginx')):
    raise SystemExit('Expected an existing Nginx configuration under /etc/nginx.')

print(f'Provisioner PID {os.getpid()}', flush=True)
frontend_hash = hashlib.sha256(args.frontend_file.read_bytes()).hexdigest()
base = Path('/opt/backend-atlas')
runtime = base / 'runtime'
runtime.mkdir(parents=True, exist_ok=True)
node_dir = runtime / f'node-{args.node_version}-linux-x64'
if not (node_dir / 'bin/node').is_file():
    filename = f'node-{args.node_version}-linux-x64.tar.xz'
    url = f'https://nodejs.org/dist/{args.node_version}/'
    with tempfile.TemporaryDirectory(prefix='download-', dir=runtime) as temporary:
        archive = Path(temporary) / filename
        checksums = Path(temporary) / 'SHASUMS256.txt'
        for name, destination in [(filename, archive), ('SHASUMS256.txt', checksums)]:
            run(['curl', '-4', '-fL', '--connect-timeout', '15', '--max-time', '180', '--retry', '2', url + name, '-o', str(destination)])
        expected = next(line.split()[0] for line in checksums.read_text().splitlines() if line.split()[-1] == filename)
        if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
            raise SystemExit('Official Node.js checksum mismatch; installation refused.')
        with tarfile.open(archive) as package:
            package.extractall(runtime, filter='data')
    print('Installed a separate Node.js runtime; the existing system Node.js was not changed.', flush=True)
symlink(node_dir, runtime / 'current')
node = runtime / 'current/bin/node'
run([str(node), '--version'])

release = base / 'releases' / args.release
release.mkdir(parents=True, exist_ok=True)
with tarfile.open(args.archive, 'r:gz') as package:
    if any(member.issym() or member.islnk() or member.isdev() for member in package.getmembers()):
        raise SystemExit('Unexpected links or device files in application archive.')
    package.extractall(release, filter='data')
run([str(node), 'scripts/build.mjs'], cwd=release, env={**os.environ, 'ATLAS_API_URL': args.public_origin + '/atlas-api'})

try:
    account = pwd.getpwnam('backend-atlas')
except KeyError:
    run(['useradd', '--system', '--home-dir', '/var/lib/backend-atlas', '--shell', '/usr/sbin/nologin', 'backend-atlas'])
    account = pwd.getpwnam('backend-atlas')
data = Path('/var/lib/backend-atlas')
data.mkdir(mode=0o700, exist_ok=True)
data.chmod(0o700)
os.chown(data, account.pw_uid, account.pw_gid)

environment = Path('/etc/backend-atlas.env')
settings = {}
if environment.exists():
    for line in environment.read_text().splitlines():
        if '=' in line and not line.startswith('#'):
            key, value = line.split('=', 1)
            settings[key] = value
key = settings.get('ATLAS_TOKEN') or secrets.token_hex(32)
if not re.fullmatch(r'[A-Za-z0-9_-]{32,512}', key):
    raise SystemExit('Unexpected existing token format. Existing credentials were not replaced.')
descriptor = os.open(environment, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(descriptor, 'w') as stream:
    stream.write(f'ATLAS_TOKEN={key}\nPUBLIC_ORIGIN={args.public_origin}\nALLOWED_ORIGINS={args.allowed_origin}\n')
environment.chmod(0o600)
del key

current = base / 'current'
previous_release = current.resolve() if current.is_symlink() else None
symlink(release, current)
shutil.copy2(release / 'deploy/backend-atlas.service', '/etc/systemd/system/backend-atlas.service')
run(['systemctl', 'daemon-reload'])
run(['systemctl', 'enable', 'backend-atlas'])
run(['systemctl', 'restart', 'backend-atlas'])
for attempt in range(30):
    try:
        with urllib.request.urlopen('http://127.0.0.1:3341/api/health', timeout=2) as response:
            if response.status == 200:
                break
    except OSError:
        time.sleep(0.5)
else:
    if previous_release:
        symlink(previous_release, current)
        run(['systemctl', 'restart', 'backend-atlas'])
    raise SystemExit('API did not become healthy; Nginx configuration was not changed.')

snippet = Path('/etc/nginx/snippets/backend-atlas-api.conf')
old_snippet = snippet.read_text() if snippet.exists() else None
site = args.site_config
old_site = site.read_text()
include = '    include /etc/nginx/snippets/backend-atlas-api.conf;'
anchor = '    location / { try_files $uri $uri/ /index.html; }'
if include not in old_site:
    if old_site.count(anchor) != 1:
        raise SystemExit('Expected one SPA root location; API is healthy but Nginx was not changed.')
    backups = Path('/var/backups/backend-atlas')
    backups.mkdir(mode=0o700, parents=True, exist_ok=True)
    shutil.copy2(site, backups / f'nginx-before-atlas-{int(time.time())}.conf')
    site.write_text(old_site.replace(anchor, include + '\n\n' + anchor))
snippet.write_text((release / 'deploy/nginx-atlas-api.conf').read_text())
try:
    run(['nginx', '-t'])
    run(['systemctl', 'reload', 'nginx'])
except subprocess.CalledProcessError:
    site.write_text(old_site)
    if old_snippet is not None:
        snippet.write_text(old_snippet)
    else:
        snippet.unlink(missing_ok=True)
    run(['nginx', '-t'])
    run(['systemctl', 'reload', 'nginx'])
    raise

if hashlib.sha256(args.frontend_file.read_bytes()).hexdigest() != frontend_hash:
    raise SystemExit('Unexpected change in the existing frontend file.')
run(['systemctl', 'show', 'backend-atlas', '--property=MainPID,ActiveState,ExecStart'])
print('Existing frontend SHA256 unchanged:', frontend_hash, flush=True)
print('API endpoint:', args.public_origin + '/atlas-api', flush=True)
print('Access key location: /etc/backend-atlas.env (not printed).', flush=True)
