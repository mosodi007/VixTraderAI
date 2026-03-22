-- Resolve mt5_accounts row when EA sends login without leading zeros but DB stores with zeros (or vice versa).
CREATE OR REPLACE FUNCTION public.mt5_accounts_match_login(p_login text)
RETURNS SETOF mt5_accounts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM mt5_accounts
  WHERE trim(mt5_login) = trim(p_login)
     OR regexp_replace(trim(mt5_login), '^0+', '') = regexp_replace(trim(p_login), '^0+', '')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.mt5_accounts_match_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mt5_accounts_match_login(text) TO service_role;
