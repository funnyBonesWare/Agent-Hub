import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: "open" | "pending" | "resolved" }) {
  const map = {
    open: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    resolved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        map[status],
      )}
    >
      {status}
    </span>
  );
}

export function PriorityDot({ priority }: { priority: "low" | "medium" | "high" }) {
  const map = { low: "bg-zinc-500", medium: "bg-blue-400", high: "bg-red-500" } as const;
  return (
    <span
      title={`Priority: ${priority}`}
      className={cn("inline-block size-2 rounded-full", map[priority])}
    />
  );
}

export function RoleBadge({ role }: { role: "agent" | "supervisor" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        role === "supervisor"
          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
          : "bg-zinc-700/40 text-zinc-300 border-zinc-600/40",
      )}
    >
      {role}
    </span>
  );
}

export function ToolStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    awaiting_approval: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    denied: "bg-red-500/15 text-red-300 border-red-500/30",
    failed: "bg-red-500/15 text-red-300 border-red-500/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
        map[status] ?? "bg-zinc-700/40 text-zinc-300 border-zinc-600/40",
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-12 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}