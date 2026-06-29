
-- Enums
CREATE TYPE public.user_role AS ENUM ('agent','supervisor');
CREATE TYPE public.ticket_status AS ENUM ('open','pending','resolved');
CREATE TYPE public.ticket_priority AS ENUM ('low','medium','high');
CREATE TYPE public.sender_type AS ENUM ('customer','agent','system');
CREATE TYPE public.approval_status AS ENUM ('pending','approved','denied');
CREATE TYPE public.audit_outcome AS ENUM ('auto_completed','approved','denied','failed');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role public.user_role NOT NULL DEFAULT 'agent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles select all auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles update self" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles insert self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.user_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = _role)
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'agent')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Tickets
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  status public.ticket_status NOT NULL DEFAULT 'open',
  priority public.ticket_priority NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tickets all auth" ON public.tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sender_type public.sender_type NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages all auth" ON public.messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Knowledge base
CREATE TABLE public.knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.knowledge_base TO authenticated;
GRANT ALL ON public.knowledge_base TO service_role;
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb read auth" ON public.knowledge_base FOR SELECT TO authenticated USING (true);

-- Drafts
CREATE TABLE public.drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drafts TO authenticated;
GRANT ALL ON public.drafts TO service_role;
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drafts all auth" ON public.drafts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Pending approvals
CREATE TABLE public.pending_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  tool_input JSONB NOT NULL,
  status public.approval_status NOT NULL DEFAULT 'pending',
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  denial_reason TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.pending_approvals TO authenticated;
GRANT ALL ON public.pending_approvals TO service_role;
ALTER TABLE public.pending_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approvals all auth" ON public.pending_approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Audit log (append-only)
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  tool_input JSONB NOT NULL,
  outcome public.audit_outcome NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit insert auth" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "audit select supervisor" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'supervisor'));

-- Policies
CREATE TABLE public.policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name TEXT NOT NULL UNIQUE,
  auto_approve BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.policies TO authenticated;
GRANT UPDATE ON public.policies TO authenticated;
GRANT ALL ON public.policies TO service_role;
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policies read auth" ON public.policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "policies update supervisor" ON public.policies FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'supervisor')) WITH CHECK (public.has_role(auth.uid(),'supervisor'));

-- updated_at trigger for tickets
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER tickets_touch BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_approvals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.drafts;

-- Seed policies
INSERT INTO public.policies (tool_name, auto_approve, config) VALUES
  ('searchKnowledgeBase', true, '{}'),
  ('draftReply', true, '{}'),
  ('sendEmail', false, '{"refund_warning": true}'),
  ('updateTicketStatus', false, '{}');

-- Seed knowledge base
INSERT INTO public.knowledge_base (title, content, tags) VALUES
  ('Refund Policy', 'We offer full refunds within 30 days of purchase. Refunds are processed within 5-7 business days back to the original payment method. For orders over $500, supervisor approval is required.', ARRAY['refund','billing','policy']),
  ('Shipping Times', 'Standard shipping takes 3-5 business days. Express shipping is 1-2 business days. International orders may take 7-14 business days. Tracking numbers are sent via email once the order ships.', ARRAY['shipping','delivery']),
  ('Lost or Delayed Shipments', 'If a shipment is delayed more than 7 days past the estimated delivery date, customers are entitled to a 20% credit. If declared lost by the carrier, we will reship or refund.', ARRAY['shipping','refund']),
  ('Password Reset', 'Customers can reset passwords from the login page by clicking "Forgot password". The reset link expires in 24 hours. If the email is not received, check spam folder.', ARRAY['account','login']),
  ('Account Locked', 'Accounts lock after 5 failed login attempts for 15 minutes. Support agents can manually unlock from the admin panel after verifying identity with last 4 digits of payment method.', ARRAY['account','login','security']),
  ('Billing Disputes', 'For billing disputes, ask for the order number and transaction ID. Compare against our records before issuing a credit. Disputes older than 90 days require finance team escalation.', ARRAY['billing','refund']),
  ('Subscription Cancellation', 'Subscriptions can be cancelled anytime from the account settings page. Cancellation takes effect at the end of the current billing period. No partial refunds on annual plans.', ARRAY['billing','subscription']),
  ('Product Returns', 'Items must be returned in original condition within 30 days. Customer pays return shipping unless the item was defective. Refund issued within 5 business days of receipt.', ARRAY['refund','shipping']),
  ('Damaged on Arrival', 'If an item arrives damaged, request photos of the packaging and damage. Issue a replacement at no cost and file a carrier claim. No need to return the damaged item under $100.', ARRAY['shipping','refund']),
  ('Promo Code Issues', 'Promo codes are case-sensitive and cannot be combined unless explicitly stated. If a valid code fails, manually apply the discount and note the order. Expired codes cannot be honored.', ARRAY['billing','promo']),
  ('Account Email Change', 'Customers can change their email from account settings. A verification link is sent to the new email. Old email receives a notification for security. Changes take effect after verification.', ARRAY['account']),
  ('Data Export Request', 'Customers can request a full data export under GDPR. We have 30 days to fulfill. Submit the request via the privacy portal. Export is delivered as a downloadable ZIP within 7 days.', ARRAY['privacy','account']);

