-- Preserve the signature for rolling deployment, but reject every caller-supplied claim.
SET LOCAL search_path=bytes,pg_catalog;
CREATE OR REPLACE FUNCTION login_finish(h text,b text,o text,s text,claim text DEFAULT NULL)
 RETURNS TABLE(account_id text,workspace_id text,destination text) LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=bytes,pg_catalog,pg_temp AS $$
 DECLARE t login_tokens; a text; w text; BEGIN
 IF claim IS NOT NULL OR s!~'^[a-f0-9]{64}$' THEN RETURN; END IF;
 DELETE FROM login_tokens WHERE hash=h AND browser_hash=b AND origin=o AND expires>clock_timestamp() RETURNING * INTO t;
 IF NOT FOUND THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM login_invites WHERE email=t.email AND enabled) THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('email-login:'||t.email,0));
 -- Workspace assignment is administratively prelinked, never accepted from a login form.
 SELECT p.account_id,p.workspace_id INTO a,w FROM provision_identity('https://api.bytesskills.com/email',t.email,gen_random_uuid()::text,gen_random_uuid()::text) p;
 INSERT INTO browser_sessions VALUES(s,a,w,o,clock_timestamp()+interval '7 days');
 RETURN QUERY SELECT a,w,t.destination;
 END $$;
