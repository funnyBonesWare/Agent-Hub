import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Agent Gate" }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"agent" | "supervisor">("agent");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/" });
    });
  }, [nav]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    nav({ to: "/" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: name || email.split("@")[0], role },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created — signing you in");
    const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
    if (e2) return toast.error(e2.message);
    nav({ to: "/" });
  }

  function fill(kind: "agent" | "supervisor") {
    if (kind === "agent") {
      setEmail("agent@agentgate.demo");
      setPassword("AgentGate!123");
    } else {
      setEmail("supervisor@agentgate.demo");
      setPassword("AgentGate!123");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Shield className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Agent Gate</h1>
          <p className="text-sm text-muted-foreground">
            Human-in-the-loop AI for support agents
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-xl shadow-black/20">
          <Tabs defaultValue="signin">
            <TabsList className="mb-4 grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={signIn} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={signUp} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Full name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={8} />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <div className="flex gap-2">
                    {(["agent", "supervisor"] as const).map((r) => (
                      <button
                        type="button"
                        key={r}
                        onClick={() => setRole(r)}
                        className={`flex-1 rounded-md border px-3 py-1.5 text-xs ${
                          role === r
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Creating…" : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        <div className="rounded-lg border border-border bg-card/50 p-4 text-xs">
          <p className="mb-2 font-medium text-foreground">Demo accounts</p>
          <p className="mb-3 text-muted-foreground">
            Visit <a href="/setup" className="text-primary hover:underline">/setup</a> first to provision demo users.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => fill("agent")} className="rounded-md border border-border bg-background/40 p-2 text-left hover:border-primary/50">
              <div className="font-medium text-foreground">Agent</div>
              <div className="font-mono text-[10px] text-muted-foreground">agent@agentgate.demo</div>
            </button>
            <button onClick={() => fill("supervisor")} className="rounded-md border border-border bg-background/40 p-2 text-left hover:border-primary/50">
              <div className="font-medium text-foreground">Supervisor</div>
              <div className="font-mono text-[10px] text-muted-foreground">supervisor@agentgate.demo</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}