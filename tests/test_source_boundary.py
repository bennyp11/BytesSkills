import json
from pathlib import Path
import subprocess
import tempfile
import unittest

CHECK = Path(__file__).resolve().parents[1] / 'scripts/check-source-boundary.py'

class SourceBoundaryTest(unittest.TestCase):
    def test_forced_workspace_staging_and_disguised_record_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            def git(*args):
                return subprocess.run(['git', *args], cwd=root, check=True, capture_output=True)
            def check():
                return subprocess.run(['python3', str(CHECK)], cwd=root, capture_output=True)
            git('init', '-q')
            (root / 'source.json').write_text('{"name":"fixture"}')
            git('add', 'source.json')
            self.assertEqual(check().returncode, 0)
            (root / '.gitignore').write_text('workspace/\n')
            (root / 'workspace').mkdir()
            (root / 'workspace/private.txt').write_text('fictional data')
            git('add', '-f', 'workspace/private.txt')
            self.assertNotEqual(check().returncode, 0)
            git('rm', '--cached', 'workspace/private.txt')
            (root / 'source.json').write_text(json.dumps({'workspace_id':'fixture', 'record_checksum':'fixture'}))
            git('add', 'source.json')
            self.assertNotEqual(check().returncode, 0)
