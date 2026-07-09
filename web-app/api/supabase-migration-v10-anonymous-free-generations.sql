-- Tack migration v10: raise signed-out monthly generation allowance from 1 to 3.
-- Run before or alongside the matching API/client deployment so the server-side
-- anonymous guard and product copy use the same entitlement.

CREATE OR REPLACE FUNCTION public.reserve_anonymous_generation(p_key_hash TEXT, p_request_id UUID)
RETURNS TABLE (allowed BOOLEAN, used INTEGER, monthly_limit INTEGER, resets_at TIMESTAMP WITH TIME ZONE) AS $$
DECLARE
  limit_row public.anonymous_generation_limits%ROWTYPE;
  anonymous_limit CONSTANT INTEGER := 3;
BEGIN
  INSERT INTO public.anonymous_generation_limits (key_hash, used, reset_at)
  VALUES (p_key_hash, 0, NOW() + INTERVAL '30 days')
  ON CONFLICT (key_hash) DO NOTHING;

  SELECT * INTO limit_row
  FROM public.anonymous_generation_limits
  WHERE key_hash = p_key_hash
  FOR UPDATE;

  IF limit_row.reset_at <= NOW() THEN
    limit_row.used := 0;
    limit_row.reset_at := NOW() + INTERVAL '30 days';
  END IF;

  IF limit_row.used >= anonymous_limit THEN
    UPDATE public.anonymous_generation_limits
    SET used = limit_row.used, reset_at = limit_row.reset_at, updated_at = NOW()
    WHERE key_hash = p_key_hash;
    RETURN QUERY SELECT FALSE, limit_row.used, anonymous_limit, limit_row.reset_at;
    RETURN;
  END IF;

  INSERT INTO public.generation_reservations (request_id, anonymous_key, status)
  VALUES (p_request_id, p_key_hash, 'reserved');

  UPDATE public.anonymous_generation_limits
  SET used = limit_row.used + 1, reset_at = limit_row.reset_at, updated_at = NOW()
  WHERE key_hash = p_key_hash;

  RETURN QUERY SELECT TRUE, limit_row.used + 1, anonymous_limit, limit_row.reset_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.reserve_anonymous_generation(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_anonymous_generation(TEXT, UUID) TO service_role;
