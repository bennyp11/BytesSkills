#!/usr/bin/env python3
"""BytesSkills local artifact store. Standard library only; JSON in/out."""
import argparse
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import tempfile
import uuid

REGISTRY = json.loads((Path(__file__).resolve().parents[1] / 'contracts/runtime.json').read_text())
TYPES = set(REGISTRY['artifact_types'])
STATUSES = set(REGISTRY['statuses'])
PTR = re.compile(r'^@([a-z]+)/([0-9a-f-]{8,36})(?::v([1-9][0-9]*))?$')

class StoreError(ValueError):
    pass

def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()

def digest(data):
    return hashlib.sha256(data).hexdigest()

def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat()

class LocalObjects:
    """Storage boundary: callers use keys, not absolute locations."""
    def __init__(self, root):
        self.root = root

    def path(self, key):
        if not isinstance(key, str) or not key or key.startswith('/') or '..' in key.split('/'):
            raise StoreError('Invalid storage key')
        p = (self.root / key).resolve()
        if not p.is_relative_to(self.root.resolve()):
            raise StoreError('Storage key escapes workspace')
        return p

    def read(self, key):
        return self.path(key).read_bytes()

    def put_once(self, key, data):
        p = self.path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        if p.exists():
            if p.read_bytes() != data:
                raise StoreError('Immutable object conflict: ' + key)
            return
        fd, name = tempfile.mkstemp(dir=p.parent, prefix='.staging-')
        try:
            with os.fdopen(fd, 'wb') as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            try:
                os.link(name, p)  # Publish complete bytes, without overwrite.
            except FileExistsError:
                if p.read_bytes() != data:
                    raise StoreError('Concurrent object conflict: ' + key)
        finally:
            os.unlink(name)

