"""Assemble one Pages artifact from the three retained build directories."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys

channels = ('production', 'staging', 'preview')
root_url = 'https://himanshuhd.github.io/lumiere-app/'


def url(channel):
    return root_url if channel == 'production' else f'{root_url}{channel}/'


if sys.argv[1] == '--summary':
    directory, target = Path(sys.argv[2]), sys.argv[3]
    entries = json.loads((directory / 'manifest.json').read_text())
    label = target.capitalize()
    repo = f'{os.environ["GITHUB_SERVER_URL"]}/{os.environ["GITHUB_REPOSITORY"]}'
    lines = [
        f'### {label} published', '', f'[Open {target}]({url(target)})', '',
        '| Environment | Revision | Published by | Status |', '| --- | --- | --- | --- |'
    ]
    for name in channels:
        if name not in entries:
            continue
        entry = entries[name]
        status = 'Expired' if entry.get('status') == 'expired' else 'Available'
        lines.append(f'| [{name.capitalize()}]({url(name)}) | `{entry["sha"]}` | [Run {entry["run"]}]({repo}/actions/runs/{entry["run"]}) | {status} |')
    selected = entries[target]
    if selected.get('head'):
        lines.extend(['', f'PR/source commit for sign-off: `{selected["head"]}`.'])
    if os.environ.get('EXPIRED_PREVIEW'):
        lines.extend(['', f'The [verified preview]({url("preview")}) now shows an expiry notice.'])
    with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a') as summary:
        summary.write('\n'.join(lines) + '\n')
    sys.exit(0)

state, build, site = map(Path, sys.argv[1:4])
target, sha, run = sys.argv[4:7]
if target not in channels:
    raise ValueError('Unknown path')

def digest(root):
    total = hashlib.sha256()
    for path in sorted(root.rglob('*')):
        if path.is_symlink() or any(p.startswith('.') for p in path.relative_to(root).parts):
            raise ValueError('Unexpected link or hidden path in build')
        if path.is_file():
            total.update(path.relative_to(root).as_posix().encode() + b'\0')
            total.update(hashlib.sha256(path.read_bytes()).digest())
    return total.hexdigest()

def record(name, revision, workflow):
    root = state / name
    if not (root / 'index.html').is_file() or not (root / 'auth/callback/index.html').is_file():
        raise ValueError(f'Incomplete {name} build')
    return dict(sha=revision, run=workflow, digest=digest(root))

manifest = state / 'manifest.json'
if manifest.exists():
    entries = json.loads(manifest.read_text())
else:
    seed = Path(os.environ['PAGES_SEED'])
    entries = {}
    shutil.copytree(seed / 'preview', state / 'preview')
    shutil.copytree(seed, state / 'production', ignore=lambda d, names: {'preview'} if Path(d) == seed else set())
    for name, revision in [('production', 'be349afeb10b96aca982344bbcbf55a32eba4a95'),
                           ('preview', '71e483f8ed3dd5ea2acbe37fba647e337e1aed04')]:
        entries[name] = record(name, revision, '45232260842')

    entries['production']['backendBaseline'] = entries['production']['sha']

backend_baseline = entries['production']['backendBaseline']
for name, entry in entries.items():
    if name not in channels or digest(state / name) != entry['digest']:
        raise ValueError(f'Damaged retained build: {name}')
digest(build)
if (state / target).exists():
    shutil.rmtree(state / target)
shutil.copytree(build, state / target)
entries[target] = record(target, sha, run)
if target == 'preview':
    if os.environ.get('SNAPSHOT'):
        recovered = json.loads((Path(os.environ['RUNNER_TEMP']) / 'restore-manifest.json').read_text())[target]
        for key in ('head', 'base', 'pr', 'status', 'expiredBy'):
            if key in recovered:
                entries[target][key] = recovered[key]
    else:
        entries[target]['head'] = os.environ.get('PR_HEAD') or sha
        if os.environ.get('TESTED_BASE'):
            entries[target]['base'] = os.environ['TESTED_BASE']
        if os.environ.get('PR_NUMBER'):
            entries[target]['pr'] = int(os.environ['PR_NUMBER'])

expiry = os.environ.get('EXPIRED_PREVIEW')
if target == 'staging' and expiry:
    details = json.loads(expiry)
    repo = f'{os.environ["GITHUB_SERVER_URL"]}/{os.environ["GITHUB_REPOSITORY"]}'
    links = [f'<a href="{repo}/issues/{int(number)}">Issue #{int(number)}</a>' for number in details['issues']]
    if details.get('pr'):
        pr = int(details['pr'])
        links.insert(0, f'<a href="{repo}/pull/{pr}">Pull request #{pr}</a>')
    template = Path(__file__).with_name('preview-expired.html').read_text()
    message = template.replace('<!-- PREVIEW_REFERENCES -->', '\n    '.join(links))
    directory = state / 'preview'
    shutil.rmtree(directory)
    (directory / 'auth' / 'callback').mkdir(parents=True)
    for relative in ('index.html', 'auth/callback/index.html'):
        (directory / relative).write_text(message)
    entries['preview'].update(status='expired', expiredBy=sha, run=run, digest=digest(directory))

if target == 'production' and not os.environ.get('SNAPSHOT'):
    backend_baseline = sha
entries['production']['backendBaseline'] = backend_baseline
if (state / 'production' / 'lumiere-deployment.json').exists():
    raise ValueError('Reserved deployment marker in production build')
if any((state / 'production' / name).exists() for name in ('preview', 'staging')):
    raise ValueError('Production build collides with a reserved URL')
shutil.copytree(state / 'production', site)
for name in ('preview', 'staging'):
    if name in entries:
        shutil.copytree(state / name, site / name)
manifest.write_text(json.dumps(entries, indent=2, sort_keys=True) + '\n')
