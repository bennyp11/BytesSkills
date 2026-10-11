"""Reject tracked private workspace paths/records; inspect the staged Git tree."""
import json
from pathlib import PurePosixPath
import subprocess
import sys

paths = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
errors = []
for path in filter(None, paths):
    parts = PurePosixPath(path).parts
    if any(p in {'workspace', 'backups', 'exports', '.secrets', '.index'} for p in parts) or PurePosixPath(path).name in {'workspace.json', 'export-receipt.json', 'live-verification.json', 'release-verification.json'}:
        errors.append(path)
        continue
    if path.endswith('.json'):
        try:
            data = json.loads(subprocess.check_output(['git', 'show', ':' + path], stderr=subprocess.DEVNULL))
        except (ValueError, subprocess.CalledProcessError):
            continue
        if isinstance(data, dict) and 'workspace_id' in data and 'record_checksum' in data:
            errors.append(path)
if errors:
    sys.exit('Private workspace state must not be tracked:\n' + '\n'.join(errors))
print('Source boundary passed: no tracked workspace records or private export paths.')
