import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_approvals",
  title: "List approval requests",
  description: "List AI tool-call approval requests in the human approval queue.",
  inputSchema: {
    status: z.enum(["pending", "approved", "denied"]).optional().describe("Filter by approval status (default pending)."),
    limit: z.number().int().optional().describe("Max rows to return (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await supabaseForUser(ctx)
      .from("pending_approvals")
      .select("id, ticket_id, tool_name, tool_input, status, denial_reason, created_at, resolved_at")
      .eq("status", status ?? "pending")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 20, 1), 100));
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { approvals: data ?? [] } };
  },
});
