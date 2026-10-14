-- Preserve authenticated artifact deep links through magic-link sign-in.
-- Keep invitation, rate limiting and token rules unchanged.
SET search_path=bytes,pg_catalog;
CREATE OR REPLACE FUNCTION login_start(e text,h text,b text,ip text,o text,d text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=bytes,pg_catalog,pg_temp AS $$
 DECLARE allowed boolean; BEGIN
 IF h!~'^[a-f0-9]{64}$' OR b!~'^[a-f0-9]{64}$' OR ip!~'^[a-f0-9]{64}$' OR length(e)>254
 OR e<>lower(trim(e)) OR length(d)>12000 OR NOT (d='/app' OR d LIKE '/app?%' OR d LIKE '/app/artifact?%' OR d LIKE '/authorize?%') THEN RETURN false; END IF;
 -- All callers take rate rows in this order, avoiding deadlocks.
 allowed:=login_rate('global',200);allowed:=login_rate('ip:'||ip,20) AND allowed;
 allowed:=login_rate('email:'||e,3) AND allowed;
 DELETE FROM login_rates WHERE started<clock_timestamp()-interval '1 day';
 DELETE FROM login_tokens WHERE expires<clock_timestamp()-interval '1 day';
 DELETE FROM browser_sessions WHERE expires<clock_timestamp();
 IF NOT allowed OR NOT EXISTS(SELECT 1 FROM login_invites WHERE email=e AND enabled) THEN RETURN false; END IF;
 INSERT INTO login_tokens VALUES(h,e,b,o,d,clock_timestamp()+interval '10 minutes');RETURN true;
 END $$;
