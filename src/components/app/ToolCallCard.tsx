import { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2, AlertTriangle, Search, FileText, Mail, RefreshCw } from "lucide-react";
import type { ToolCallEvent } from "@/lib/agent";
import { ToolStatusBadge } from "./badges";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const toolIcon = {
  searchKnowledgeBase: Search,
  draftReply: FileText,
  sendEmail: Mail,
  updateTicketStatus: RefreshCw,
} as const;

export function ToolCallCard({
  call,
  onApprove,
  onDeny,
  onCopyDraft,
  showRefundWarning,
  busyApproval,
}: {
  call: ToolCallEvent;
  onApprove?: () => void;
  onDeny?: () => void;
  onCopyDraft?: (text: string) => void;
  showRefundWarning?: boolean;
  busyApproval?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const Icon = toolIcon[call.tool];
  const borderColor =
    call.status === "running"
      ? "border-l-blue-500"
      : call.status === "completed" || call.status === "approved"
        ? "border-l-emerald-500"
        : call.status === "awaiting_approval"
          ? "border-l-amber-500"
          : call.status === "denied" || call.status === "failed"
            ? "border-l-red-500"
            : "border-l-zinc-600";

  return (
    <div className={cn("rounded-lg border border-border bg-card/60 border-l-2 p-3 text-xs", borderColor)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 text-muted-foreground" />
          <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px]">
            {call.tool}
          </code>
          <ToolStatusBadge status={call.status} />
        </div>
        {call.status === "running" && <Loader2 className="size-3.5 animate-spin text-blue-400" />}
        {(call.status === "completed" || call.status === "approved") && <CheckCircle2 className="size-3.5 text-emerald-400" />}
        {(call.status === "denied" || call.status === "failed") && <XCircle className="size-3.5 text-red-400" />}
      </div>

      {showRefundWarning && call.status === "awaiting_approval" && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-amber-200">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>High-priority refund email — supervisor review recommended.</span>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="mt-2 flex w-full items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        Input
      </button>
      {open && (
        <pre className="mt-1 max-h-60 overflow-auto rounded-md bg-background/60 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
{JSON.stringify(call.input, null, 2)}
        </pre>
      )}

      {/* KB results */}
      {call.status === "completed" && call.tool === "searchKnowledgeBase" && Array.isArray(call.output) && (
        <div className="mt-2 space-y-1.5">
          {(call.output as { id: string; title: string; excerpt: string; score: number }[]).map((a) => (
            <div key={a.id} className="rounded-md border border-border bg-background/40 p-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-medium text-foreground">{a.title}</div>
                <span className="text-[10px] text-muted-foreground">score {a.score}</span>
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{a.excerpt}</p>
            </div>
          ))}
        </div>
      )}

      {/* Draft */}
      {call.status === "completed" && call.tool === "draftReply" && call.output && (
        <div className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase text-emerald-300">Draft reply</span>
            {onCopyDraft && (
              <button
                onClick={() => onCopyDraft((call.output as { body: string }).body)}
                className="text-[10px] text-emerald-300 hover:underline"
              >
                Copy to composer
              </button>
            )}
          </div>
          <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-foreground">{(call.output as { body: string }).body}</pre>
        </div>
      )}

      {call.status === "denied" && call.denialReason && (
        <p className="mt-2 text-[11px] text-red-300">Denied: {call.denialReason}</p>
      )}

      {call.status === "awaiting_approval" && onApprove && onDeny && (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={onApprove}
            disabled={busyApproval}
            className="h-7 flex-1 bg-emerald-600 text-white hover:bg-emerald-500"
            aria-label={`Approve ${call.tool}`}
          >
            {busyApproval ? <Loader2 className="size-3 animate-spin" /> : "Approve"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDeny}
            disabled={busyApproval}
            className="h-7 flex-1 border-red-500/40 text-red-300 hover:bg-red-500/10 hover:text-red-200"
            aria-label={`Deny ${call.tool}`}
          >
            Deny
          </Button>
        </div>
      )}
    </div>
  );
}