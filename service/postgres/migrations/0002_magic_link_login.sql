-- Authentication is a separate privileged adapter, never a runtime table grant.
SET LOCAL search_path=bytes,pg_catalog;
CREATE TABLE login_invites(email text PRIMARY KEY, enabled boolean NOT NULL DEFAULT true);
CREATE TABLE login_rates(key text PRIMARY KEY, started timestamptz NOT NULL, attempts integer NOT NULL);
CREATE TABLE login_tokens(hash text PRIMARY KEY, email text NOT NULL, browser_hash text NOT NULL,
 origin text NOT NULL, destination text NOT NULL, expires timestamptz NOT NULL);
CREATE INDEX login_tokens_expiry ON login_tokens(expires);
CREATE TABLE browser_sessions(hash text PRIMARY KEY, account_id text NOT NULL REFERENCES accounts(id),
 workspace_id text NOT NULL REFERENCES workspace(id), origin text NOT NULL, expires timestamptz NOT NULL);
CREATE INDEX browser_sessions_expiry ON browser_sessions(expires);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['login_invites','login_rates','login_tokens','browser_sessions'] LOOP
  EXECUTE format('ALTER TABLE bytes.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE bytes.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY schema_admin ON bytes.%I TO %I USING(true) WITH CHECK(true)',t,current_user);
 END LOOP;
END $$;
CREATE FUNCTION login_rate(k text, maximum integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=bytes,pg_catalog,pg_temp AS $$
 DECLARE n integer; BEGIN
 INSERT INTO login_rates VALUES(k,clock_timestamp(),1) ON CONFLICT(key) DO UPDATE SET
 attempts=CASE WHEN login_rates.started<clock_timestamp()-interval '15 minutes' THEN 1 ELSE login_rates.attempts+1 END,
 started=CASE WHEN login_rates.started<clock_timestamp()-interval '15 minutes' THEN clock_timestamp() ELSE login_rates.started END
 RETURNING attempts INTO n;
 RETURN n<=maximum;
 END $$;
CREATE FUNCTION login_start(e text,h text,b text,ip text,o text,d text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=bytes,pg_catalog,pg_temp AS $$
 DECLARE allowed boolean; BEGIN
 IF h!~'^[a-f0-9]{64}$' OR b!~'^[a-f0-9]{64}$' OR ip!~'^[a-f0-9]{64}$' OR length(e)>254
 OR e<>lower(trim(e)) OR length(d)>12000 OR NOT (d='/app' OR d LIKE '/authorize?%') THEN RETURN false; END IF;
 -- All callers take rate rows in this order, avoiding deadlocks.
 allowed:=login_rate('global',200);allowed:=login_rate('ip:'||ip,20) AND allowed;
 allowed:=login_rate('email:'||e,3) AND allowed;
 DELETE FROM login_rates WHERE started<clock_timestamp()-interval '1 day';
 DELETE FROM login_tokens WHERE expires<clock_timestamp()-interval '1 day';
 DELETE FROM browser_sessions WHERE expires<clock_timestamp();
 IF NOT allowed OR NOT EXISTS(SELECT 1 FROM login_invites WHERE email=e AND enabled) THEN RETURN false; END IF;
 INSERT INTO login_tokens VALUES(h,e,b,o,d,clock_timestamp()+interval '10 minutes');RETURN true;
 END $$;
CREATE FUNCTION login_finish(h text,b text,o text,s text,claim text DEFAULT NULL)
 RETURNS TABLE(account_id text,workspace_id text,destination text) LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=bytes,pg_catalog,pg_temp AS $$
 DECLARE t login_tokens; a text; w text; BEGIN
 IF s!~'^[a-f0-9]{64}$' THEN RETURN; END IF;
 DELETE FROM login_tokens WHERE hash=h AND browser_hash=b AND origin=o AND expires>clock_timestamp() RETURNING * INTO t;
 IF NOT FOUND THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM login_invites WHERE email=t.email AND enabled) THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('email-login:'||t.email,0));
 IF claim IS NOT NULL THEN
  -- Caller must verify the existing owner credential. Never claim by email alone.
  PERFORM pg_advisory_xact_lock(hashtextextended('legacy-claim',0));
  IF EXISTS(SELECT 1 FROM account_identities WHERE issuer='https://api.bytesskills.com/email' AND subject=t.email)
   OR NOT EXISTS(SELECT 1 FROM accounts ac JOIN workspace_memberships m ON m.account_id=ac.id
     WHERE ac.id='legacy-owner' AND ac.status='unclaimed' AND m.workspace_id=claim AND m.status='active') THEN RETURN; END IF;
  UPDATE accounts SET status='active' WHERE id='legacy-owner';
  INSERT INTO account_identities(issuer,subject,account_id) VALUES('https://api.bytesskills.com/email',t.email,'legacy-owner');
  a:='legacy-owner';w:=claim;
 ELSE
  SELECT p.account_id,p.workspace_id INTO a,w FROM provision_identity('https://api.bytesskills.com/email',t.email,gen_random_uuid()::text,gen_random_uuid()::text) p;
 END IF;
 INSERT INTO browser_sessions VALUES(s,a,w,o,clock_timestamp()+interval '7 days');
 RETURN QUERY SELECT a,w,t.destination;
 END $$;
CREATE FUNCTION login_session(h text,o text) RETURNS TABLE(account_id text,workspace_id text)
 LANGUAGE sql SECURITY DEFINER SET search_path=bytes,pg_catalog,pg_temp AS $$
 SELECT s.account_id,s.workspace_id FROM browser_sessions s JOIN accounts a ON a.id=s.account_id
 JOIN workspace_memberships m ON m.account_id=s.account_id AND m.workspace_id=s.workspace_id
 WHERE s.hash=h AND s.origin=o AND s.expires>clock_timestamp() AND a.status='active' AND m.status='active'
 $$;
CREATE FUNCTION login_logout(h text,o text) RETURNS void LANGUAGE sql SECURITY DEFINER
 SET search_path=bytes,pg_catalog,pg_temp AS $$ DELETE FROM browser_sessions WHERE hash=h AND origin=o $$;
REVOKE ALL ON FUNCTION login_rate(text,integer),login_start(text,text,text,text,text,text),
 login_finish(text,text,text,text,text),login_session(text,text),login_logout(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION login_start(text,text,text,text,text,text),login_finish(text,text,text,text,text),
 login_session(text,text),login_logout(text,text) TO bytes_identity;
