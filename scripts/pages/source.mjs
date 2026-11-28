import { execFileSync, spawnSync } from 'node:child_process';
import { changedPaths, isDocumentation } from './docs-only.mjs';
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
  requireValue(run.head_branch, 'Missing source branch for merge event');
  // A release branch can start at an earlier PR's merge SHA. Search by the
  // triggering branch so that shared SHA cannot redirect a release to staging.
  const owner = repo.split('/')[0];
  const source = encodeURIComponent(`${owner}:${run.head_branch}`);
  const candidates = run.pull_requests?.length ? run.pull_requests : await api(`pulls?state=closed&head=${source}&per_page=100`);
  let pr;
  for (const item of candidates) {
    const detail = await api('pulls/' + item.number);
    if (detail.merged && eligiblePR(detail) && detail.head.ref === run.head_branch &&
      (detail.head.sha === run.head_sha || detail.merge_commit_sha === run.head_sha)) {
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
  const parent = execFileSync('git', ['rev-parse', sha + '^1'], { encoding: 'utf8' }).trim();
  const changes = changedPaths(parent, sha);
  if (changes.length && changes.every(isDocumentation)) {
    // Compare with the deployed revision too, so a docs merge cannot hide an unpublished app change.
    const file = await api('contents/manifest.json?ref=pages-state');
    const deployed = JSON.parse(Buffer.from(file.content, 'base64').toString())[target]?.sha;
    if (deployed && changedPaths(deployed, sha).every(isDocumentation)) {
      appendFileSync(env.GITHUB_STEP_SUMMARY, 'Documentation-only merge. No deployment needed.\n');
      process.exit(0);
    }
  }
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
    const file = await api('contents/manifest.json?ref=pages-state');
    const { preview } = JSON.parse(Buffer.from(file.content, 'base64').toString());
    requireValue(preview?.sha && preview.status !== 'expired', 'No active preview. Deploy and review a candidate before verifying.');
    const pr = preview.pr ? await api('pulls/' + preview.pr) : undefined;
    if (kind === 'SHA') {
      requireValue(/^[0-9a-f]{40}$/i.test(value), 'Enter the full preview build or PR head SHA, or select PR or Branch');
      requireValue([preview.sha, preview.head].includes(value.toLowerCase()),
        'The SHA does not match the active preview. Deploy and review the intended revision first.');
    } else {
      requireValue(preview.pr, 'The active preview has no PR. Select SHA to verify its exact revision.');
      requireValue(kind === 'PR' && value === String(pr.number) || kind === 'Branch' && value === pr.head.ref,
        'Select the PR number or source branch of the active preview, or deploy the intended PR first.');
    }
    if (pr) {
      requireValue(eligiblePR(pr) && pr.state === 'open' && !pr.draft && pr.head.sha === preview.head &&
        pr.merge_commit_sha === preview.sha && (await branch(pr.base.ref)).commit.sha === preview.base,
        'The preview PR head or base changed. Deploy and review the current proposed merge.');
      prNumber = pr.number;
    }
    sha = preview.sha;
  } else {
    let pr;
    if (kind === 'PR') {
      requireValue(/^[1-9]\d*$/.test(value), 'Expected a PR number');
      pr = await api('pulls/' + value);
    } else {
      if (kind === 'Branch') {
        sha = (await branch(value)).commit.sha;
      } else {
        requireValue(kind === 'SHA' && /^[0-9a-f]{40}$/i.test(value), 'Expected a full commit SHA');
        sha = value.toLowerCase();
      }
      const prs = await api(`commits/${sha}/pulls`);
      const matches = prs.filter(candidate => candidate.state === 'open' && eligiblePR(candidate) &&
        (candidate.head.sha === sha || candidate.merge_commit_sha === sha) &&
        (kind !== 'Branch' || candidate.head.ref === value));
      requireValue(matches.length === 1, 'Select a commit or branch for exactly one open repository PR, or use its PR number');
      pr = await api('pulls/' + matches[0].number);
      requireValue(pr.head.sha === sha || pr.merge_commit_sha === sha, 'The selected revision has changed');
    }
    requireValue(pr.state === 'open' && !pr.draft && eligiblePR(pr), 'Select a ready repository PR for staging, release or hotfix');
    head = pr.head.sha;
    prNumber = pr.number;
    base = (await branch(pr.base.ref)).commit.sha;
    requireValue(pr.mergeable && /^[0-9a-f]{40}$/.test(pr.merge_commit_sha ?? ''), 'GitHub has no merge candidate yet. Check PR conflicts and try again.');
    const candidate = await api('git/commits/' + pr.merge_commit_sha);
    requireValue(candidate.parents.length === 2 && candidate.parents[0].sha === base && candidate.parents[1].sha === head,
      'GitHub has not prepared a merge candidate for the current PR head and base. Try again after PR checks start.');
    sha = candidate.sha;
    const comparison = await api('compare/' + base + '...' + sha);
    const files = comparison.files ?? [];
    const docsOnly = files.length > 0 && files.length < 300 && files.every(file =>
      isDocumentation(file.filename) && (!file.previous_filename || isDocumentation(file.previous_filename)));
    requireValue(!docsOnly, 'Documentation-only PRs do not need a preview');
  }
}
let validationRun = '';
let testedSha = sha;
if (target === 'staging' && event.workflow_run) {
  try {
    const file = await api('contents/manifest.json?ref=pages-state');
    const { preview } = JSON.parse(Buffer.from(file.content, 'base64').toString());
    if (String(preview.pr) === String(prNumber) && preview.head === head && preview.status !== 'expired') {
      const [tested, merged] = await Promise.all([preview.sha, sha].map(id => api('git/commits/' + id)));
      if (tested.tree.sha === merged.tree.sha && tested.parents[1]?.sha === head) testedSha = tested.sha;
      else testedSha = '';
    } else testedSha = '';
  } catch {
    testedSha = '';
  }
}
const previewLookup = base && !env.RECHECK_PREVIEW;
const stagingLookup = target === 'staging' && event.workflow_run && testedSha;
if (previewLookup || stagingLookup) {
  try {
    requireValue(env.SUPABASE_URL && env.SUPABASE_KEY, 'Missing hosted Pages configuration');
    const workflows = ['validate.yml', 'pages-app-preview.yml'];
    const versionsMatch = await Promise.all(workflows.map(async name => {
      const path = '.github/workflows/' + name;
      const trusted = execFileSync('git', ['rev-parse', 'HEAD:' + path], { encoding: 'utf8' }).trim();
      const tested = await api(`contents/${path}?ref=${testedSha}`);
      return tested.sha === trusted;
    }));
    if (versionsMatch.every(Boolean)) {
      const config = createHash('sha256').update(env.SUPABASE_URL + '\0' + env.SUPABASE_KEY).digest('hex');
      const name = `lumiere-preview-${testedSha}-${config}`;
      const results = await api(`actions/workflows/validate.yml/runs?event=pull_request&status=success&head_sha=${head}&per_page=10`);
      for (const run of results.workflow_runs) {
        const files = await api(`actions/runs/${run.id}/artifacts?name=${name}`);
        const match = files.artifacts.find(file => file.name === name && !file.expired);
        if (!match) continue;
        if (stagingLookup) {
          if (!run.pull_requests?.some(pr => pr.number === prNumber && pr.base.ref === 'staging')) continue;
          const jobs = await api(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
          if (!['Application tests', 'Supabase migration and function tests'].every(name =>
            jobs.jobs.some(job => job.name === name && job.conclusion === 'success'))) continue;
          validationRun = run.id;
        } else {
          artifactRun = run.id;
          artifact = match.id;
        }
        break;
      }
    }
    if (previewLookup && !artifact) console.log('No trusted preview artifact. Building the selected revision with the publisher workflows.');
  } catch (error) {
    if (previewLookup) throw error;
    console.log('Validation reuse unavailable. Running staging tests:', error.message);
  }
}
requireValue(/^[0-9a-f]{40}$/.test(sha), 'Invalid resolved commit');
for (const [key, value] of Object.entries({ target, sha, backend, snapshot, head, base, prNumber, artifactRun, artifact, validationRun })) {
  appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
const revisionLabel = snapshot ? 'Snapshot' : 'Revision';
const checks = validationRun ? `- Reusing application and database tests from [run ${validationRun}](${env.GITHUB_SERVER_URL}/${repo}/actions/runs/${validationRun}). Building for staging.\n` : artifact ? `- Reusing validation and build from [run ${artifactRun}](${env.GITHUB_SERVER_URL}/${repo}/actions/runs/${artifactRun}).\n`
  : operation === 'Deploy' ? '- The selected revision will run fresh validation and a Pages build.\n' : '';
appendFileSync(env.GITHUB_STEP_SUMMARY, `### Selected ${target} operation\n\n- Operation: **${operation}**\n- ${revisionLabel}: \`${sha}\`\n${head ? `- PR head: \`${head}\`\n` : ''}${checks}`);
