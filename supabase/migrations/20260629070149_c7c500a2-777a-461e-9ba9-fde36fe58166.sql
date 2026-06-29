
-- Column-level grants aren't row-aware, so granting SELECT(email) to
-- authenticated still exposed every email. Revoke it; the app reads its
-- own email from the auth session.
REVOKE SELECT (email) ON public.profiles FROM authenticated;
