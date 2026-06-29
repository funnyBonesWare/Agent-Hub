import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import { recordAutoAudit } from "@/lib/audit.functions";
import { ToolCallCard } from "./ToolCallCard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  planFromPrompt,
  runDraftReply,
  runSearchKnowledgeBase,
  createApprovalRequest,
  newId,
  type CopilotMessage,
  type ToolCallEvent,
  type TicketContext,
  type ToolName,
} from "@/lib/agent";

const STARTERS = [
  "Summarize this ticket",
  "Search the knowledge base for refund policy",
  "Draft a reply apologizing for the delay",
  "Send the customer a status update email",
];

interface PolicyMap {
  [tool: string]: { auto_approve: boolean; config: Record<string, unknown> };
}

// Per-ticket in-memory copilot history (cleared on page reload)
const memory: Record<string, CopilotMessage[]> = {};

export function CopilotPanel({
  ticket,
  onCopyDraft,
}: {
  ticket: TicketContext;
  onCopyDraft: (text: string) => void;
}) {
  const { user, profile } = useAuth();
  const auditAuto = useServerFn(recordAutoAudit);
  const [messages, setMessages] = useState<CopilotMessage[]>(() => memory[ticket.id] ?? []);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [policies, setPolicies] = useState<PolicyMap>({});
  const [busyApprovalIds, setBusyApprovalIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persist memory to module map
  useEffect(() => {
    memory[ticket.id] = messages;
  }, [ticket.id, messages]);

  // Switch ticket -> load that ticket's history
  useEffect(() => {
    setMessages(memory[ticket.id] ?? []);
  }, [ticket.id]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("policies").select("*");
      const map: PolicyMap = {};
      for (const p of data ?? []) {
        map[p.tool_name] = {
          auto_approve: p.auto_approve,
          config: (p.config as Record<string, unknown>) ?? {},
        };
      }
      setPolicies(map);
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, thinking]);

  // Subscribe to approval resolution for any awaiting tool calls
  useEffect(() => {
    const ch = supabase
      .channel(`copilot-approvals-${ticket.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pending_approvals" },
        async (payload) => {
          const row = payload.new as {
            id: string;
            status: "pending" | "approved" | "denied";
            denial_reason: string | null;
            tool_name: string;
            tool_input: Record<string, unknown>;
            ticket_id: string;
          };
          if (row.status === "pending") return;
          setMessages((prev) => {
            return prev.map((m) => {
              if (!m.toolCalls) return m;
              return {
                ...m,
                toolCalls: m.toolCalls.map((c) =>
                  c.approvalId === row.id
                    ? {
                        ...c,
                        status: row.status === "approved" ? "approved" : "denied",
                        denialReason: row.denial_reason ?? undefined,
                      }
                    : c,
                ),
              };
            });
          });

          if (row.status === "approved" && row.ticket_id === ticket.id) {
            // Side-effecting execution + audit now happens server-side in
            // resolveApproval (supervisor-gated). Here we only sync UI state.
            if (row.tool_name === "sendEmail") {
              toast.success(`Email sent to ${(row.tool_input as { to: string }).to}`);
            }
            if (row.tool_name === "updateTicketStatus") {
              toast.success(
                `Ticket status updated to ${(row.tool_input as { newStatus: string }).newStatus}`,
              );
            }
            appendAssistant(
              `✓ Action approved and executed: ${row.tool_name}.`,
            );
          } else if (row.status === "denied") {
            appendAssistant(
              `Understood — the ${row.tool_name} request was denied${row.denial_reason ? ` (${row.denial_reason})` : ""}. I won't proceed with this action.`,
            );
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [ticket.id, user]);

  function appendAssistant(text: string, toolCalls?: ToolCallEvent[]) {
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "assistant", text, toolCalls, createdAt: Date.now() },
    ]);
  }

  function patchToolCall(messageId: string, callId: string, patch: Partial<ToolCallEvent>) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              toolCalls: m.toolCalls?.map((c) => (c.id === callId ? { ...c, ...patch } : c)),
            }
          : m,
      ),
    );
  }

  async function handleSend(promptOverride?: string) {
    const prompt = (promptOverride ?? input).trim();
    if (!prompt || thinking || !user) return;
    setInput("");
    const userMsg: CopilotMessage = {
      id: newId(),
      role: "user",
      text: prompt,
      createdAt: Date.now(),
    };
    setMessages((p) => [...p, userMsg]);
    setThinking(true);

    const plan = planFromPrompt(prompt, ticket);
    await new Promise((r) => setTimeout(r, 400));

    const assistantId = newId();
    const calls: ToolCallEvent[] = plan.calls.map((c) => ({
      id: newId(),
      tool: c.tool,
      input: c.input,
      status: "running",
    }));
    setMessages((p) => [
      ...p,
      {
        id: assistantId,
        role: "assistant",
        text: plan.thought,
        toolCalls: calls,
        createdAt: Date.now(),
      },
    ]);

    for (const call of calls) {
      const policy = policies[call.tool];
      const autoApprove = policy?.auto_approve ?? false;
      await new Promise((r) => setTimeout(r, 350));

      if (autoApprove) {
        try {
          let output: unknown = null;
          if (call.tool === "searchKnowledgeBase") {
            output = await runSearchKnowledgeBase(call.input as { query: string });
          } else if (call.tool === "draftReply") {
            output = await runDraftReply(call.input as { ticketId: string; body: string });
          }
          patchToolCall(assistantId, call.id, { status: "completed", output });
          await writeAudit({
            ticket_id: ticket.id,
            tool_name: call.tool,
            tool_input: call.input,
            outcome: "auto_completed",
            user_id: user.id,
          });
        } catch (e) {
          console.error(e);
          patchToolCall(assistantId, call.id, { status: "failed" });
        }
      } else {
        // Create pending approval, mark awaiting
        try {
          const ap = await createApprovalRequest(ticket.id, call.tool, call.input, user.id);
          patchToolCall(assistantId, call.id, {
            status: "awaiting_approval",
            approvalId: ap.id,
          });
        } catch (e) {
          console.error(e);
          patchToolCall(assistantId, call.id, { status: "failed" });
        }
      }
    }

    appendAssistant(
      "Done with what I can run automatically. Any actions above marked 'awaiting approval' need a human to approve or deny before they execute.",
    );
    setThinking(false);
  }

  async function resolveApproval(callId: string, approvalId: string, approve: boolean) {
    if (!user) return;
    setBusyApprovalIds((s) => new Set(s).add(callId));
    try {
      const payload: Record<string, unknown> = {
        status: approve ? "approved" : "denied",
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      };
      if (!approve) payload.denial_reason = "Denied from copilot panel";
      const { error } = await supabase
        .from("pending_approvals")
        .update(payload as never)
        .eq("id", approvalId);
      if (error) toast.error(error.message);
    } finally {
      setBusyApprovalIds((s) => {
        const n = new Set(s);
        n.delete(callId);
        return n;
      });
    }
  }

  const refundWarning = useMemo(
    () => (call: ToolCallEvent) => {
      if (call.tool !== "sendEmail") return false;
      if (ticket.priority !== "high") return false;
      const body = String((call.input as { body?: string }).body ?? "").toLowerCase();
      const enabled = (policies.sendEmail?.config?.refund_warning ?? true) as boolean;
      return enabled && body.includes("refund");
    },
    [ticket.priority, policies],
  );

  const statusLabel = thinking
    ? "thinking"
    : messages.some((m) => m.toolCalls?.some((c) => c.status === "awaiting_approval"))
      ? "awaiting approval"
      : "idle";

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-border bg-sidebar">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Sparkles className="size-3.5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">AI Copilot</h3>
            <p className="text-[10px] text-muted-foreground">
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-emerald-400" />{" "}
              {statusLabel}
            </p>
          </div>
        </div>
        {profile && (
          <span className="text-[10px] text-muted-foreground">as {profile.full_name}</span>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="flex h-full flex-col justify-end gap-2 p-2">
            <p className="text-[11px] text-muted-foreground">Try a starter prompt:</p>
            <div className="flex flex-wrap gap-1.5">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="rounded-full border border-border bg-card/60 px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="space-y-2">
            {m.role === "user" ? (
              <div className="ml-auto max-w-[90%] rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
                {m.text}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-lg border border-border bg-card/40 px-3 py-2 text-xs text-foreground">
                  {m.text}
                </div>
                {m.toolCalls?.map((c) => (
                  <ToolCallCard
                    key={c.id}
                    call={c}
                    showRefundWarning={refundWarning(c)}
                    onCopyDraft={onCopyDraft}
                    onApprove={
                      c.approvalId
                        ? () => resolveApproval(c.id, c.approvalId!, true)
                        : undefined
                    }
                    onDeny={
                      c.approvalId
                        ? () => resolveApproval(c.id, c.approvalId!, false)
                        : undefined
                    }
                    busyApproval={busyApprovalIds.has(c.id)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
        {thinking && (
          <div className="flex items-center gap-2 px-2 text-[11px] text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            <span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
            <span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:300mss]" />
            Copilot is thinking…
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            disabled={thinking}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask the copilot…"
            rows={2}
            className="min-h-[52px] flex-1 resize-none rounded-md border border-border bg-background/60 px-2.5 py-2 text-xs focus:border-primary focus:outline-none disabled:opacity-50"
          />
          <Button
            size="sm"
            onClick={() => handleSend()}
            disabled={thinking || !input.trim()}
            className="self-end"
          >
            <Send className="size-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}