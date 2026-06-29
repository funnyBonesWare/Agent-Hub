import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { toast } from "sonner";
import { ToolStatusBadge, EmptyState } from "@/components/app/badges";
import { resolveApproval } from "@/lib/approvals.functions";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({ meta: [{ title: "Approval Queue — Agent Gate" }] }),
  component: ApprovalsPage,
});

interface Approval {
  id: string;
  ticket_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  status: "pending" | "approved" | "denied";
  requested_by: string | null;
  resolved_by: string | null;
  denial_reason: string | null;
  created_at: string;
  tickets: { subject: string; priority: string } | null;
}

function summarize(tool: string, input: Record<string, unknown>): string {
  if (tool === "sendEmail") {
    return `Send email to ${input.to} — Subject: ${input.subject}`;
  }
  if (tool === "updateTicketStatus") {
    return `Set ticket status to ${input.newStatus} — ${input.reason}`;
  }
  return tool;
}

function ApprovalsPage() {
  const { user, profile } = useAuth();
  const [rows, setRows] = useState<Approval[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "denied" | "all">("pending");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});

  const load = async () => {
    const { data } = await supabase
      .from("pending_approvals")
      .select("*, tickets(subject,priority)")
      .order("created_at", { ascending: false });
    setRows((data ?? []) as unknown as Approval[]);
    const { data: profs } = await supabase.from("profiles").select("id,full_name");
    const m: Record<string, string> = {};
    for (const p of profs ?? []) m[p.id] = p.full_name;
    setProfileMap(m);
  };

  useEffect(() => {
    if (profile?.role !== "supervisor") return;
    load();
    const ch = supabase
      .channel("approvals-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pending_approvals" },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile?.role]);

  async function resolve(row: Approval, approve: boolean) {
    if (!user) return;
    setBusy((s) => new Set(s).add(row.id));
    try {
      await resolveApproval({
        data: {
          approvalId: row.id,
          decision: approve ? "approve" : "deny",
        },
      });
      toast.success(approve ? "Approved & executed" : "Denied");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(row.id);
        return n;
      });
    }
  }

  const filtered = rows.filter((r) => (filter === "all" ? true : r.status === filter));

  if (profile && profile.role !== "supervisor") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-8 text-center">
          <Lock className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Supervisor access required</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            The approval queue is restricted to supervisors. Switch accounts or ask one to share access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Approval Queue</h1>
          <p className="text-xs text-muted-foreground">
            Every action below needed a human before it could execute.
          </p>
        </div>
        <div className="flex gap-1 rounded-md border border-border bg-card p-0.5">
          {(["pending", "approved", "denied", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2.5 py-1 text-[11px] uppercase ${
                filter === f
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No pending approvals — all clear" description="When the copilot proposes a gated action, it'll show up here." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-left font-medium">Ticket</th>
                <th className="px-3 py-2 text-left font-medium">Tool</th>
                <th className="px-3 py-2 text-left font-medium">Action</th>
                <th className="px-3 py-2 text-left font-medium">Requested by</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Decision</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {format(new Date(r.created_at), "MMM d, p")}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <Link
                      to="/"
                      search={{ ticket: r.ticket_id }}
                      className="text-primary hover:underline"
                    >
                      {r.tickets?.subject ?? "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px]">
                      {r.tool_name}
                    </code>
                  </td>
                  <td className="max-w-md px-3 py-2 text-xs text-muted-foreground">
                    {summarize(r.tool_name, r.tool_input)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {profileMap[r.requested_by ?? ""] ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <ToolStatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.status === "pending" ? (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => resolve(r, true)}
                          disabled={busy.has(r.id)}
                          className="h-7 bg-emerald-600 text-white hover:bg-emerald-500"
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resolve(r, false)}
                          disabled={busy.has(r.id)}
                          className="h-7 border-red-500/40 text-red-300 hover:bg-red-500/10"
                        >
                          Deny
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        {r.status === "approved" ? "Approved" : `Denied${r.denial_reason ? ` — ${r.denial_reason}` : ""}`}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}