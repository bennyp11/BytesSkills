"""Create a deterministic plugin archive from tracked source only."""
import json
from pathlib import Path
import subprocess
import sys
import zipfile

version, output = sys.argv[1:]
root = Path('..').resolve()
prefix = 'plugins/bytesskills-core/'
paths = subprocess.check_output(['git', 'ls-files', '-z', prefix], cwd=root).decode().split('\0')
with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(filter(None, paths)):
        source = root / path
        if source.is_symlink():
            raise ValueError('Plugin symlinks are not permitted')
        rel = path[len(prefix):]
        data = source.read_bytes()
        if rel in ('plugin.json', '.claude-plugin/plugin.json'):
            manifest = json.loads(data)
            manifest['version'] = version
            data = (json.dumps(manifest, indent=2) + '\n').encode()
        info = zipfile.ZipInfo(rel, date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, data)
