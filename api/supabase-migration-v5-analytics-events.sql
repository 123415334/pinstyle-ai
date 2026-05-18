-- tack — Migration v5: lightweight product analytics events
-- Run this in Supabase SQL Editor before relying on event tracking.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  anonymous_id         TEXT,
  user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name           TEXT NOT NULL,
  plan                 TEXT,
  page_domain          TEXT,
  selected_image_count INTEGER,
  output_count         INTEGER,
  anon_count           INTEGER,
  error_code           TEXT,
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx
  ON public.analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_anonymous_id_idx
  ON public.analytics_events (anonymous_id);

CREATE INDEX IF NOT EXISTS analytics_events_user_id_idx
  ON public.analytics_events (user_id);

CREATE INDEX IF NOT EXISTS analytics_events_event_name_idx
  ON public.analytics_events (event_name);
