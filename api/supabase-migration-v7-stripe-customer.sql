-- Tack migration v7: stable Stripe customer linkage for billing portal access.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_stripe_customer_id_idx
  ON public.user_profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
