import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const env = process.env;
const path = 'state/manifest.json';
const preview = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).preview : undefined;
if (!preview || preview.status === 'expired') process.exit(0);

async function api(path) {
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/${path}`, {
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json' }
  });
  if (!response.ok) throw Error(`GitHub returned ${response.status} for ${path}`);
  return response.json();
}

function included(commit) {
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) return false;
  const result = spawnSync('git', ['merge-base', '--is-ancestor', commit, env.SOURCE_SHA]);
  if (result.error) throw result.error;
  return result.status === 0;
}

const head = preview.head ?? preview.sha;
const prNumber = preview.pr ?? (head === env.PR_HEAD ? Number(env.PR_NUMBER) : undefined);
const pr = Number.isSafeInteger(prNumber) ? await api(`pulls/${prNumber}`) : undefined;
const mergedHere = pr?.merged && pr.base.ref === 'staging' && pr.head.sha === head &&
  (pr.merge_commit_sha === env.SOURCE_SHA || included(pr.merge_commit_sha));
if (!mergedHere && !included(head)) process.exit(0);

const { statuses } = await api(`commits/${head}/status`);
const verified = statuses.find(status => status.context === 'Preview verified');
if (verified?.state !== 'success' || (preview.head && verified.description !== `Verified preview run ${preview.run}`)) process.exit(0);

const issues = [...new Set([...(pr?.body ?? '').matchAll(/\b(?:closes?|fix(?:es)?|resolves?|refs?|tracks?|issues?)\s*:?\s*#([1-9]\d*)\b/gi)]
  .map(match => Number(match[1])))].filter(Number.isSafeInteger);
appendFileSync(env.GITHUB_ENV, `EXPIRED_PREVIEW=${JSON.stringify({ pr: prNumber, issues: issues.length ? issues : [84] })}\n`);
