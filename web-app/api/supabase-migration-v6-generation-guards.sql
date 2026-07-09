-- Tack migration v6: atomic generation entitlements and anonymous abuse protection.
-- Run once in the Supabase SQL editor before deploying the matching API code.

CREATE TABLE IF NOT EXISTS public.generation_reservations (
  request_id    UUID PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_key TEXT,
  status        TEXT NOT NULL CHECK (status IN ('reserved', 'completed', 'released')),
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CHECK ((user_id IS NOT NULL) <> (anonymous_key IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.anonymous_generation_limits (
  key_hash   TEXT PRIMARY KEY,
  used       INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  reset_at   TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.generation_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymous_generation_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS generation_reservations_created_at_idx
  ON public.generation_reservations (created_at);

CREATE OR REPLACE FUNCTION public.reserve_user_generation(p_user_id UUID, p_request_id UUID)
RETURNS TABLE (
  allowed BOOLEAN,
  current_plan TEXT,
  lifetime_used INTEGER,
  monthly_used INTEGER,
  monthly_limit INTEGER,
  resets_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  profile public.user_profiles%ROWTYPE;
  normalized_plan TEXT;
  plan_limit INTEGER;
BEGIN
  SELECT * INTO profile
  FROM public.user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'free'::TEXT, 0, 0, 3, NULL::TIMESTAMP WITH TIME ZONE;
    RETURN;
  END IF;

  normalized_plan := CASE
    WHEN LOWER(profile.plan) IN ('studio', 'unlimited') THEN 'studio'
    WHEN LOWER(profile.plan) = 'pro' THEN 'pro'
    ELSE 'free'
  END;
  plan_limit := CASE normalized_plan WHEN 'studio' THEN 600 WHEN 'pro' THEN 120 ELSE 3 END;

  IF profile.monthly_reset_at IS NULL OR profile.monthly_reset_at <= NOW() THEN
    profile.monthly_generations := 0;
    profile.monthly_reset_at := NOW() + INTERVAL '30 days';
    UPDATE public.user_profiles
    SET monthly_generations = 0, monthly_reset_at = profile.monthly_reset_at
    WHERE id = p_user_id;
  END IF;

  IF profile.monthly_generations >= plan_limit THEN
    RETURN QUERY SELECT FALSE, normalized_plan, profile.generations_used,
      profile.monthly_generations, plan_limit, profile.monthly_reset_at;
    RETURN;
  END IF;

  INSERT INTO public.generation_reservations (request_id, user_id, status)
  VALUES (p_request_id, p_user_id, 'reserved');

  UPDATE public.user_profiles
  SET generations_used = generations_used + 1,
      monthly_generations = monthly_generations + 1
  WHERE id = p_user_id
  RETURNING generations_used, monthly_generations, monthly_reset_at
  INTO profile.generations_used, profile.monthly_generations, profile.monthly_reset_at;

  RETURN QUERY SELECT TRUE, normalized_plan, profile.generations_used,
    profile.monthly_generations, plan_limit, profile.monthly_reset_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.reserve_anonymous_generation(p_key_hash TEXT, p_request_id UUID)
RETURNS TABLE (allowed BOOLEAN, used INTEGER, monthly_limit INTEGER, resets_at TIMESTAMP WITH TIME ZONE) AS $$
DECLARE
  limit_row public.anonymous_generation_limits%ROWTYPE;
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

  IF limit_row.used >= 3 THEN
    UPDATE public.anonymous_generation_limits
    SET used = limit_row.used, reset_at = limit_row.reset_at, updated_at = NOW()
    WHERE key_hash = p_key_hash;
    RETURN QUERY SELECT FALSE, limit_row.used, 3, limit_row.reset_at;
    RETURN;
  END IF;

  INSERT INTO public.generation_reservations (request_id, anonymous_key, status)
  VALUES (p_request_id, p_key_hash, 'reserved');

  UPDATE public.anonymous_generation_limits
  SET used = limit_row.used + 1, reset_at = limit_row.reset_at, updated_at = NOW()
  WHERE key_hash = p_key_hash;

  RETURN QUERY SELECT TRUE, limit_row.used + 1, 3, limit_row.reset_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.complete_generation_reservation(p_request_id UUID)
RETURNS VOID AS $$
  UPDATE public.generation_reservations
  SET status = 'completed', updated_at = NOW()
  WHERE request_id = p_request_id AND status = 'reserved';
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.release_generation_reservation(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
  reservation public.generation_reservations%ROWTYPE;
BEGIN
  SELECT * INTO reservation
  FROM public.generation_reservations
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR reservation.status <> 'reserved' THEN RETURN; END IF;

  IF reservation.user_id IS NOT NULL THEN
    UPDATE public.user_profiles
    SET generations_used = GREATEST(0, generations_used - 1),
        monthly_generations = GREATEST(0, monthly_generations - 1)
    WHERE id = reservation.user_id;
  ELSE
    UPDATE public.anonymous_generation_limits
    SET used = GREATEST(0, used - 1), updated_at = NOW()
    WHERE key_hash = reservation.anonymous_key;
  END IF;

  UPDATE public.generation_reservations
  SET status = 'released', updated_at = NOW()
  WHERE request_id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON TABLE public.generation_reservations FROM anon, authenticated;
REVOKE ALL ON TABLE public.anonymous_generation_limits FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_user_generation(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_anonymous_generation(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_generation_reservation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_generation_reservation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_user_generation(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_anonymous_generation(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_generation_reservation(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_generation_reservation(UUID) TO service_role;
