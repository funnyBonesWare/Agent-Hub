import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { X, ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Role = "agent" | "supervisor";

interface TourStep {
  key: string;
  title: string;
  body: string;
  selector?: string;
  route?: string;
  roles?: Role[];
  placement?: "auto" | "center";
}

const STORAGE_PREFIX = "agentgate-tour-v1:";

const STEPS: TourStep[] = [
  {
    key: "welcome",
    title: "Welcome to Agent Gate",
    body: "A 60-second tour of how humans and the AI copilot share work — every side-effecting action stops at an approval gate.",
    placement: "center",
  },
  {
    key: "inbox",
    title: "Your ticket inbox",
    body: "Customer conversations are listed here. Filter by status, search by name or subject, and click a ticket to open the thread.",
    selector: "[data-tour='tickets']",
    route: "/",
  },
  {
    key: "thread",
    title: "Conversation thread",
    body: "Read the full customer history and reply directly. Drafts the copilot writes for you land in the composer below.",
    selector: "[data-tour='conversation']",
    route: "/",
  },
  {
    key: "copilot",
    title: "The AI copilot",
    body: "Ask it to summarize, search the knowledge base, draft a reply, or update a ticket. Read-only tools run instantly; anything that touches the outside world pauses for approval.",
    selector: "[data-tour='copilot']",
    route: "/",
  },
  {
    key: "approvals",
    title: "Approval queue",
    body: "Every send-email or status-change proposed by the copilot waits here. Approve to execute, deny to reject — both are logged.",
    selector: "[data-tour='nav-approvals']",
    route: "/approvals",
  },
  {
    key: "audit",
    title: "Audit log",
    body: "An immutable record of every approval decision and tool execution. Supervisors use this to review what the agent actually did.",
    selector: "[data-tour='nav-audit']",
    route: "/audit",
    roles: ["supervisor"],
  },
  {
    key: "settings",
    title: "Policy settings",
    body: "Configure which tools can auto-execute and which always require a human signature. Tighten the gate as trust grows.",
    selector: "[data-tour='nav-settings']",
    route: "/settings",
    roles: ["supervisor"],
  },
  {
    key: "done",
    title: "You're ready",
    body: "Open a ticket and ask the copilot for help. You can replay this tour any time from the top-right Tutorial button.",
    placement: "center",
  },
];

function useTargetRect(selector: string | undefined, idx: number) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };
    // Wait a frame for route content to mount.
    raf = window.requestAnimationFrame(() => {
      tick();
      window.setTimeout(tick, 250);
    });
    const onResize = () => tick();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [selector, idx]);
  return rect;
}

export function ProductTour() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const startedRef = useRef(false);

  const steps = useMemo(
    () => STEPS.filter((s) => !s.roles || (profile && s.roles.includes(profile.role))),
    [profile],
  );

  const storageKey = user ? `${STORAGE_PREFIX}${user.id}` : null;

  // Auto-launch on first sign-in.
  useEffect(() => {
    if (!storageKey || startedRef.current) return;
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(storageKey);
    if (!seen) {
      startedRef.current = true;
      setIdx(0);
      setOpen(true);
    }
  }, [storageKey]);

  // Listen for manual replay events.
  useEffect(() => {
    const handler = () => {
      setIdx(0);
      setOpen(true);
    };
    window.addEventListener("agentgate:start-tour", handler);
    return () => window.removeEventListener("agentgate:start-tour", handler);
  }, []);

  const step = steps[idx];

  // Navigate to step's route when needed.
  useEffect(() => {
    if (!open || !step?.route) return;
    if (location !== step.route) {
      navigate({ to: step.route });
    }
  }, [open, step, location, navigate]);

  const rect = useTargetRect(open ? step?.selector : undefined, idx);

  if (!open || !step) return null;

  const close = (markDone: boolean) => {
    if (markDone && storageKey) {
      window.localStorage.setItem(storageKey, new Date().toISOString());
    }
    setOpen(false);
  };

  const isLast = idx === steps.length - 1;
  const centered = step.placement === "center" || !rect;

  // Compute card position
  const card: React.CSSProperties = centered
    ? {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      }
    : (() => {
        const margin = 12;
        const cardW = 360;
        const cardH = 200;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        // Try below
        let top = rect!.bottom + margin;
        let left = rect!.left;
        if (top + cardH > vh - 16) {
          // Try above
          top = Math.max(16, rect!.top - cardH - margin);
        }
        if (left + cardW > vw - 16) {
          left = Math.max(16, vw - cardW - 16);
        }
        if (left < 16) left = 16;
        return { top, left };
      })();

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]">
      {/* Dim overlay with spotlight cutout via 4 panels */}
      {centered ? (
        <div className="pointer-events-auto absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => close(false)} />
      ) : (
        <SpotlightOverlay rect={rect!} onClick={() => close(false)} />
      )}

      {/* Highlight ring around target */}
      {!centered && rect && (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-primary shadow-[0_0_0_4px_rgba(16,185,129,0.15)] transition-all"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}

      {/* Tour card */}
      <div
        className="pointer-events-auto absolute w-[360px] rounded-xl border border-border bg-card p-4 shadow-2xl"
        style={card}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Sparkles className="size-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Step {idx + 1} of {steps.length}
              </div>
              <div className="text-sm font-semibold text-foreground">{step.title}</div>
            </div>
          </div>
          <button
            onClick={() => close(true)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close tutorial"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>

        {/* Progress dots */}
        <div className="mt-4 flex items-center gap-1">
          {steps.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setIdx(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === idx ? "w-6 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground",
              )}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => close(true)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-1.5">
            <button
              disabled={idx === 0}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-40"
            >
              <ArrowLeft className="size-3" /> Back
            </button>
            {isLast ? (
              <button
                onClick={() => close(true)}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Finish
              </button>
            ) : (
              <button
                onClick={() => setIdx((i) => Math.min(steps.length - 1, i + 1))}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Next <ArrowRight className="size-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SpotlightOverlay({ rect, onClick }: { rect: DOMRect; onClick: () => void }) {
  const pad = 6;
  const top = Math.max(0, rect.top - pad);
  const left = Math.max(0, rect.left - pad);
  const right = Math.max(0, window.innerWidth - rect.right - pad);
  const bottom = Math.max(0, window.innerHeight - rect.bottom - pad);
  const panel = "pointer-events-auto absolute bg-background/80 backdrop-blur-sm";
  return (
    <>
      <div className={panel} style={{ top: 0, left: 0, right: 0, height: top }} onClick={onClick} />
      <div className={panel} style={{ bottom: 0, left: 0, right: 0, height: bottom }} onClick={onClick} />
      <div className={panel} style={{ top, left: 0, width: left, bottom }} onClick={onClick} />
      <div className={panel} style={{ top, right: 0, width: right, bottom }} onClick={onClick} />
    </>
  );
}

export function ReplayTourButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("agentgate:start-tour"))}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Sparkles className="size-3" /> Tutorial
    </button>
  );
}