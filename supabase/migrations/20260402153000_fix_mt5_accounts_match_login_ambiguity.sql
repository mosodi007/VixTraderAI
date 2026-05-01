-- Prevent random account routing when multiple mt5_login values collapse to the same
-- canonical form after stripping leading zeros.
-- Old function used LIMIT 1 and could route many EAs to one account.

CREATE OR REPLACE FUNCTION public.mt5_accounts_match_login(p_login text)
RETURNS SETOF mt5_accounts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH norm AS (
    SELECT trim(coalesce(p_login, '')) AS raw,
           regexp_replace(trim(coalesce(p_login, '')), '^0+', '') AS canon
  ),
  exact AS (
    SELECT a.*
    FROM mt5_accounts a, norm n
    WHERE trim(a.mt5_login) = n.raw
    LIMIT 1
  ),
  canon_matches AS (
    SELECT a.*
    FROM mt5_accounts a, norm n
    WHERE regexp_replace(trim(a.mt5_login), '^0+', '') = n.canon
  ),
  canon_unique AS (
    SELECT *
    FROM canon_matches
    WHERE (SELECT count(*) FROM canon_matches) = 1
  )
  SELECT * FROM exact
  UNION ALL
  SELECT * FROM canon_unique
  WHERE NOT EXISTS (SELECT 1 FROM exact);
$$;

REVOKE ALL ON FUNCTION public.mt5_accounts_match_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mt5_accounts_match_login(text) TO service_role;

