import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTickets from "./tools/list-tickets";
import getTicket from "./tools/get-ticket";
import searchKnowledgeBase from "./tools/search-knowledge-base";
import listApprovals from "./tools/list-pending-approvals";
import listAuditLog from "./tools/list-audit-log";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "agent-gate",
  title: "Agent Gate",
  version: "0.1.0",
  instructions:
    "Read-only tools for the Agent Gate support desk. Use list_tickets/get_ticket to inspect support conversations, search_knowledge_base for policy answers, list_approvals to see AI actions waiting on human approval, and list_audit_log for the executed-action trail. Approving or denying actions must be done by a human in the Agent Gate app.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listTickets, getTicket, searchKnowledgeBase, listApprovals, listAuditLog],
});
