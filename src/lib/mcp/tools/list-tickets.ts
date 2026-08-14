import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_tickets",
  title: "List support tickets",
  description: "List support tickets, optionally filtered by status or priority.",
  inputSchema: {
    status: z.enum(["open", "pending", "resolved"]).optional().describe("Filter by ticket status."),
    priority: z.enum(["low", "medium", "high"]).optional().describe("Filter by priority."),
    limit: z.number().int().optional().describe("Max tickets to return (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, priority, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let query = supabaseForUser(ctx)
      .from("tickets")
      .select("id, subject, customer_name, status, priority, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 20, 1), 100));
    if (status) query = query.eq("status", status);
    if (priority) query = query.eq("priority", priority);
    const { data, error } = await query;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { tickets: data ?? [] } };
  },
});
