import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TicketList, type TicketRow } from "@/components/app/TicketList";
import { ConversationThread } from "@/components/app/ConversationThread";
import { CopilotPanel } from "@/components/app/CopilotPanel";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Inbox — Agent Gate" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    ticket: typeof s.ticket === "string" ? s.ticket : undefined,
  }),
  component: InboxPage,
});

function InboxPage() {
  const { ticket: ticketParam } = Route.useSearch();
  const [active, setActive] = useState<TicketRow | null>(null);
  const [ticketMessages, setTicketMessages] = useState<{ sender_type: string; body: string }[]>([]);
  const [composerSeed, setComposerSeed] = useState<string | undefined>();

  useEffect(() => {
    if (!ticketParam) return;
    if (active?.id === ticketParam) return;
    supabase
      .from("tickets")
      .select("*")
      .eq("id", ticketParam)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setActive(data as TicketRow);
      });
  }, [ticketParam, active?.id]);

  useEffect(() => {
    if (!active) return;
    supabase
      .from("messages")
      .select("sender_type,body")
      .eq("ticket_id", active.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => setTicketMessages(data ?? []));
  }, [active]);

  return (
    <div className="flex h-full">
      <div data-tour="tickets" className="contents">
        <TicketList activeId={active?.id ?? null} onSelect={setActive} />
      </div>
      {active ? (
        <>
          <div data-tour="conversation" className="contents">
            <ConversationThread
              ticket={active}
              composerSeed={composerSeed}
              onComposerConsumed={() => setComposerSeed(undefined)}
            />
          </div>
          <div data-tour="copilot" className="contents">
            <CopilotPanel
            ticket={{
              id: active.id,
              subject: active.subject,
              customer_name: active.customer_name,
              customer_email: active.customer_email,
              priority: active.priority,
              status: active.status,
              messages: ticketMessages,
            }}
              onCopyDraft={(text) => setComposerSeed(text)}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Select a ticket to begin
        </div>
      )}
    </div>
  );
}