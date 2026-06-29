import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Decision = "approve" | "deny";

interface ResolveInput {
  approvalId: string;
  decision: Decision;
  denialReason?: string;
}

export const resolveApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ResolveInput) => {
    if (!input || typeof input.approvalId !== "string") {
      throw new Error("approvalId is required");
    }
    if (input.decision !== "approve" && input.decision !== "deny") {
      throw new Error("decision must be 'approve' or 'deny'");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    // Verify supervisor role
    const { data: isSupervisor, error: roleErr } = await context.supabase.rpc(
      "has_role",
      { _user_id: context.userId, _role: "supervisor" },
    );
    if (roleErr) throw new Error(roleErr.message);
    if (!isSupervisor) throw new Error("Forbidden: supervisor role required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Atomically claim the pending approval: only succeeds if still pending.
    const newStatus = data.decision === "approve" ? "approved" : "denied";
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from("pending_approvals")
      .update({
        status: newStatus,
        resolved_by: context.userId,
        resolved_at: new Date().toISOString(),
        denial_reason:
          data.decision === "deny"
            ? data.denialReason ?? "Denied from queue"
            : null,
      })
      .eq("id", data.approvalId)
      .eq("status", "pending")
      .select()
      .single();

    if (claimErr || !claimed) {
      throw new Error("Approval is no longer pending");
    }

    const toolName = claimed.tool_name as string;
    const toolInput = (claimed.tool_input ?? {}) as Record<string, unknown>;
    const ticketId = claimed.ticket_id as string;

    // Execute side-effecting tool only on approval, server-side, with service role.
    if (data.decision === "approve") {
      try {
        if (toolName === "sendEmail") {
          const to = String(toolInput.to ?? "");
          const subject = String(toolInput.subject ?? "");
          await supabaseAdmin.from("messages").insert({
            ticket_id: ticketId,
            sender_type: "system",
            body: `Email sent to ${to} — Subject: ${subject}`,
          });
        } else if (toolName === "updateTicketStatus") {
          const newTicketStatus = String(toolInput.newStatus ?? "open") as
            | "open"
            | "pending"
            | "resolved";
          const reason = String(toolInput.reason ?? "");
          await supabaseAdmin
            .from("tickets")
            .update({ status: newTicketStatus })
            .eq("id", ticketId);
          await supabaseAdmin.from("messages").insert({
            ticket_id: ticketId,
            sender_type: "system",
            body: `Ticket status changed to ${newTicketStatus} — ${reason}`,
          });
        } else if (toolName === "issueRefund") {
          const orderId = String(toolInput.orderId ?? "");
          const amount = toolInput.amount;
          const currency = String(toolInput.currency ?? "USD");
          await supabaseAdmin.from("messages").insert({
            ticket_id: ticketId,
            sender_type: "system",
            body: `Refund issued for order ${orderId} — ${amount} ${currency}`,
          });
        }
      } catch (e) {
        await supabaseAdmin.from("audit_log").insert({
          ticket_id: ticketId,
          tool_name: toolName,
          tool_input: toolInput as never,
          outcome: "failed",
          user_id: claimed.requested_by ?? context.userId,
          approver_id: context.userId,
        });
        throw new Error(
          `Tool execution failed: ${(e as Error).message ?? "unknown"}`,
        );
      }
    }

    await supabaseAdmin.from("audit_log").insert({
      ticket_id: ticketId,
      tool_name: toolName,
      tool_input: toolInput as never,
      outcome: data.decision === "approve" ? "approved" : "denied",
      user_id: claimed.requested_by ?? context.userId,
      approver_id: context.userId,
    });

    return { ok: true, status: newStatus };
  });