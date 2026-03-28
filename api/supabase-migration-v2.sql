-- ── PinStyle AI — Migration v2: Monthly generation tracking + Unlimited plan ──
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Add monthly tracking columns to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS monthly_generations  INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_reset_at     TIMESTAMP WITH TIME ZONE;

-- 2. Update the plan column comment to reflect new values
-- plan is now: 'free' | 'pro' | 'unlimited'
COMMENT ON COLUMN public.user_profiles.plan IS 'free | pro | unlimited';

-- 3. Replace increment function — now also tracks monthly usage and auto-resets
CREATE OR REPLACE FUNCTION public.increment_generations(user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.user_profiles
  SET
    -- Always increment lifetime total
    generations_used    = generations_used + 1,

    -- Increment monthly counter, or reset to 1 if period has elapsed
    monthly_generations = CASE
      WHEN monthly_reset_at IS NULL OR monthly_reset_at <= NOW() THEN 1
      ELSE monthly_generations + 1
    END,

    -- Set next reset date if starting a new period
    monthly_reset_at    = CASE
      WHEN monthly_reset_at IS NULL OR monthly_reset_at <= NOW() THEN NOW() + INTERVAL '30 days'
      ELSE monthly_reset_at
    END

  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
