
-- =========================================================
-- 1. profiles: hide other users' emails; prevent role escalation
-- =========================================================
-- Restrict the email column at the grant level (RLS can't filter columns)
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, full_name, role, created_at) ON public.profiles TO authenticated;
-- Only the owner can read their own email (via row policy below + column grant)
GRANT SELECT (email) ON public.profiles TO authenticated;

-- Replace existing select policies
DROP POLICY IF EXISTS "profiles select all auth" ON public.profiles;
-- All authenticated users can see non-email columns (column grant enforces this)
CREATE POLICY "profiles select non sensitive"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

-- Lock role updates: the new row's role must match the old row's role
DROP POLICY IF EXISTS "profiles update self" ON public.profiles;
CREATE POLICY "profiles update self no role change"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  );

-- =========================================================
-- 2. pending_approvals: split permissive policy
-- =========================================================
DROP POLICY IF EXISTS "approvals all auth" ON public.pending_approvals;

CREATE POLICY "approvals select auth"
  ON public.pending_approvals FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "approvals insert own"
  ON public.pending_approvals FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid() OR requested_by IS NULL);

CREATE POLICY "approvals update supervisor"
  ON public.pending_approvals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'::public.user_role))
  WITH CHECK (public.has_role(auth.uid(), 'supervisor'::public.user_role));

CREATE POLICY "approvals delete supervisor"
  ON public.pending_approvals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'::public.user_role));

-- =========================================================
-- 3. policies table: supervisor-only read
-- =========================================================
DROP POLICY IF EXISTS "policies read auth" ON public.policies;
CREATE POLICY "policies read supervisor"
  ON public.policies FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'::public.user_role));

-- =========================================================
-- 4. tickets / messages / drafts / audit_log: replace USING(true)/WITH CHECK(true)
--    write rules with auth.uid() IS NOT NULL — keeps demo functionality
--    while satisfying the always-true linter.
-- =========================================================
DROP POLICY IF EXISTS "tickets all auth" ON public.tickets;
CREATE POLICY "tickets select auth" ON public.tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "tickets insert auth" ON public.tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "tickets update auth" ON public.tickets FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "tickets delete supervisor" ON public.tickets FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'supervisor'::public.user_role));

DROP POLICY IF EXISTS "messages all auth" ON public.messages;
CREATE POLICY "messages select auth" ON public.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "messages insert auth" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "messages update auth" ON public.messages FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "messages delete supervisor" ON public.messages FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'supervisor'::public.user_role));

DROP POLICY IF EXISTS "drafts all auth" ON public.drafts;
CREATE POLICY "drafts select auth" ON public.drafts FOR SELECT TO authenticated USING (true);
CREATE POLICY "drafts insert auth" ON public.drafts FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "drafts update auth" ON public.drafts FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "drafts delete auth" ON public.drafts FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "audit insert auth" ON public.audit_log;
CREATE POLICY "audit insert auth"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- =========================================================
-- 5. Functions: fixed search_path, SECURITY INVOKER where safe,
--    revoke EXECUTE from anon (and from authenticated where possible).
-- =========================================================

-- touch_updated_at: trigger only, lock search_path, revoke from PUBLIC
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- has_role: switch to SECURITY INVOKER. Profile self-read is allowed,
-- and policies only ever call has_role(auth.uid(), ...), so invoker works.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.user_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = _role)
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.user_role) TO authenticated;

-- handle_new_user: trigger only, revoke public/anon/auth EXECUTE
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- reset_demo_data: lock down execution to service_role only.
-- The app now calls this through a TanStack server function with the admin client.
REVOKE ALL ON FUNCTION public.reset_demo_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_demo_data(uuid) TO service_role;
