import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_AUTO_TOOLS = new Set(["searchKnowledgeBase", "draftReply"]);

interface AuditAutoInput {
  ticket_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export const recordAutoAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AuditAutoInput) => {
    if (!input || typeof input.ticket_id !== "string") {
      throw new Error("ticket_id is required");
    }
    if (typeof input.tool_name !== "string" || !ALLOWED_AUTO_TOOLS.has(input.tool_name)) {
      throw new Error("tool_name is not auto-auditable");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("audit_log").insert({
      ticket_id: data.ticket_id,
      tool_name: data.tool_name,
      tool_input: data.tool_input as never,
      outcome: "auto_completed",
      user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });