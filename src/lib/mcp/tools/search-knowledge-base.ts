import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_knowledge_base",
  title: "Search knowledge base",
  description: "Search support knowledge base articles by keyword and return the best matches.",
  inputSchema: { query: z.string().describe("Keywords to search for.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await supabaseForUser(ctx).from("knowledge_base").select("id, title, content, tags");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const results = (data ?? [])
      .map((a) => {
        const hay = `${a.title} ${a.content} ${(a.tags ?? []).join(" ")}`.toLowerCase();
        const score = tokens.reduce((n, t) => (hay.includes(t) ? n + 1 : n), 0);
        return { id: a.id, title: a.title, excerpt: a.content.slice(0, 300), score };
      })
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { content: [{ type: "text", text: JSON.stringify(results) }], structuredContent: { results } };
  },
});
