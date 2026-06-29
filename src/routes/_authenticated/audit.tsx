import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Lock, Download, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/badges";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Audit Log — Agent Gate" }] }),
  component: AuditPage,
});

interface AuditRow {
  id: string;
  ticket_id: string | null;
  tool_name: string;
  tool_input: Record<string, unknown>;
  outcome: string;
  user_id: string | null;
  approver_id: string | null;
  created_at: string;
}

function AuditPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [toolFilter, setToolFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");

  useEffect(() => {
    if (profile?.role !== "supervisor") return;
    (async () => {
      const { data } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false });
      setRows((data ?? []) as AuditRow[]);
      const { data: profs } = await supabase.from("profiles").select("id,full_name");
      const map: Record<string, string> = {};
      for (const p of profs ?? []) map[p.id] = p.full_name;
      setProfileMap(map);
    })();
  }, [profile]);

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => (toolFilter === "all" ? true : r.tool_name === toolFilter))
        .filter((r) => (outcomeFilter === "all" ? true : r.outcome === outcomeFilter)),
    [rows, toolFilter, outcomeFilter],
  );

  function exportCsv() {
    const headers = ["timestamp", "tool", "outcome", "user", "approver", "ticket_id", "input"];
    const lines = [headers.join(",")];
    for (const r of filtered) {
      lines.push(
        [
          r.created_at,
          r.tool_name,
          r.outcome,
          profileMap[r.user_id ?? ""] ?? "",
          profileMap[r.approver_id ?? ""] ?? "",
          r.ticket_id ?? "",
          `"${JSON.stringify(r.tool_input).replace(/"/g, '""')}"`,
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (profile?.role !== "supervisor") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-8 text-center">
          <Lock className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Supervisor access required</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            The audit log is restricted to supervisors. Switch accounts or ask one to share access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Audit Log</h1>
          <p className="text-xs text-muted-foreground">
            Append-only record of every tool call.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={toolFilter}
            onChange={(e) => setToolFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-card px-2 text-xs"
          >
            <option value="all">All tools</option>
            <option value="searchKnowledgeBase">searchKnowledgeBase</option>
            <option value="draftReply">draftReply</option>
            <option value="sendEmail">sendEmail</option>
            <option value="updateTicketStatus">updateTicketStatus</option>
          </select>
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-card px-2 text-xs"
          >
            <option value="all">All outcomes</option>
            <option value="auto_completed">auto_completed</option>
            <option value="approved">approved</option>
            <option value="denied">denied</option>
            <option value="failed">failed</option>
          </select>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="size-3.5" /> CSV
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No audit entries yet" description="Tool calls from the copilot will be logged here automatically." />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((r) => {
            const isOpen = open.has(r.id);
            return (
              <div key={r.id} className="rounded-lg border border-border bg-card text-xs">
                <button
                  onClick={() =>
                    setOpen((s) => {
                      const n = new Set(s);
                      if (n.has(r.id)) n.delete(r.id);
                      else n.add(r.id);
                      return n;
                    })
                  }
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent/30"
                >
                  {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  <span className="w-32 text-muted-foreground">
                    {format(new Date(r.created_at), "MMM d, p")}
                  </span>
                  <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px]">
                    {r.tool_name}
                  </code>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${
                    r.outcome === "approved" || r.outcome === "auto_completed"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : r.outcome === "denied"
                        ? "bg-red-500/15 text-red-300"
                        : "bg-amber-500/15 text-amber-300"
                  }`}>
                    {r.outcome}
                  </span>
                  <span className="flex-1 text-muted-foreground">
                    by {profileMap[r.user_id ?? ""] ?? "—"}
                    {r.approver_id ? ` · approved by ${profileMap[r.approver_id] ?? "—"}` : ""}
                  </span>
                </button>
                {isOpen && (
                  <pre className="border-t border-border bg-background/40 p-3 font-mono text-[10px] text-muted-foreground">
{JSON.stringify(r.tool_input, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}