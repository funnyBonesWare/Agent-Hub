import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TicketRow } from "./TicketList";
import { StatusBadge, PriorityDot } from "./badges";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";

interface Msg {
  id: string;
  ticket_id: string;
  sender_type: "customer" | "agent" | "system";
  body: string;
  created_at: string;
}

export function ConversationThread({
  ticket,
  composerSeed,
  onComposerConsumed,
}: {
  ticket: TicketRow;
  composerSeed?: string;
  onComposerConsumed?: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (composerSeed) {
      setText(composerSeed);
      onComposerConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerSeed]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("ticket_id", ticket.id)
        .order("created_at", { ascending: true });
      if (!cancelled) setMessages((data ?? []) as Msg[]);
    };
    load();
    const ch = supabase
      .channel(`messages-${ticket.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `ticket_id=eq.${ticket.id}` },
        (payload) => setMessages((prev) => [...prev, payload.new as Msg]),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [ticket.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    const { error } = await supabase
      .from("messages")
      .insert({ ticket_id: ticket.id, sender_type: "agent", body: text.trim() });
    await supabase.from("tickets").update({ status: ticket.status }).eq("id", ticket.id);
    setSending(false);
    if (error) return toast.error(error.message);
    setText("");
  }

  async function updateStatus(newStatus: TicketRow["status"]) {
    await supabase.from("tickets").update({ status: newStatus }).eq("id", ticket.id);
    toast.success(`Status set to ${newStatus}`);
  }

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card/30 px-5 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{ticket.subject}</h2>
          <p className="text-[11px] text-muted-foreground">
            {ticket.customer_name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <PriorityDot priority={ticket.priority} />
            <span className="uppercase">{ticket.priority}</span>
          </div>
          <select
            value={ticket.status}
            onChange={(e) => updateStatus(e.target.value as TicketRow["status"])}
            className="rounded-md border border-border bg-background/60 px-2 py-1 text-xs focus:border-primary focus:outline-none"
          >
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
          </select>
          <StatusBadge status={ticket.status} />
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex",
              m.sender_type === "agent" && "justify-end",
              m.sender_type === "system" && "justify-center",
            )}
          >
            {m.sender_type === "system" ? (
              <div className="rounded-full border border-border bg-muted/40 px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {m.body} · {format(new Date(m.created_at), "p")}
              </div>
            ) : (
              <div
                className={cn(
                  "max-w-[75%] rounded-lg border px-3 py-2 text-sm",
                  m.sender_type === "agent"
                    ? "border-primary/30 bg-primary/10 text-foreground"
                    : "border-border bg-card text-foreground",
                )}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {m.sender_type === "agent" ? "You" : ticket.customer_name} ·{" "}
                  {format(new Date(m.created_at), "MMM d, p")}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-border bg-card/30 p-3">
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Reply to the customer…"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
            }}
            className="min-h-[64px] flex-1 resize-none rounded-md border border-border bg-background/60 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <Button onClick={send} disabled={sending || !text.trim()} className="self-end">
            <Send className="size-3.5" /> Send
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">⌘+Enter to send</p>
      </div>
    </section>
  );
}