
-- 1) Force new signups to 'agent' regardless of client-supplied metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    'agent'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2) Tickets: only supervisors can update (status, etc.). Service role bypasses RLS.
DROP POLICY IF EXISTS "tickets update auth" ON public.tickets;
CREATE POLICY "tickets update supervisor"
ON public.tickets
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'supervisor'))
WITH CHECK (public.has_role(auth.uid(), 'supervisor'));

-- 3) Messages: authenticated users may insert agent/customer messages only.
--    System messages must come from the service role (server-side approved tool execution).
DROP POLICY IF EXISTS "messages insert auth" ON public.messages;
CREATE POLICY "messages insert non_system"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND sender_type IN ('agent','customer')
);
