import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
const env = process.env;
const repo = env.GITHUB_REPOSITORY;
const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH));
const api = async path => {
  const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json' }
  });
  if (!response.ok) throw Error(`GitHub returned ${response.status} for ${path}`);
  return response.json();
};
const requireValue = (ok, message) => { if (!ok) throw Error(message); };
const operation = event.inputs?.operation || 'Deploy';
let target = 'preview', sha, backend = false;
let snapshot = '';
const branch = name => api('branches/' + encodeURIComponent(name));
const eligiblePR = pr => pr.head.repo?.full_name === repo &&
  (pr.base.ref === 'staging' || (pr.base.ref === 'main' && /^(hotfix|release)\//.test(pr.head.ref)));
if (event.workflow_run) {
  const run = event.workflow_run;
  requireValue(run.event === 'pull_request' && run.path === '.github/workflows/pages-merge.yml', 'Unexpected promotion event');
  // A skipped job can still give the workflow a successful conclusion.
  const jobs = await api(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`);
  if (!jobs.jobs.some(j => j.name === 'merged' && j.conclusion === 'success')) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, 'Closed PR did not qualify for deployment.\n');
    process.exit(0);
  }
  const candidates = run.pull_requests?.length ? run.pull_requests : await api(`commits/${run.head_sha}/pulls`);
  let pr;
  for (const item of candidates) {
    const detail = await api('pulls/' + item.number);
    if (detail.merged && eligiblePR(detail) && (detail.head.sha === run.head_sha || detail.merge_commit_sha === run.head_sha)) {
      if (pr) throw Error('Ambiguous merge event');
      pr = detail;
    }
  }
  requireValue(pr, 'Missing merged repository PR');
  sha = pr.merge_commit_sha;
  target = pr.base.ref === 'main' ? 'production' : 'staging';
  requireValue((await branch(pr.base.ref)).commit.sha === sha, 'Branch has advanced. Use its newest promotion.');
  if (target === 'production') {
    // Compare against the last deployed backend before applying pending migrations.
    // A superseded backend-changing release must also be picked up by its successor.
    const state = await fetch(`https://api.github.com/repos/${repo}/contents/manifest.json?ref=pages-state`, {
      headers: {Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github.raw+json'}
    });
    if (!state.ok && state.status !== 404) throw Error('Cannot read last deployed revision');
    const previous = state.ok ? (await state.json()).production.backendBaseline : 'be349afeb10b96aca982344bbcbf55a32eba4a95';
    const comparison = await api(`compare/${previous}...${sha}`);
    backend = !comparison.files || comparison.files.length >= 300 ||
      comparison.files.some(f => [f.filename, f.previous_filename].some(path => path?.startsWith('supabase/')));
  }
} else {
  requireValue(env.GITHUB_REF === 'refs/heads/main', 'Run the publisher from main');
  const value = event.inputs.source_value.trim();
  const kind = event.inputs.source_type;
  if (operation.startsWith('Rollback ')) {
    target = operation.slice(9);
    requireValue(['preview', 'staging', 'production'].includes(target) && kind === 'SHA' && /^[0-9a-f]{40}$/.test(value), 'Select a pages-state snapshot SHA');
    snapshot = value;
    sha = value;
  } else if (kind === 'PR') {
    requireValue(/^[1-9]\d*$/.test(value), 'Expected a PR number');
    const pr = await api('pulls/' + value);
    requireValue(pr.state === 'open' && !pr.draft && eligiblePR(pr), 'Select a ready repository PR for staging, release or hotfix');
    sha = pr.head.sha;
  } else if (kind === 'Branch') {
    sha = (await branch(value)).commit.sha;
  } else {
    requireValue(kind === 'SHA' && /^[0-9a-f]{40}$/i.test(value), 'Expected a full commit SHA');
    sha = (await api('commits/' + value)).sha;
    const branches = execFileSync('git', ['for-each-ref', '--contains', sha, '--format=%(refname)', 'refs/remotes/origin/'], {encoding: 'utf8'});
    requireValue(branches.trim(), 'Select a commit reachable from a repository branch');
  }
  const prs = snapshot ? [] : await api(`commits/${sha}/pulls`);
  requireValue(!prs.some(p => p.state === 'open' && p.head.sha === sha && p.draft), 'Preview source belongs to a draft PR');
}
requireValue(/^[0-9a-f]{40}$/.test(sha), 'Invalid resolved commit');
appendFileSync(env.GITHUB_OUTPUT, `target=${target}\nsha=${sha}\nbackend=${backend}\nsnapshot=${snapshot}\n`);
appendFileSync(env.GITHUB_STEP_SUMMARY, `Selected **${target}** commit \`${sha}\`.\n`);