-- Seed tickets
WITH inserted AS (
INSERT INTO public.tickets (id, subject, customer_name, customer_email, status, priority, created_at, updated_at) VALUES
  ('11111111-0000-0000-0000-000000000001','Refund not received — order #48291','Sarah Chen','sarah.chen@example.com','open','high', now() - INTERVAL '2 hours', now() - INTERVAL '20 minutes'),
  ('11111111-0000-0000-0000-000000000002','Where is my package?','Marcus Webb','marcus.w@example.com','open','medium', now() - INTERVAL '4 hours', now() - INTERVAL '1 hour'),
  ('11111111-0000-0000-0000-000000000003','Can''t log into my account','Priya Patel','priya.patel@example.com','open','high', now() - INTERVAL '1 hour', now() - INTERVAL '15 minutes'),
  ('11111111-0000-0000-0000-000000000004','Charged twice for the same order','Diego Alvarez','diego.a@example.com','pending','high', now() - INTERVAL '1 day', now() - INTERVAL '3 hours'),
  ('11111111-0000-0000-0000-000000000005','Promo code WELCOME20 not working','Emma Thompson','emma.t@example.com','open','low', now() - INTERVAL '6 hours', now() - INTERVAL '6 hours'),
  ('11111111-0000-0000-0000-000000000006','How do I cancel my subscription?','Liam O''Brien','liam.o@example.com','open','low', now() - INTERVAL '8 hours', now() - INTERVAL '8 hours'),
  ('11111111-0000-0000-0000-000000000007','Item arrived damaged','Aisha Khan','aisha.k@example.com','pending','medium', now() - INTERVAL '2 days', now() - INTERVAL '5 hours'),
  ('11111111-0000-0000-0000-000000000008','Feature request: dark mode export','Noah Garcia','noah.g@example.com','open','low', now() - INTERVAL '3 days', now() - INTERVAL '3 days'),
  ('11111111-0000-0000-0000-000000000009','Need to change shipping address','Yuki Tanaka','yuki.t@example.com','open','medium', now() - INTERVAL '30 minutes', now() - INTERVAL '30 minutes'),
  ('11111111-0000-0000-0000-000000000010','Subscription renewed without notice','Olivia Smith','olivia.s@example.com','open','high', now() - INTERVAL '5 hours', now() - INTERVAL '5 hours'),
  ('11111111-0000-0000-0000-000000000011','Wrong item shipped','Ethan Brown','ethan.b@example.com','resolved','medium', now() - INTERVAL '5 days', now() - INTERVAL '1 day'),
  ('11111111-0000-0000-0000-000000000012','Account compromise — possible fraud','Mia Rossi','mia.r@example.com','pending','high', now() - INTERVAL '3 hours', now() - INTERVAL '2 hours'),
  ('11111111-0000-0000-0000-000000000013','Question about return window','Daniel Kim','daniel.k@example.com','resolved','low', now() - INTERVAL '7 days', now() - INTERVAL '6 days'),
  ('11111111-0000-0000-0000-000000000014','Order stuck in processing','Zoe Martin','zoe.m@example.com','open','medium', now() - INTERVAL '12 hours', now() - INTERVAL '12 hours'),
  ('11111111-0000-0000-0000-000000000015','Data export request','Hassan Ali','hassan.a@example.com','open','low', now() - INTERVAL '1 day', now() - INTERVAL '1 day')
RETURNING id
)
SELECT count(*) FROM inserted;

