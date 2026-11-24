import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
let head = '', base = '', prNumber = '', artifactRun = '', artifact = '';
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
  head = pr.head.sha;
  prNumber = pr.number;
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
    requireValue(/^[0-9a-f]{40}$/.test(previous), 'Invalid deployed backend baseline');
    // The resolver checks out full history, so even large releases can be compared in full.
    const diff = spawnSync('git', [
      'diff', '--quiet', '--no-ext-diff', previous, sha, '--',
      'supabase/config.toml', 'supabase/migrations/*.sql', 'supabase/functions/',
      ':(exclude,icase)supabase/functions/*.md', ':(exclude,icase)supabase/functions/*.mdx'
    ], { stdio: 'inherit' });
    if (diff.error) throw diff.error;
    requireValue(diff.status === 0 || diff.status === 1, 'Cannot compare hosted Supabase inputs');
    backend = diff.status === 1;
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
  } else if (operation === 'Verify preview') {
    requireValue(kind === 'SHA' && /^[0-9a-f]{40}$/i.test(value), 'Enter the full SHA listed in the preview summary');
    sha = value.toLowerCase();
  } else if (kind === 'PR') {
    requireValue(/^[1-9]\d*$/.test(value), 'Expected a PR number');
    const pr = await api('pulls/' + value);
    requireValue(pr.state === 'open' && !pr.draft && eligiblePR(pr), 'Select a ready repository PR for staging, release or hotfix');
    head = sha = pr.head.sha;
    prNumber = pr.number;
    if (pr.base.ref === 'staging') {
      base = (await branch('staging')).commit.sha;
      requireValue(pr.mergeable && /^[0-9a-f]{40}$/.test(pr.merge_commit_sha ?? ''), 'GitHub has no merge candidate yet. Check PR conflicts and try again.');
      const candidate = await api('git/commits/' + pr.merge_commit_sha);
      requireValue(candidate.parents.length === 2 && candidate.parents[0].sha === base && candidate.parents[1].sha === head,
        'GitHub has not prepared a merge candidate for the current PR head and staging tip. Try again after PR checks start.');
      sha = candidate.sha;
    }
  } else if (kind === 'Branch') {
    sha = (await branch(value)).commit.sha;
  } else {
    requireValue(kind === 'SHA' && /^[0-9a-f]{40}$/i.test(value), 'Expected a full commit SHA');
    sha = (await api('commits/' + value)).sha;
    const branches = execFileSync('git', ['for-each-ref', '--contains', sha, '--format=%(refname)', 'refs/remotes/origin/'], {encoding: 'utf8'});
    requireValue(branches.trim(), 'Select a commit reachable from a repository branch');
  }
  if (!prNumber && !snapshot && operation !== 'Verify preview') {
    const prs = await api(`commits/${sha}/pulls`);
    requireValue(!prs.some(p => p.state === 'open' && p.head.sha === sha && p.draft), 'Preview source belongs to a draft PR');
    const ready = prs.filter(p => p.state === 'open' && p.head.sha === sha && eligiblePR(p));
    if (ready.length === 1) prNumber = ready[0].number;
  }
  if (base && !env.RECHECK_PREVIEW && env.SUPABASE_URL && env.SUPABASE_KEY) {
    const workflows = ['validate.yml', 'pages-app-preview.yml'];
    const versionsMatch = await Promise.all(workflows.map(async name => {
      const path = '.github/workflows/' + name;
      const trusted = execFileSync('git', ['rev-parse', 'HEAD:' + path], { encoding: 'utf8' }).trim();
      const tested = await api(`contents/${path}?ref=${sha}`);
      return tested.sha === trusted;
    }));
    if (versionsMatch.every(Boolean)) {
      const config = createHash('sha256').update(env.SUPABASE_URL + '\0' + env.SUPABASE_KEY).digest('hex');
      const name = `lumiere-preview-${sha}-${config}`;
      const results = await api(`actions/workflows/validate.yml/runs?event=pull_request&status=success&head_sha=${head}&per_page=10`);
      for (const run of results.workflow_runs) {
        const files = await api(`actions/runs/${run.id}/artifacts?name=${name}`);
        const match = files.artifacts.find(file => file.name === name && !file.expired);
        if (!match) continue;
        artifactRun = run.id;
        artifact = match.id;
        break;
      }
    }
  }
}
requireValue(/^[0-9a-f]{40}$/.test(sha), 'Invalid resolved commit');
for (const [key, value] of Object.entries({ target, sha, backend, snapshot, head, base, prNumber, artifactRun, artifact })) {
  appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
const revisionLabel = snapshot ? 'Snapshot' : 'Revision';
const checks = artifact ? `- Reusing validation and build from [run ${artifactRun}](${env.GITHUB_SERVER_URL}/${repo}/actions/runs/${artifactRun}).\n`
  : operation === 'Deploy' ? '- The selected revision will run fresh validation and a Pages build.\n' : '';
appendFileSync(env.GITHUB_STEP_SUMMARY, `### Selected ${target} operation\n\n- Operation: **${operation}**\n- ${revisionLabel}: \`${sha}\`\n${head ? `- PR head: \`${head}\`\n` : ''}${checks}`);
