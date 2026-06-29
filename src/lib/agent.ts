// Deterministic mock copilot agent for Agent Gate.
// Parses the user's prompt, plans a sequence of tool calls, and exposes
// them via async generators so the UI can render streaming updates.
import { supabase } from "@/integrations/supabase/client";

export type ToolName =
  | "searchKnowledgeBase"
  | "draftReply"
  | "sendEmail"
  | "updateTicketStatus";

export type ToolStatus =
  | "running"
  | "completed"
  | "awaiting_approval"
  | "approved"
  | "denied"
  | "failed";

export interface ToolCallEvent {
  id: string;
  tool: ToolName;
  input: Record<string, unknown>;
  status: ToolStatus;
  output?: unknown;
  approvalId?: string;
  denialReason?: string;
}

export interface CopilotMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls?: ToolCallEvent[];
  createdAt: number;
}

export interface TicketContext {
  id: string;
  subject: string;
  customer_name: string;
  priority: "low" | "medium" | "high";
  status: "open" | "pending" | "resolved";
  messages: { sender_type: string; body: string }[];
}

type Plan = { thought: string; calls: { tool: ToolName; input: Record<string, unknown> }[] };

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function planFromPrompt(prompt: string, ctx: TicketContext): Plan {
  const p = prompt.toLowerCase();
  const calls: Plan["calls"] = [];

  const wantsKB =
    /(search|find|look up|policy|knowledge|kb|article|refund policy|shipping|return)/.test(p);
  const wantsDraft = /(draft|write|compose|reply|response|apolog)/.test(p);
  const wantsSend = /(send|email the customer|notify|confirm.*email|send.*email)/.test(p);
  const wantsClose = /(close|resolve|mark.*resolved|status.*resolved|set.*pending|mark.*pending)/.test(p);
  const wantsSummary = /(summari[sz]e|summary|tl;?dr|brief)/.test(p);

  let query = "general support";
  if (/refund/.test(p)) query = "refund policy";
  else if (/shipping|delivery|package|tracking/.test(p)) query = "shipping delays";
  else if (/login|account|password/.test(p)) query = "account access";
  else if (/billing|charge|subscription/.test(p)) query = "billing disputes";

  if (wantsKB || wantsDraft || wantsSend || wantsSummary) {
    calls.push({ tool: "searchKnowledgeBase", input: { query } });
  }

  if (wantsDraft || wantsSend || wantsSummary) {
    const body = buildDraftBody(ctx, p);
    calls.push({ tool: "draftReply", input: { ticketId: ctx.id, body } });
  }

  if (wantsSend) {
    const subject = `Re: ${ctx.subject}`;
    const body = buildDraftBody(ctx, p);
    calls.push({
      tool: "sendEmail",
      // Recipient is resolved server-side from the ticket record so customer
      // email PII never has to travel through the client.
      input: { subject, body, ticketId: ctx.id },
    });
  }

  if (wantsClose) {
    const newStatus = /pending/.test(p) ? "pending" : "resolved";
    calls.push({
      tool: "updateTicketStatus",
      input: {
        ticketId: ctx.id,
        newStatus,
        reason: `Customer issue handled per copilot session`,
      },
    });
  }

  if (calls.length === 0) {
    // Default: at least summarize via KB + draft
    calls.push({ tool: "searchKnowledgeBase", input: { query } });
    calls.push({
      tool: "draftReply",
      input: { ticketId: ctx.id, body: buildDraftBody(ctx, p) },
    });
  }

  return { thought: `Planning ${calls.length} step(s) to handle: "${prompt}"`, calls };
}

function buildDraftBody(ctx: TicketContext, prompt: string) {
  const first = ctx.customer_name.split(" ")[0];
  const apolog = /apolog|sorry|delay/.test(prompt) ? "I'm really sorry for the delay and frustration this has caused. " : "";
  const refund = /refund/.test(prompt.toLowerCase()) || /refund/.test(ctx.subject.toLowerCase())
    ? "I've confirmed your refund is being processed and you should see the funds back on your original payment method within 5–7 business days. "
    : "I've reviewed your case and we're moving it forward right away. ";
  return `Hi ${first},\n\n${apolog}Thanks for your patience while we looked into "${ctx.subject}". ${refund}If anything else comes up, just reply here and I'll jump back in.\n\nBest,\nThe Support Team`;
}

// Tool implementations -------------------------------------------------

export async function runSearchKnowledgeBase(input: { query: string }) {
  const q = String(input.query || "").toLowerCase();
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  const { data } = await supabase.from("knowledge_base").select("*");
  const scored = (data ?? []).map((a) => {
    const hay = `${a.title} ${a.content} ${(a.tags || []).join(" ")}`.toLowerCase();
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += 1;
    return { ...a, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((a) => ({
    id: a.id,
    title: a.title,
    excerpt: a.content.slice(0, 200) + (a.content.length > 200 ? "…" : ""),
    score: a.score,
  }));
}

export async function runDraftReply(input: { ticketId: string; body: string }) {
  const { data, error } = await supabase
    .from("drafts")
    .insert({ ticket_id: input.ticketId, body: input.body })
    .select()
    .single();
  if (error) throw error;
  return { draftId: data.id, body: data.body };
}

export async function createApprovalRequest(
  ticketId: string,
  tool: ToolName,
  input: Record<string, unknown>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("pending_approvals")
    .insert({
      ticket_id: ticketId,
      tool_name: tool,
      tool_input: input as never,
      status: "pending",
      requested_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Side-effecting tool execution now lives in src/lib/approvals.functions.ts
// (resolveApproval) so it can be gated by a server-side supervisor check.

export { planFromPrompt, newId };