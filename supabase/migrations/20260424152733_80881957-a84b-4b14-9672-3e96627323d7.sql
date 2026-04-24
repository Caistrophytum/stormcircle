CREATE OR REPLACE FUNCTION public.message_signature(_content text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    string_agg(t, '|' ORDER BY t),
    ''
  )
  FROM (
    SELECT DISTINCT regexp_replace(lower(unnest), '[^a-z0-9]', '', 'g') AS t
    FROM unnest(regexp_split_to_array(lower(_content), '\s+'))
    WHERE length(regexp_replace(lower(unnest), '[^a-z0-9]', '', 'g')) > 0
  ) toks;
$$;