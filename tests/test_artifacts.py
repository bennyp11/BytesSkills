import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import uuid

MODULE=Path(__file__).resolve().parents[1]/'plugins/bytesskills-core/skills/bytes/scripts/artifacts.py'
spec=importlib.util.spec_from_file_location('artifacts',MODULE)
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)

class ArtifactsTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        (self.root/'workspace.json').write_text(json.dumps({'id':str(uuid.uuid4())}))
        self.s=a.Store(self.root)
    def tearDown(self): self.temp.cleanup()
    def concept(self,**kw):
        return self.s.save(dict(type='concept',title='Token spending',text='Expensive subscription savings',**kw))
    def test_revision_pinning_and_stale_write(self):
        c=self.concept()
        h=self.s.save({'type':'hook','title':'Opening','text':'Hello','relations':{'inputs':[c['pointer'].split(':')[0]]}})
        v2=self.s.save({'pointer':c['pointer'],'expected_revision':1,'text':'New version'})
        self.assertEqual(v2['revision'],2)
        self.assertEqual(self.s.get(h['pointer'])['relations']['inputs'],[c['pointer']])
        self.assertEqual(self.s.get(c['pointer'],True)['text'],'Expensive subscription savings')
        with self.assertRaises(a.StoreError): self.s.save({'pointer':c['pointer'],'expected_revision':1,'text':'Stale'})
    def test_prefix_and_query_pagination(self):
        first=self.concept(tags=['share'],settings={'format':'troll'})
        self.concept(tags=['share'],settings={'format':'troll'})
        self.concept(tags=['comment'])
        prefix='@concept/'+first['id'][:8]
        self.assertEqual(self.s.resolve(prefix)['id'],first['id'])
        page=self.s.query(fmt='troll',tag='share',text='subscription',limit=1)
        nextpage=self.s.query(fmt='troll',tag='share',text='subscription',limit=1,after=page['next_cursor'])
        self.assertEqual(len(nextpage['items']),1)
        self.assertNotEqual(page['items'][0]['id'],nextpage['items'][0]['id'])
    def test_parent_cycle(self):
        parent=self.concept();child=self.concept(parent=parent['pointer'])
        with self.assertRaises(a.StoreError):
            self.s.save({'pointer':parent['pointer'],'expected_revision':1,'parent':child['pointer']})
        self.assertEqual(len(self.s.query(parent=parent['pointer'])['items']),1)
    def test_archive_and_restore(self):
        rec=self.concept();arc=self.s.save({'pointer':rec['pointer'],'expected_revision':1,'status':'archived'})
        self.assertEqual(self.s.query()['items'],[])
        self.assertEqual(self.s.get(arc['pointer'],True)['text'],'Expensive subscription savings')
        self.assertEqual(len(self.s.history(arc['pointer'])),2)
    def test_rebuild_after_cache_deletion(self):
        rec=self.concept();self.s.dbfile.unlink()
        self.assertEqual(self.s.get(rec['pointer'])['title'],'Token spending')
        self.assertEqual(self.s.reindex()['artifacts'],1)
    def test_corruption_fails_closed(self):
        rec=self.concept();self.s.objects.path(rec['content']['key']).write_text('tampered')
        with self.assertRaises(a.StoreError): self.s.reindex()
        with self.assertRaises(a.StoreError): self.s.query()
    def test_unknown_or_dangling_input_no_artifact(self):
        with self.assertRaises(a.StoreError): self.concept(relations={'inputs':['@concept/12345678']})
        self.assertEqual(self.s.query()['items'],[])
        with self.assertRaises(a.StoreError): self.concept(unexpected='bad')
    def test_relocation_and_dedup(self):
        first=self.concept();second=self.concept()
        self.assertEqual(first['content']['key'],second['content']['key'])
        target=self.root/'relocated';target.mkdir()
        import shutil
        for name in ['records','blobs','workspace.json']:
            src=self.root/name
            shutil.copytree(src,target/name) if src.is_dir() else shutil.copy2(src,target/name)
        moved=a.Store(target)
        self.assertEqual(moved.get(first['pointer'],True)['text'],'Expensive subscription savings')
    def test_reverse_relations(self):
        rec=self.concept();hook=self.s.save({'type':'hook','title':'Hook','text':'Text','relations':{'inputs':[rec['pointer']]}})
        self.assertEqual(self.s.related(rec['pointer'])[0]['source'],hook['pointer'])
    def test_interrupted_publication_recovery(self):
        from unittest.mock import patch
        self.s.ensure_index()
        with patch.object(self.s, 'index_record', side_effect=RuntimeError('interrupted')):
            with self.assertRaises(RuntimeError): self.concept()
        with self.assertRaises(a.StoreError): self.s.query()
        self.assertEqual(self.s.reindex()['artifacts'],1)
        self.assertEqual(len(self.s.query()['items']),1)
    def test_metadata_revision_rejects_corrupt_content(self):
        rec=self.concept()
        self.s.objects.path(rec['content']['key']).write_text('tampered')
        with self.assertRaises(a.StoreError):
            self.s.save({'pointer':rec['pointer'],'expected_revision':1,'status':'selected'})
    def test_lock_and_immutable_storage(self):
        self.s.ensure_index()
        with self.s.lock():
            with self.assertRaises(a.StoreError): self.concept()
        self.s.objects.put_once('blobs/test',b'first')
        with self.assertRaises(a.StoreError):self.s.objects.put_once('blobs/test',b'other')
        with self.assertRaises(a.StoreError):self.s.objects.path('../outside')

if __name__=='__main__':unittest.main()
