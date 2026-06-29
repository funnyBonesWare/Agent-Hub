
CREATE OR REPLACE FUNCTION public.reset_demo_data(_requested_by uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.audit_log;
  DELETE FROM public.pending_approvals;
  DELETE FROM public.drafts;
  DELETE FROM public.messages;
  DELETE FROM public.tickets;

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
    ('11111111-0000-0000-0000-000000000015','Data export request','Hassan Ali','hassan.a@example.com','open','low', now() - INTERVAL '1 day', now() - INTERVAL '1 day');

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

  INSERT INTO public.pending_approvals (ticket_id, tool_name, tool_input, requested_by) VALUES
    ('11111111-0000-0000-0000-000000000002','sendEmail',
      jsonb_build_object('to','marcus.w@example.com','subject','Re: Where is my package?','body','Hi Marcus, the carrier confirmed your package is in transit and will arrive within 48 hours. We''ve added a $10 credit to your account for the delay.','ticketId','11111111-0000-0000-0000-000000000002'),
      _requested_by),
    ('11111111-0000-0000-0000-000000000004','updateTicketStatus',
      jsonb_build_object('ticketId','11111111-0000-0000-0000-000000000004','newStatus','resolved','reason','Duplicate charge reversed by billing team'),
      _requested_by),
    ('11111111-0000-0000-0000-000000000010','sendEmail',
      jsonb_build_object('to','olivia.s@example.com','subject','Re: Subscription renewed without notice — refund','body','Hi Olivia, we''ve issued a full refund for the $199 renewal. It will appear on your statement within 5–7 business days. We''ve also disabled auto-renew on your account.','ticketId','11111111-0000-0000-0000-000000000010'),
      _requested_by),
    ('11111111-0000-0000-0000-000000000001','issueRefund',
      jsonb_build_object('ticketId','11111111-0000-0000-0000-000000000001','orderId','48291','amount',129.00,'currency','USD','reason','Return received at warehouse — refund not processed'),
      _requested_by);
END;
$$;
