import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PriorityDot, StatusBadge } from "./badges";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";

export interface TicketRow {
  id: string;
  subject: string;
  customer_name: string;
  customer_email: string;
  status: "open" | "pending" | "resolved";
  priority: "low" | "medium" | "high";
  created_at: string;
  updated_at: string;
}

type Filter = "all" | "open" | "pending" | "resolved";

export function TicketList({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (t: TicketRow) => void;
}) {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("tickets")
        .select("*")
        .order("updated_at", { ascending: false });
      setTickets((data ?? []) as TicketRow[]);
    };
    load();
    const ch = supabase
      .channel("tickets-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        load,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const filtered = useMemo(() => {
    return tickets
      .filter((t) => (filter === "all" ? true : t.status === filter))
      .filter((t) => {
        if (!query) return true;
        const q = query.toLowerCase();
        return (
          t.subject.toLowerCase().includes(q) ||
          t.customer_email.toLowerCase().includes(q) ||
          t.customer_name.toLowerCase().includes(q)
        );
      });
  }, [tickets, filter, query]);

  // Auto-select first ticket if none active
  useEffect(() => {
    if (!activeId && filtered.length > 0) onSelect(filtered[0]);
  }, [activeId, filtered, onSelect]);

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tickets…"
            className="h-8 w-full rounded-md border border-border bg-background/60 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div className="mt-2 flex gap-1">
          {(["all", "open", "pending", "resolved"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-2 py-1 text-[10px] uppercase tracking-wide transition-colors",
                filter === f
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.map((t) => {
          const updated = new Date(t.updated_at);
          const isRecent = Date.now() - updated.getTime() < 1000 * 60 * 60;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className={cn(
                "block w-full border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-accent/40",
                activeId === t.id && "bg-accent/60",
              )}
            >
              <div className="flex items-center gap-2">
                <PriorityDot priority={t.priority} />
                <div className="flex-1 truncate text-xs font-medium text-foreground">
                  {t.subject}
                </div>
                {isRecent && <span className="size-1.5 rounded-full bg-blue-400" />}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="truncate text-[11px] text-muted-foreground">
                  {t.customer_name}
                </span>
                <StatusBadge status={t.status} />
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {formatDistanceToNowStrict(updated, { addSuffix: true })}
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="p-8 text-center text-xs text-muted-foreground">No tickets match.</p>
        )}
      </div>
    </aside>
  );
}