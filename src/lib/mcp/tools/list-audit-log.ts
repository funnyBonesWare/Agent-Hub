import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_audit_log",
  title: "List audit log entries",
  description: "Read the immutable audit trail of executed and denied AI tool calls (supervisors only).",
  inputSchema: {
    ticket_id: z.string().optional().describe("Only entries for this ticket."),
    limit: z.number().int().optional().describe("Max rows to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ ticket_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let query = supabaseForUser(ctx)
      .from("audit_log")
      .select("id, ticket_id, tool_name, tool_input, outcome, created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 25, 1), 100));
    if (ticket_id) query = query.eq("ticket_id", ticket_id);
    const { data, error } = await query;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { entries: data ?? [] } };
  },
});
