import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const isDocumentation = path => /^(?:docs\/.+\.md|README\.md|CHANGELOG\.md)$/.test(path);

export function changedPaths(base, head) {
  for (const sha of [base, head]) {
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Expected a full commit SHA');
  }
  return execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, head], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
  }).split('\0').filter(Boolean);
}

export function sameDeployableFiles(base, head) {
  return changedPaths(base, head).every(isDocumentation);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = changedPaths(process.argv[2], process.argv[3]);
  console.log('docs_only=' + (paths.length > 0 && paths.every(isDocumentation)));
}
