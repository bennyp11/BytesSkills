"""Generate fictional import fixtures; never read a user's workspace."""
import base64
import importlib.util
import json
from pathlib import Path
import tempfile

module = Path(__file__).resolve().parents[1] / 'plugins/bytesskills-core/skills/bytes/scripts/artifacts.py'
spec = importlib.util.spec_from_file_location('artifacts', module)
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)
with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    (root / 'workspace.json').write_text(json.dumps({'id': 'acc3351e-d092-433c-a7e1-8fc3e807ebd4'}))
    store = a.Store(root)
    c = store.save({'type': 'concept', 'title': 'Fictional import example', 'text': 'First example'})
    h = store.save({'type': 'hook', 'title': 'Example opening', 'text': 'Example hook', 'relations': {'inputs': [c['pointer']]}})
    v2 = store.save({'pointer': c['pointer'], 'expected_revision': 1, 'text': 'Revised example'})
    print(json.dumps([{'record': r, 'content': base64.b64encode((root / r['content']['key']).read_bytes()).decode()} for r in [h, v2, c]]))