class Store:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.objects = LocalObjects(self.root)
        try:
            metadata = json.loads((self.root / 'workspace.json').read_text())
            self.workspace = metadata['id']
            self.remote = isinstance(metadata.get('storage'), dict) and metadata['storage'].get('mode') == 'remote'
            uuid.UUID(self.workspace)
        except (OSError, KeyError, ValueError) as exc:
            raise StoreError('Select a workspace with a valid workspace.json ID') from exc
        self.cache = self.root / '.index'
        self.cache.mkdir(exist_ok=True)
        self.dbfile = self.cache / 'artifacts.sqlite'

    @contextlib.contextmanager
    def lock(self):
        path = self.cache / 'writer.lock'
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            raise StoreError('Workspace writer lock exists; check active writer before recovering it')
        try:
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            yield
        finally:
            path.unlink()

    @contextlib.contextmanager
    def connect(self):
        c = sqlite3.connect(self.dbfile)
        try:
            c.row_factory = sqlite3.Row
            c.executescript('''
            CREATE TABLE IF NOT EXISTS revisions (
              id TEXT, type TEXT, revision INTEGER, pointer TEXT UNIQUE, record TEXT,
              PRIMARY KEY(type,id,revision));
            CREATE TABLE IF NOT EXISTS current (
              id TEXT PRIMARY KEY, type TEXT, revision INTEGER, title TEXT,
              status TEXT, format TEXT, parent TEXT, pointer TEXT, updated TEXT);
            CREATE INDEX IF NOT EXISTS current_filter ON current(type,status,format,id);
            CREATE INDEX IF NOT EXISTS current_parent ON current(parent,id);
            CREATE TABLE IF NOT EXISTS tags (id TEXT, tag TEXT, PRIMARY KEY(id,tag));
            CREATE INDEX IF NOT EXISTS tag_lookup ON tags(tag,id);
            CREATE TABLE IF NOT EXISTS edges (source TEXT, kind TEXT, target TEXT,
              PRIMARY KEY(source,kind,target));
            CREATE INDEX IF NOT EXISTS target_lookup ON edges(target,kind,source);
            CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(id UNINDEXED,title,body);
            ''')
            with c:
                yield c
        finally:
            c.close()

    def ensure_index(self):
        if (self.cache / 'dirty').exists():
            raise StoreError('Index needs recovery: run reindex')
        if not self.dbfile.exists():
            self.reindex()

    def resolve(self, pointer):
        self.ensure_index()
        m = PTR.fullmatch(pointer) if isinstance(pointer, str) else None
        if not m or m[1] not in TYPES:
            raise StoreError('Expected @type/UUID-or-unique-prefix[:vN]')
        with self.connect() as c:
            ids = c.execute('SELECT id FROM current WHERE type=? AND id LIKE ?', (m[1], m[2]+'%')).fetchall()
            if len(ids) != 1:
                raise StoreError('Pointer is missing or ambiguous: ' + pointer)
            query = 'SELECT record FROM revisions WHERE type=? AND id=?'
            args = [m[1], ids[0]['id']]
            if m[3]:
                query += ' AND revision=?'; args.append(int(m[3]))
            query += ' ORDER BY revision DESC LIMIT 1'
            row = c.execute(query, args).fetchone()
        if row is None:
            raise StoreError('Revision not found: ' + pointer)
        rec = json.loads(row['record'])
        # The index is a cache, never the content authority.
        actual = json.loads(self.objects.read(rec['record_key']))
        if actual != rec:
            raise StoreError('Record/index mismatch; reindex after resolving external changes')
        return rec

    def get(self, pointer, content=False):
        rec = self.resolve(pointer)
        if content:
            data = self.objects.read(rec['content']['key'])
            if digest(data) != rec['content']['sha256']:
                raise StoreError('Content checksum mismatch')
            if rec['content']['media_type'].startswith('text/'):
                rec = dict(rec, text=data.decode('utf-8'))
            else:
                rec = dict(rec, local_file=str(self.objects.path(rec['content']['key'])))
        return rec

    def index_record(self, c, rec):
        c.execute('INSERT INTO revisions VALUES (?,?,?,?,?)',
                  (rec['id'],rec['type'],rec['revision'],rec['pointer'],canonical(rec).decode()))
        c.execute('DELETE FROM tags WHERE id=?',(rec['id'],))
        c.execute('DELETE FROM search WHERE id=?',(rec['id'],))
        c.execute('INSERT OR REPLACE INTO current VALUES (?,?,?,?,?,?,?,?,?)',
                  (rec['id'],rec['type'],rec['revision'],rec['title'],rec['status'],
                   rec['settings'].get('format'),rec['parent'],rec['pointer'],rec['created_at']))
        for tag in rec['tags']:
            c.execute('INSERT INTO tags VALUES (?,?)',(rec['id'],tag))
        body = self.objects.read(rec['content']['key']).decode('utf-8') if rec['content']['media_type'].startswith('text/') else ''
        c.execute('INSERT INTO search VALUES (?,?,?)',(rec['id'],rec['title'],body))
        for kind, targets in rec['relations'].items():
            for target in targets:
                c.execute('INSERT INTO edges VALUES (?,?,?)',(rec['pointer'],kind,target))

    def save(self, req):
        if self.remote:
            raise StoreError("Remote workspace mirror is read-only; save through the shared service")
        self.ensure_index()
        with self.lock():
            allowed={'type','title','text','file','media_type','pointer','expected_revision',
                     'status','tags','settings','parent','relations','provenance'}
            if not isinstance(req,dict) or set(req)-allowed:
                raise StoreError('Unknown save fields')
            old = self.resolve(req['pointer']) if req.get('pointer') else None
            if old:
                latest = self.resolve('@'+old['type']+'/'+old['id'])
                if req.get('expected_revision') != latest['revision'] or old['revision'] != latest['revision']:
                    raise StoreError('Revision conflict: reread latest; do not overwrite newer work')
            typ = req.get('type', old['type'] if old else None)
            if typ not in TYPES or (old and typ != old['type']):
                raise StoreError('Unsupported or changed artifact type')
            title = req.get('title',old['title'] if old else None)
            if not isinstance(title,str) or not title.strip(): raise StoreError('title is required')
            status = req.get('status',old['status'] if old else 'draft')
            if status not in STATUSES: raise StoreError('Unknown status')
            tags = req.get('tags',old['tags'] if old else [])
            if not isinstance(tags,list) or any(not isinstance(t,str) for t in tags): raise StoreError('tags must be strings')
            settings = req.get('settings',old['settings'] if old else {})
            provenance = req.get('provenance',old['provenance'] if old else {})
            if not isinstance(settings,dict) or not isinstance(provenance,dict): raise StoreError('settings/provenance must be objects')
            if 'format' in settings and not isinstance(settings['format'],str): raise StoreError('settings.format must be a string')
            ident = old['id'] if old else str(uuid.uuid4())
            parent = req.get('parent',old['parent'] if old else None)
            if parent:
                par = self.resolve(parent)
                if typ!='concept' or par['type']!='concept': raise StoreError('Only concepts have concept parents')
                parent = '@concept/'+par['id']
                seen={ident}
                while par:
                    if par['id'] in seen: raise StoreError('Parent cycle')
                    seen.add(par['id'])
                    par = self.resolve(par['parent']) if par['parent'] else None
            rels = req.get('relations',old['relations'] if old else {})
            if not isinstance(rels,dict) or set(rels)-{'derived_from','inputs','links','outputs'}:
                raise StoreError('Unknown relation kind')
            pinned={}
            for kind, pointers in rels.items():
                if not isinstance(pointers,list): raise StoreError('Relations require pointer lists')
                pinned[kind]=list(dict.fromkeys(self.resolve(p)['pointer'] for p in pointers))
            if 'text' in req and 'file' in req: raise StoreError('Choose text or file, not both')
            if 'text' in req:
                if not isinstance(req['text'],str): raise StoreError('text must be a string')
                data=req['text'].encode(); media='text/markdown'
            elif 'file' in req:
                data=Path(req['file']).read_bytes(); media=req.get('media_type','application/octet-stream')
            elif old:
                data=self.objects.read(old['content']['key']); media=old['content']['media_type']
                if digest(data) != old['content']['sha256']:
                    raise StoreError('Content checksum mismatch')
            else: raise StoreError('text or file is required')
            if not isinstance(media,str) or '/' not in media: raise StoreError('Invalid media type')
            if media.startswith('text/'): data.decode('utf-8')
            sha=digest(data); blobkey='blobs/sha256/'+sha[:2]+'/'+sha
            revision=old['revision']+1 if old else 1
            key=f'records/{typ}/{ident}/v{revision:08d}.json'
            rec={'schema_version':1,'workspace_id':self.workspace,'type':typ,'id':ident,
                 'revision':revision,'pointer':f'@{typ}/{ident}:v{revision}',
                 'previous_checksum':old['record_checksum'] if old else None,
                 'title':title,'status':status,'tags':sorted(set(tags)),'settings':settings,
                 'parent':parent,'relations':pinned,'provenance':provenance,'created_at':stamp(),
                 'record_key':key,'content':{'key':blobkey,'sha256':sha,'bytes':len(data),'media_type':media}}
            rec['record_checksum']=digest(canonical(rec))
            (self.cache/'dirty').write_text('reindex required if interrupted\n')
            self.objects.put_once(blobkey,data)
            self.objects.put_once(key,canonical(rec)+b'\n')
            with self.connect() as c: self.index_record(c,rec)
            (self.cache/'dirty').unlink()
            return rec

    def reindex(self):
        with self.lock():
            (self.cache/'dirty').write_text('reindex in progress\n')
            records=[]; previous={}; allptr=set()
            for p in sorted((self.root/'records').glob('*/*/v*.json')):
                rec=json.loads(p.read_text()); check=dict(rec); checksum=check.pop('record_checksum')
                if rec['schema_version']!=1 or rec['workspace_id']!=self.workspace or digest(canonical(check))!=checksum:
                    raise StoreError('Invalid schema, workspace or checksum: '+str(p))
                if rec['type'] not in TYPES or rec['status'] not in STATUSES: raise StoreError('Invalid record type/status')
                uuid.UUID(rec['id'])
                if rec['record_key']!=p.relative_to(self.root).as_posix(): raise StoreError('Record key mismatch')
                if rec['pointer']!=f"@{rec['type']}/{rec['id']}:v{rec['revision']}": raise StoreError('Pointer mismatch')
                blob=self.objects.read(rec['content']['key'])
                if digest(blob)!=rec['content']['sha256'] or len(blob)!=rec['content']['bytes']: raise StoreError('Blob checksum mismatch')
                identity=(rec['type'],rec['id']); old=previous.get(identity)
                if rec['revision']!=(old['revision']+1 if old else 1) or rec['previous_checksum']!=(old['record_checksum'] if old else None):
                    raise StoreError('Broken revision chain')
                previous[identity]=rec;allptr.add(rec['pointer']);records.append(rec)
            heads={'@'+t+'/'+i:rec for (t,i),rec in previous.items()}
            for rec in records:
                for targets in rec['relations'].values():
                    if any(t not in allptr for t in targets): raise StoreError('Dangling relation')
                if rec['parent'] and (rec['type']!='concept' or rec['parent'] not in heads or not rec['parent'].startswith('@concept/')): raise StoreError('Invalid parent')
            for ptr in heads:
                seen=set(); cursor=ptr
                while cursor:
                    if cursor in seen: raise StoreError('Parent cycle')
                    seen.add(cursor);cursor=heads[cursor]['parent']
            with self.connect() as c:
                for table in ['revisions','current','tags','edges','search']: c.execute('DELETE FROM '+table)
                for rec in records: self.index_record(c,rec)
            (self.cache/'dirty').unlink(missing_ok=True)
            return {'records':len(records),'artifacts':len(heads),'integrity':'verified'}

    def query(self, typ=None, status=None, fmt=None, tag=None, parent=None, text=None, after=None, limit=20):
        self.ensure_index()
        if not 1<=limit<=100: raise StoreError('limit must be 1..100')
        terms=[];args=[]
        for col,val in [('type',typ),('status',status),('format',fmt)]:
            if val: terms.append('c.'+col+'=?');args.append(val)
        if not status: terms.append("c.status != 'archived'")
        if parent:
            rec=self.resolve(parent);terms.append('c.parent=?');args.append('@'+rec['type']+'/'+rec['id'])
        if tag: terms.append('c.id IN (SELECT id FROM tags WHERE tag=?)');args.append(tag)
        if text:
            words=re.findall(r'\w+',text)
            if not words: raise StoreError('Search needs words')
            terms.append('c.id IN (SELECT id FROM search WHERE search MATCH ?)');args.append(' AND '.join('"'+w+'"' for w in words))
        if after: terms.append('c.id>?');args.append(after)
        with self.connect() as c:
            rows=c.execute('SELECT c.* FROM current c'+(' WHERE '+' AND '.join(terms) if terms else '')+' ORDER BY c.id LIMIT ?',args+[limit+1]).fetchall()
        return {'items':[dict(x) for x in rows[:limit]],'next_cursor':rows[limit-1]['id'] if len(rows)>limit else None}

    def history(self,pointer):
        rec=self.resolve(pointer)
        with self.connect() as c:
            return [json.loads(x['record']) for x in c.execute('SELECT record FROM revisions WHERE type=? AND id=? ORDER BY revision',(rec['type'],rec['id']))]

    def related(self,pointer):
        rec=self.resolve(pointer)
        with self.connect() as c:
            return [dict(x) for x in c.execute('SELECT * FROM edges WHERE target=? ORDER BY source,kind',(rec['pointer'],))]

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--workspace',required=True)
    sub=p.add_subparsers(dest='command',required=True)
    save=sub.add_parser('save');save.add_argument('--request',required=True,help='JSON file; explicit expected_revision required for updates')
    for name in ['get','history','related']:
        cmd=sub.add_parser(name);cmd.add_argument('pointer')
        if name=='get':cmd.add_argument('--content',action='store_true')
    sub.add_parser('reindex')
    q=sub.add_parser('query')
    for flag in ['type','status','format','tag','parent','text','after']:q.add_argument('--'+flag)
    q.add_argument('--limit',type=int,default=20)
    a=p.parse_args()
    try:
        store=Store(a.workspace)
        if a.command=='save':out=store.save(json.loads(Path(a.request).read_text()))
        elif a.command=='get':out=store.get(a.pointer,a.content)
        elif a.command=='query':out=store.query(a.type,a.status,a.format,a.tag,a.parent,a.text,a.after,a.limit)
        else:out=getattr(store,a.command)(a.pointer) if hasattr(a,'pointer') else store.reindex()
        print(json.dumps(out,indent=2,ensure_ascii=False))
    except (StoreError,OSError,ValueError,KeyError,sqlite3.Error) as exc:
        p.exit(1,json.dumps({'error':str(exc)})+'\n')

if __name__=='__main__':main()
