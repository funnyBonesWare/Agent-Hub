import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Loader2, Shield } from "lucide-react";

export const Route = createFileRoute("/setup")({
  head: () => ({ meta: [{ title: "Setup — Agent Gate" }] }),
  component: SetupPage,
});

const demoUsers = [
  { email: "agent@agentgate.demo", password: "AgentGate!123", full_name: "Alex Agent", role: "agent" as const },
  { email: "supervisor@agentgate.demo", password: "AgentGate!123", full_name: "Sam Supervisor", role: "supervisor" as const },
];

export default function SetupPage() {
  const [status, setStatus] = useState<Record<string, "idle" | "creating" | "done" | "exists" | "error">>({});
  const [busy, setBusy] = useState(false);
  const [approvalsSeeded, setApprovalsSeeded] = useState(false);

  async function provision() {
    setBusy(true);
    for (const u of demoUsers) {
      setStatus((s) => ({ ...s, [u.email]: "creating" }));
      const { error } = await supabase.auth.signUp({
        email: u.email,
        password: u.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: u.full_name, role: u.role },
        },
      });
      if (error) {
        if (/already/i.test(error.message)) {
          setStatus((s) => ({ ...s, [u.email]: "exists" }));
        } else {
          setStatus((s) => ({ ...s, [u.email]: "error" }));
        }
      } else {
        setStatus((s) => ({ ...s, [u.email]: "done" }));
      }
    }

    // Seed a couple of pending approvals (so the queue isn't empty)
    // Sign in as agent to get a user id, then create the rows.
    const agent = demoUsers[0];
    const { data: signed } = await supabase.auth.signInWithPassword({
      email: agent.email,
      password: agent.password,
    });
    const uid = signed.user?.id;
    if (uid) {
      const { count } = await supabase
        .from("pending_approvals")
        .select("*", { count: "exact", head: true });
      if ((count ?? 0) === 0) {
        await supabase.from("pending_approvals").insert([
          {
            ticket_id: "11111111-0000-0000-0000-000000000002",
            tool_name: "sendEmail",
            tool_input: {
              to: "marcus.w@example.com",
              subject: "Re: Where is my package?",
              body: "Hi Marcus, the carrier confirmed your package is in transit and will arrive within 48 hours. We've added a $10 credit to your account for the delay.",
              ticketId: "11111111-0000-0000-0000-000000000002",
            },
            requested_by: uid,
          },
          {
            ticket_id: "11111111-0000-0000-0000-000000000004",
            tool_name: "updateTicketStatus",
            tool_input: {
              ticketId: "11111111-0000-0000-0000-000000000004",
              newStatus: "resolved",
              reason: "Duplicate charge reversed by billing team",
            },
            requested_by: uid,
          },
          {
            ticket_id: "11111111-0000-0000-0000-000000000010",
            tool_name: "sendEmail",
            tool_input: {
              to: "olivia.s@example.com",
              subject: "Re: Subscription renewed without notice — refund",
              body: "Hi Olivia, we've issued a full refund for the $199 renewal. It will appear on your statement within 5–7 business days. We've also disabled auto-renew on your account.",
              ticketId: "11111111-0000-0000-0000-000000000010",
            },
            requested_by: uid,
          },
        ]);
        setApprovalsSeeded(true);
      } else {
        setApprovalsSeeded(true);
      }
      await supabase.auth.signOut();
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Shield className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Agent Gate — Setup</h1>
          <p className="text-sm text-muted-foreground">
            One-click provisioning of demo accounts and seed data.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-medium">Demo credentials</h2>
        <ul className="space-y-2 font-mono text-xs">
          {demoUsers.map((u) => (
            <li key={u.email} className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
              <div>
                <div className="text-foreground">{u.email}</div>
                <div className="text-muted-foreground">Password: {u.password} · Role: {u.role}</div>
              </div>
              <StatusIcon s={status[u.email] ?? "idle"} />
            </li>
          ))}
        </ul>
        <Button className="mt-4 w-full" onClick={provision} disabled={busy}>
          {busy ? "Provisioning…" : "Provision demo accounts"}
        </Button>
        {approvalsSeeded && (
          <p className="mt-3 text-xs text-emerald-400">
            ✓ Demo seed data ready. <Link to="/auth" className="underline">Go to sign in</Link>.
          </p>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        <Link to="/auth" className="hover:text-foreground">← Back to sign in</Link>
      </p>
    </div>
  );
}

function StatusIcon({ s }: { s: string }) {
  if (s === "creating") return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  if (s === "done" || s === "exists") return <CheckCircle2 className="size-4 text-emerald-400" />;
  if (s === "error") return <AlertCircle className="size-4 text-red-400" />;
  return null;
}