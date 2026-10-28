import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Shield, LogOut, Plus, Pencil, Trash2, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Member } from "@/components/FamilyTree";

type RoleState = "loading" | "admin" | "none";

interface AdminButtonProps {
  members: Member[];
  openAdd: () => void;
  openEdit: (m: Member) => void;
  remove: (id: string) => void;
  exportJson: () => void;
  importJson: (file: File) => void;
}

const AdminButton = ({
  members,
  openAdd,
  openEdit,
  remove,
  exportJson,
  importJson,
}: AdminButtonProps) => {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<RoleState>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ?? null);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setRole("loading");
      return;
    }
    let mounted = true;
    setRole("loading");
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (mounted) {
          setRole(data?.some((r) => r.role === "admin") ? "admin" : "none");
        }
      });
    return () => {
      mounted = false;
    };
  }, [user]);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (err) {
      setError(err.message);
    } else if (data.user) {
      setUser(data.user);
      setEmail("");
      setPassword("");
      toast.success("Admin logged in");
    }
    setBusy(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole("loading");
    setOpen(false);
    toast.success("Signed out");
  };

  return (
    <>
      <input
        type="file"
        accept="application/json"
        id="admin-import-input"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label="Admin login"
            className={cn(
              "min-h-11 gap-1.5 rounded-xl border-primary/40 text-primary",
              "hover:bg-primary/10 hover:text-primary",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-ring focus-visible:ring-offset-2",
              "focus-visible:ring-offset-background",
              "transition-transform active:scale-95",
            )}
          >
            <Shield className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Admin</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md bg-card border-border/60">
          {!user ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                signIn();
              }}
              className="grid gap-4 py-2"
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" /> Admin login
                </DialogTitle>
                <DialogDescription>
                  Sign in with the admin account to manage the family tree.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor="admin-email">Email</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="admin-password">Password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={busy || !email.trim() || !password}
                  className="w-full sm:w-auto"
                >
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
              </DialogFooter>
            </form>
          ) : role === "loading" ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Checking access…
            </p>
          ) : role === "none" ? (
            <div className="grid gap-4 py-2">
              <DialogHeader>
                <DialogTitle>Not an admin</DialogTitle>
                <DialogDescription>
                  This account does not have admin access.
                </DialogDescription>
              </DialogHeader>
              <Button variant="outline" onClick={signOut}>
                <LogOut className="mr-1 h-4 w-4" /> Sign out
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" /> Admin panel
                </DialogTitle>
                <DialogDescription className="truncate">
                  Signed in as {user.email}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={openAdd}>
                  <Plus className="mr-1 h-4 w-4" /> Add member
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    document.getElementById("admin-import-input")?.click()
                  }
                >
                  <Upload className="mr-1 h-4 w-4" /> Import
                </Button>
                <Button size="sm" variant="outline" onClick={exportJson}>
                  <Download className="mr-1 h-4 w-4" /> Export
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={signOut}
                  className="ml-auto"
                >
                  <LogOut className="mr-1 h-4 w-4" /> Sign out
                </Button>
              </div>
              <ul className="grid max-h-72 gap-2 overflow-y-auto">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
                            m.gender === "male" && "bg-primary",
                            m.gender === "female" && "bg-accent",
                            m.gender === "other" && "bg-equals",
                          )}
                          aria-hidden="true"
                        />
                        <span className="truncate font-medium text-foreground">
                          {m.name}
                        </span>
                        {m.birthYear && (
                          <span className="text-xs text-muted-foreground">
                            ({m.birthYear})
                          </span>
                        )}
                      </div>
                      <div className="text-xs capitalize text-muted-foreground">
                        {m.gender}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(m)}
                        aria-label={`Edit ${m.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => remove(m.id)}
                        aria-label={`Delete ${m.name}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminButton;
