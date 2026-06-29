
-- audit_log: only service_role may insert
DROP POLICY IF EXISTS "audit insert auth" ON public.audit_log;
REVOKE INSERT ON public.audit_log FROM authenticated, anon;

-- messages: client can only insert as agent; updates supervisor-only
DROP POLICY IF EXISTS "messages insert non_system" ON public.messages;
CREATE POLICY "messages insert agent only" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND sender_type = 'agent');

DROP POLICY IF EXISTS "messages update auth" ON public.messages;
CREATE POLICY "messages update supervisor" ON public.messages
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (public.has_role(auth.uid(), 'supervisor'));

-- tickets.customer_email: hide PII from authenticated; service_role only
REVOKE SELECT (customer_email) ON public.tickets FROM authenticated, anon;
GRANT SELECT (id, subject, customer_name, status, priority, created_at, updated_at)
  ON public.tickets TO authenticated;
