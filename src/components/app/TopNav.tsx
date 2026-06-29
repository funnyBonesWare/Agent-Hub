import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shield, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { RoleBadge } from "./badges";
import { ReplayTourButton } from "./ProductTour";
import { cn } from "@/lib/utils";

function NavLink({ to, children, dataTour }: { to: string; children: React.ReactNode; dataTour?: string }) {
  return (
    <Link
      to={to}
      className="text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground data-[status=active]:font-medium"
      activeOptions={{ exact: to === "/" }}
      data-tour={dataTour}
    >
      {children}
    </Link>
  );
}

export function TopNav() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { count } = await supabase
        .from("pending_approvals")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      setPending(count ?? 0);
    };
    load();
    const ch = supabase
      .channel("pending-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pending_approvals" },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card/30 px-4 backdrop-blur">
      <div className="flex items-center gap-8">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Shield className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Agent Gate</span>
        </Link>
        <nav className="flex items-center gap-5">
          <NavLink to="/" dataTour="nav-inbox">Inbox</NavLink>
          <Link
            to="/approvals"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground data-[status=active]:font-medium"
            data-tour="nav-approvals"
          >
            Approval Queue
            {pending > 0 && (
              <span className={cn(
                "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500/20 px-1 text-[10px] font-semibold text-amber-300"
              )}>
                {pending}
              </span>
            )}
          </Link>
          <NavLink to="/audit" dataTour="nav-audit">Audit Log</NavLink>
          <NavLink to="/settings" dataTour="nav-settings">Settings</NavLink>
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <ReplayTourButton />
        {profile && (
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-xs font-medium">{profile.full_name}</div>
              <div className="text-[10px] text-muted-foreground">{profile.email}</div>
            </div>
            <RoleBadge role={profile.role} />
          </div>
        )}
        <button
          onClick={async () => {
            await signOut();
            navigate({ to: "/auth" });
          }}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Sign out"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </header>
  );
}