-- Seed messages (a few per ticket)
INSERT INTO public.messages (ticket_id, sender_type, body, created_at) VALUES
  ('11111111-0000-0000-0000-000000000001','customer','Hi, I returned order #48291 two weeks ago and still haven''t received my refund. The package was confirmed delivered to your warehouse on the 12th. Can you please look into this urgently? I need the money back for rent.', now() - INTERVAL '2 hours'),
  ('11111111-0000-0000-0000-000000000001','agent','Hi Sarah, I''m sorry for the delay. Let me check the status of your return right away.', now() - INTERVAL '90 minutes'),
  ('11111111-0000-0000-0000-000000000001','customer','Thank you. It''s been really stressful. Please update me as soon as you know anything.', now() - INTERVAL '20 minutes'),

  ('11111111-0000-0000-0000-000000000002','customer','My order shipped 6 days ago but the tracking hasn''t updated since. Is it lost?', now() - INTERVAL '4 hours'),
  ('11111111-0000-0000-0000-000000000002','agent','Let me check with the carrier and get back to you within the hour.', now() - INTERVAL '3 hours'),
  ('11111111-0000-0000-0000-000000000002','customer','Still nothing — any update?', now() - INTERVAL '1 hour'),

  ('11111111-0000-0000-0000-000000000003','customer','I''m locked out of my account. Tried to reset password but no email arrives. Checked spam.', now() - INTERVAL '1 hour'),
  ('11111111-0000-0000-0000-000000000003','customer','This is urgent, I have a presentation in an hour and need files from my account.', now() - INTERVAL '15 minutes'),

  ('11111111-0000-0000-0000-000000000004','customer','I was charged twice for order #50112 on Oct 3. Need one of the charges reversed immediately.', now() - INTERVAL '1 day'),
  ('11111111-0000-0000-0000-000000000004','agent','I see both charges. Escalating to billing now.', now() - INTERVAL '20 hours'),
  ('11111111-0000-0000-0000-000000000004','system','Status changed to pending — awaiting billing review.', now() - INTERVAL '20 hours'),
  ('11111111-0000-0000-0000-000000000004','customer','Any update? My card statement closes today.', now() - INTERVAL '3 hours'),

  ('11111111-0000-0000-0000-000000000005','customer','Trying to use WELCOME20 at checkout but it says invalid. First time customer here.', now() - INTERVAL '6 hours'),

  ('11111111-0000-0000-0000-000000000007','customer','My order arrived but the screen on the device is cracked. Photos attached.', now() - INTERVAL '2 days'),
  ('11111111-0000-0000-0000-000000000007','agent','Sorry about that. I''ll ship a replacement today at no cost.', now() - INTERVAL '1 day'),
  ('11111111-0000-0000-0000-000000000007','customer','Thanks. When can I expect it?', now() - INTERVAL '5 hours'),

  ('11111111-0000-0000-0000-000000000010','customer','You just charged me $199 for an annual renewal I never confirmed. I want this refunded — this is a refund request, urgent.', now() - INTERVAL '5 hours'),

  ('11111111-0000-0000-0000-000000000012','customer','I see purchases I didn''t make. I think my account was hacked. Please freeze it and investigate.', now() - INTERVAL '3 hours'),
  ('11111111-0000-0000-0000-000000000012','agent','Freezing your account now and beginning investigation. Please change your password from the app.', now() - INTERVAL '2 hours');
