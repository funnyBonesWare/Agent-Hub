import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { TopNav } from "@/components/app/TopNav";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: () => (
    <div className="flex h-screen flex-col bg-background">
      <TopNav />
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  ),
});