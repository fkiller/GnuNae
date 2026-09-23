#!/usr/bin/env python3
"""Read-only GnuNae handoff checks. Never outputs credential values or raw errors."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys


def run(args, cwd):
    try:
        p = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=40)
        return p.returncode, p.stdout
    except (OSError, subprocess.TimeoutExpired):
        return 127, ''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', default='.')
    parser.add_argument('--github', action='store_true', help='Read GitHub metadata using existing gh login')
    args = parser.parse_args()
    root = Path(args.repo).expanduser().resolve()
    result = {'checked_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'repo_path': str(root), 'read_only': True, 'credential_values_exported': False}
    blockers = []
    if not (root / 'package.json').is_file() or not (root / '.github/workflows').is_dir():
        result['blockers'] = ['Not a GnuNae checkout: package.json or workflows missing']
        print(json.dumps(result, indent=2))
        return 2
    git = ['git', '-c', 'core.fsmonitor=false']
    rc, head = run(git + ['rev-parse', 'HEAD'], root)
    result['head'] = head.strip() if rc == 0 else 'unavailable'
    rc, status = run(git + ['status', '--porcelain'], root)
    result['worktree_dirty'] = bool(status.strip()) if rc == 0 else None
    rc, remote = run(git + ['remote', 'get-url', 'origin'], root)
    result['expected_origin'] = rc == 0 and bool(re.fullmatch(
        r'(?:https://github\.com/|git@github\.com:)fkiller/GnuNae(?:\.git)?', remote.strip(), re.I))
    if not result['expected_origin']:
        blockers.append('Expected fkiller/GnuNae origin not verified')
    rc, node = run(['node', '--version'], root)
    result['node'] = node.strip() if rc == 0 and re.fullmatch(r'v\d+\.\d+\.\d+\s*', node) else 'unavailable'
    if not result['node'].startswith('v22.'):
        blockers.append('Select Node 22 to match CI before installation/build')
    result['tools_present'] = {k: bool(shutil.which(k)) for k in ['git', 'gh', 'node', 'npm', 'docker', 'opencode', 'antigravity']}
    # Parse without shell execution; values are used only for boolean file checks.
    local = {}
    env_file = root / '.env.local'
    try:
        for line in env_file.read_text().splitlines():
            m = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$', line)
            if m:
                local[m[1]] = m[2].strip().strip('\"\'')
    except (OSError, UnicodeError):
        pass
    result['local_env'] = {'file_present': env_file.is_file(),
                           'keys': {k: ('present' if v else 'empty') for k, v in sorted(local.items())}}
    key_id = local.get('ASC_API_KEY_ID', '')
    result['local_files'] = {
        'codex_auth_present': (Path.home() / '.codex/auth.json').is_file(),
        'gh_hosts_config_present': (Path.home() / '.config/gh/hosts.yml').is_file(),
        'matching_asc_p8_present': bool(key_id and re.fullmatch(r'[A-Za-z0-9]+', key_id) and
            (Path.home() / '.appstoreconnect/private_keys' / ('AuthKey_' + key_id + '.p8')).is_file()),
        'signing_validity': 'not tested',
    }
    result['cert_files'] = {}
    for name in ['application.p12', 'installer.p12', 'notappstore.p12', 'GnuNae.provisionprofile']:
        p = root / 'certs' / name
        result['cert_files'][name] = {'present': p.is_file(), 'mode': oct(p.stat().st_mode & 0o777) if p.is_file() else None}
    package = json.loads((root / 'package.json').read_text())
    result['app_version'] = package['version']
    result['codex_pin'] = package.get('devDependencies', {}).get('@openai/codex')
    result['postversion_pushes'] = 'push' in package.get('scripts', {}).get('postversion', '')
    result['github'] = {'checked': False}
    if args.github:
        rc, raw = run(['gh', 'api', 'repos/fkiller/GnuNae', '--jq', '{default_branch,permissions}'], root)
        result['github']['checked'] = True
        result['github']['repo_access'] = rc == 0
        if rc == 0:
            result['github']['repository'] = json.loads(raw)
        else:
            blockers.append('GitHub read access failed: check network, gh login and harness permissions')
        rc, raw = run(['gh', 'secret', 'list', '-R', 'fkiller/GnuNae', '--json', 'name,updatedAt'], root)
        result['github']['secret_metadata_access'] = rc == 0
        if rc == 0:
            names = sorted(x['name'] for x in json.loads(raw))
            refs = set()
            for p in (root / '.github/workflows').glob('*.y*ml'):
                refs.update(re.findall(r'secrets\.([A-Za-z_][A-Za-z0-9_]*)', p.read_text()))
            result['github']['secret_names'] = names
            result['github']['workflow_refs_not_in_repo_secret_list'] = sorted(refs - set(names) - {'GITHUB_TOKEN'})
            result['github']['missing_refs_note'] = 'Optional alternatives may be absent; this is not proof of invalid credentials. Environment/org secrets not included.'
        rc, raw = run(['gh', 'api', 'repos/fkiller/GnuNae/actions/permissions/workflow'], root)
        if rc == 0:
            result['github']['workflow_permissions'] = json.loads(raw)
        rc, raw = run(['gh', 'api', 'repos/fkiller/GnuNae/commits/main', '--jq', '.sha'], root)
        if rc == 0 and re.fullmatch(r'[0-9a-f]{40}\s*', raw):
            result['github']['main_sha'] = raw.strip()
            result['github']['checkout_matches_main'] = raw.strip() == result['head']
    result['blockers'] = blockers
    result['notes'] = ['No credential values, raw command stderr, signing/export, installs, dispatches or repository changes performed.',
                       'Exit 0 means the basic environment checks passed, not that signing or store deployment was validated.',
                       'Dirty worktrees and checkout/main differences require review; missing local signing credentials do not block dependency work.']
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 1 if blockers else 0


if __name__ == '__main__':
    sys.exit(main())
