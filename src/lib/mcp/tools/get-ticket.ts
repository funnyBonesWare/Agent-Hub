import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_ticket",
  title: "Get ticket with conversation",
  description: "Fetch one ticket plus its full conversation thread and any saved drafts.",
  inputSchema: { ticket_id: z.string().describe("The ticket UUID.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ ticket_id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data: ticket, error } = await supabase
      .from("tickets")
      .select("id, subject, customer_name, status, priority, created_at, updated_at")
      .eq("id", ticket_id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!ticket) return { content: [{ type: "text", text: "Ticket not found" }], isError: true };
    const { data: messages } = await supabase
      .from("messages")
      .select("id, sender_type, body, created_at")
      .eq("ticket_id", ticket_id)
      .order("created_at", { ascending: true });
    const { data: drafts } = await supabase
      .from("drafts")
      .select("id, body, created_at")
      .eq("ticket_id", ticket_id)
      .order("created_at", { ascending: false });
    const payload = { ticket, messages: messages ?? [], drafts: drafts ?? [] };
    return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
  },
});
