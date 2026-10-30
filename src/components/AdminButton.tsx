import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, LogOut, Plus, Pencil, Trash2, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Member } from "@/components/FamilyTree";

interface AdminButtonProps {
  password: string | null;
  onLogin: (pw: string) => void;
  onLogout: () => void;
  members: Member[];
  title: string;
  saveTitle: (t: string) => void;
  openAdd: () => void;
  openEdit: (m: Member) => void;
  remove: (id: string) => void;
  exportJson: () => void;
  importJson: (file: File) => void;
}

const AdminButton = (p: AdminButtonProps) => {
  const [open, setOpen] = useState(false);
  const [hasPw, setHasPw] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState(p.title);
  const [newPw, setNewPw] = useState("");

  useEffect(() => setTitleDraft(p.title), [p.title]);
  useEffect(() => {
    if (open && !p.password)
      supabase.rpc("admin_has_password").then(({ data }) => setHasPw(!!data));
  }, [open, p.password]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    if (!hasPw) {
      const { error: e } = await supabase.rpc("admin_setup", { _password: pw });
      if (e) setError(e.message);
      else {
        p.onLogin(pw);
        toast.success("Admin password set");
      }
    } else {
      const { data } = await supabase.rpc("admin_check", { _password: pw });
      if (data) {
        p.onLogin(pw);
        toast.success("Admin logged in");
      } else setError("Wrong password");
    }
    setPw("");
    setBusy(false);
  };

  const changePw = async () => {
    const { error: e } = await supabase.rpc("admin_change_password", {
      _old: p.password!,
      _new: newPw,
    });
    if (e) toast.error(e.message);
    else {
      p.onLogin(newPw);
      setNewPw("");
      toast.success("Password changed");
    }
  };

  return (
    <>
      <input
        type="file"
        accept="application/json"
        id="admin-import-input"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && p.importJson(e.target.files[0])}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label="Admin"
            className={cn(
              "h-11 w-11 shrink-0 rounded-full p-0 border-primary/40 bg-card/80 text-primary backdrop-blur",
              "shadow-[0_0_16px_hsl(var(--primary)/0.3)] transition-transform active:scale-90",
              p.password && "bg-primary text-primary-foreground",
            )}
          >
            <Shield className="h-5 w-5" aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg bg-card border-border/60">
          {!p.password ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="grid gap-4 py-2"
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" /> Admin
                </DialogTitle>
                <DialogDescription>
                  {hasPw === false
                    ? "Pehli baar: admin password set karein (kam az kam 6 characters)."
                    : "Admin password daalein."}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor="admin-password">Password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={busy || !pw || hasPw === null}>
                {busy ? "…" : hasPw === false ? "Set password" : "Login"}
              </Button>
            </form>
          ) : (
            <div className="grid gap-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" /> Admin panel
                </DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="members">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="members">Members</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="members" className="grid gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => { setOpen(false); p.openAdd(); }}>
                      <Plus className="mr-1 h-4 w-4" /> Add
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => document.getElementById("admin-import-input")?.click()}>
                      <Upload className="mr-1 h-4 w-4" /> Import
                    </Button>
                    <Button size="sm" variant="outline" onClick={p.exportJson}>
                      <Download className="mr-1 h-4 w-4" /> Export
                    </Button>
                  </div>
                  <ul className="grid max-h-72 gap-2 overflow-y-auto">
                    {p.members.map((m) => {
                      const parent = p.members.find((x) => x.id === m.parentId);
                      const spouse = p.members.find((x) => x.id === m.spouseId);
                      return (
                        <li key={m.id} className="flex items-center justify-between gap-2 rounded-2xl bg-muted/40 px-3 py-2">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">
                              {m.name} {m.birthYear && <span className="text-xs text-muted-foreground">({m.birthYear})</span>}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {parent ? `Child of ${parent.name}` : "Root"}
                              {spouse ? ` • Spouse: ${spouse.name}` : ""}
                            </div>
                          </div>
                          <div className="flex shrink-0">
                            <Button size="icon" variant="ghost" aria-label={`Edit ${m.name}`} onClick={() => { setOpen(false); p.openEdit(m); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" aria-label={`Delete ${m.name}`} className="text-destructive hover:text-destructive" onClick={() => p.remove(m.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </TabsContent>
                <TabsContent value="settings" className="grid gap-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="site-title">Website title</Label>
                    <div className="flex gap-2">
                      <Input id="site-title" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} />
                      <Button onClick={() => p.saveTitle(titleDraft)}>Save</Button>
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="new-pw">New admin password</Label>
                    <div className="flex gap-2">
                      <Input id="new-pw" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                      <Button variant="outline" disabled={newPw.length < 6} onClick={changePw}>Change</Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
              <Button variant="ghost" onClick={() => { p.onLogout(); setOpen(false); }}>
                <LogOut className="mr-1 h-4 w-4" /> Logout
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminButton;
