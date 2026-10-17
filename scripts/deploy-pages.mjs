import { spawnSync } from 'node:child_process';

const [repository, ref = 'main'] = process.argv.slice(2);
if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !/^[A-Za-z0-9_./-]+$/.test(ref)) {
  console.error('Usage: npm run deploy:pages -- owner/repository [main]');
  process.exit(2);
}
const result = spawnSync('gh', ['workflow','run','pages.yml','--repo',repository,'--ref',ref], {stdio:'inherit',shell:false});
if (result.error) {
  console.error('Install GitHub CLI and run gh auth login first. See README.md.');
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status || 1);
console.log(`Pages workflow started. Follow its result: gh run list --repo ${repository} --workflow pages.yml`);
