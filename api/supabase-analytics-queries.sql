-- tack analytics quick reads

-- Funnel by event over the last 30 days.
SELECT
  event_name,
  COUNT(*) AS events,
  COUNT(DISTINCT anonymous_id) AS anonymous_users,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS signed_in_users
FROM public.analytics_events
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY event_name
ORDER BY events DESC;

-- Users who signed up after anonymous usage but did not generate while signed in.
SELECT
  p.email,
  p.generations_used,
  MAX(e.anon_count) AS anon_count_at_signup,
  MIN(e.created_at) FILTER (WHERE e.event_name = 'signup_completed') AS signed_up_at,
  MAX(e.created_at) AS last_seen_at
FROM public.user_profiles p
JOIN public.analytics_events e ON e.user_id = p.id
WHERE p.generations_used = 0
GROUP BY p.id, p.email, p.generations_used
HAVING MAX(e.anon_count) > 0
ORDER BY last_seen_at DESC;

-- Anonymous generation gate pressure.
SELECT
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) FILTER (WHERE event_name = 'generate_succeeded' AND user_id IS NULL) AS anon_successes,
  COUNT(*) FILTER (WHERE event_name = 'anon_limit_reached') AS anon_limit_hits,
  COUNT(*) FILTER (WHERE event_name = 'signup_completed') AS signups
FROM public.analytics_events
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1 DESC;

-- Generation failures by message/code.
SELECT
  COALESCE(error_code, metadata->>'message', 'unknown') AS failure,
  COUNT(*) AS events
FROM public.analytics_events
WHERE event_name = 'generate_failed'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY events DESC;
