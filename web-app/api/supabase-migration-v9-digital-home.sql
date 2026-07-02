-- Tack migration v9: private Digital Home imports for Chrome Web Store metrics.
CREATE TABLE IF NOT EXISTS public.admin_chrome_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL,
  metric_date DATE NOT NULL,
  dimension TEXT NOT NULL DEFAULT 'total',
  value NUMERIC NOT NULL DEFAULT 0,
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (metric_type, metric_date, dimension)
);

ALTER TABLE public.admin_chrome_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_chrome_metrics FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS admin_chrome_metrics_date_idx ON public.admin_chrome_metrics (metric_date DESC);
