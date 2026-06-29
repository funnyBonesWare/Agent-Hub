import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Agent Gate" }] }),
  component: SettingsPage,
});

interface PolicyRow {
  id: string;
  tool_name: string;
  auto_approve: boolean;
  config: Record<string, unknown>;
}

const TOOL_LABELS: Record<string, string> = {
  searchKnowledgeBase: "Search knowledge base",
  draftReply: "Draft reply",
  sendEmail: "Send email",
  updateTicketStatus: "Update ticket status",
};

function SettingsPage() {
  const { profile } = useAuth();
  const isSupervisor = profile?.role === "supervisor";
  const [policies, setPolicies] = useState<PolicyRow[]>([]);

  useEffect(() => {
    supabase
      .from("policies")
      .select("*")
      .order("tool_name")
      .then(({ data }) => setPolicies((data ?? []) as PolicyRow[]));
  }, []);

  async function toggleAuto(p: PolicyRow, v: boolean) {
    setPolicies((prev) => prev.map((x) => (x.id === p.id ? { ...x, auto_approve: v } : x)));
    const { error } = await supabase
      .from("policies")
      .update({ auto_approve: v } as never)
      .eq("id", p.id);
    if (error) toast.error(error.message);
    else toast.success(`Policy updated: ${TOOL_LABELS[p.tool_name]}`);
  }

  async function toggleRefund(p: PolicyRow, v: boolean) {
    const newConfig = { ...p.config, refund_warning: v };
    setPolicies((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, config: newConfig } : x)),
    );
    const { error } = await supabase
      .from("policies")
      .update({ config: newConfig } as never)
      .eq("id", p.id);
    if (error) toast.error(error.message);
    else toast.success("Refund warning rule updated");
  }

  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto p-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="text-xs text-muted-foreground">
        Configure which AI tools run automatically and which require human approval.
      </p>

      {!isSupervisor && (
        <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Read-only — only supervisors can change approval policies.
        </div>
      )}

      <div className="mt-6 space-y-2">
        {policies.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
          >
            <div>
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px]">
                  {p.tool_name}
                </code>
                <span className="text-sm font-medium">{TOOL_LABELS[p.tool_name] ?? p.tool_name}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {p.auto_approve
                  ? "Runs automatically when the copilot calls it."
                  : "Requires a human to approve before execution."}
              </p>
            </div>
            <Switch
              checked={p.auto_approve}
              disabled={!isSupervisor}
              onCheckedChange={(v) => toggleAuto(p, v)}
              aria-label={`Toggle auto-approve for ${p.tool_name}`}
            />
          </div>
        ))}
      </div>

      {policies.find((p) => p.tool_name === "sendEmail") && (
        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium">Special rule: refund warning</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            When the copilot calls <code className="font-mono">sendEmail</code> with the
            word "refund" in the body on a high-priority ticket, show a warning banner asking for
            supervisor review.
          </p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-foreground">Show refund warning banner</span>
            <Switch
              checked={
                (policies.find((p) => p.tool_name === "sendEmail")?.config?.refund_warning ??
                  true) as boolean
              }
              disabled={!isSupervisor}
              onCheckedChange={(v) => {
                const p = policies.find((x) => x.tool_name === "sendEmail")!;
                toggleRefund(p, v);
              }}
              aria-label="Toggle refund warning rule"
            />
          </div>
        </div>
      )}
    </div>
  );
}