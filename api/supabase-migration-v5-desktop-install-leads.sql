CREATE TABLE IF NOT EXISTS public.desktop_install_leads (
  email TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'homepage_mobile',
  path TEXT NOT NULL DEFAULT '/',
  referrer TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  install_url TEXT NOT NULL DEFAULT 'https://tack.design/chrome',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.desktop_install_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage desktop install leads" ON public.desktop_install_leads;
CREATE POLICY "Service role can manage desktop install leads"
ON public.desktop_install_leads
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
