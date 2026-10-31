import { useState } from "react";
import { Info, Phone, BarChart3, MessageCircle, Users, Heart, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Member } from "@/components/FamilyTree";
import { familyContact, getFamilyStats } from "@/lib/family-stats";

type View = "about" | "contact" | "stats";
const views = [
  { id: "about" as const, label: "About", icon: Info },
  { id: "contact" as const, label: "Contact", icon: Phone },
  { id: "stats" as const, label: "Stats", icon: BarChart3 },
];

export default function FamilyInfo({ title, members }: { title: string; members: Member[] }) {
  const [view, setView] = useState<View | null>(null);
  const stats = getFamilyStats(members);
  const selected = views.find((item) => item.id === view);
  return (
    <>
      <nav aria-label="Website information" className="relative z-10 grid grid-cols-3 gap-2 sm:flex sm:gap-3">
        {views.map(({ id, label, icon: Icon }) => (
          <Button key={id} variant="outline" className="h-11 gap-2 rounded-lg border-primary/30 bg-card/80 sm:min-w-28" onClick={() => setView(id)} aria-haspopup="dialog" aria-expanded={view === id}>
            <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{label}
          </Button>
        ))}
      </nav>
      <Dialog open={view !== null} onOpenChange={(open) => { if (!open) setView(null); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto border-border/60 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">{selected && <selected.icon className="h-5 w-5 text-primary" />} {selected?.label}</DialogTitle>
            <DialogDescription className="break-words">{title}</DialogDescription>
          </DialogHeader>
          {view === "about" && (
            <div className="grid gap-4 py-2">
              <TreeIdentity title={title} />
              <p className="text-sm leading-relaxed text-muted-foreground">A shared family record, connecting relatives across generations and preserving the names and relationships that bring a family together.</p>
              <p className="flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-primary" />{stats.total} recorded members</p>
            </div>
          )}
          {view === "contact" && (
            <div className="grid gap-5 py-2">
              <div className="grid gap-1"><p className="text-sm text-muted-foreground">Website contact</p><a href={familyContact.phone} className="w-fit text-xl font-semibold text-foreground underline-offset-4 hover:underline">{familyContact.display}</a></div>
              <div className="grid grid-cols-2 gap-3">
                <Button asChild className="h-11 gap-2"><a href={familyContact.phone}><Phone className="h-4 w-4" />Call</a></Button>
                <Button asChild variant="outline" className="h-11 gap-2"><a href={familyContact.whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" />WhatsApp</a></Button>
              </div>
            </div>
          )}
          {view === "stats" && (
            <dl className="grid gap-1 py-2">
              {[
                { label: "Total members", value: stats.total, icon: Users },
                { label: "Spouse pairs", value: stats.couples, icon: Heart },
                { label: "Parent–child links", value: stats.parentLinks, icon: GitBranch },
                { label: "Male", value: stats.male },
                { label: "Female", value: stats.female },
                { label: "Other", value: stats.other },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-center justify-between gap-3 border-b border-border/60 py-3 last:border-0">
                  <dt className="flex items-center gap-2 text-sm text-muted-foreground">{Icon && <Icon className="h-4 w-4 text-primary" />}{label}</dt>
                  <dd className="text-xl font-semibold tabular-nums text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function TreeIdentity({ title }: { title: string }) {
  return <h2 className="break-words text-xl font-semibold text-foreground">{title}</h2>;
}