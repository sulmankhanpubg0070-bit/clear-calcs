import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Users, Download, Upload, TreePine } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Gender = "male" | "female" | "other";

interface Member {
  id: string;
  name: string;
  gender: Gender;
  birthYear?: string;
  parentId?: string | null;
  spouseId?: string | null;
}

const STORAGE_KEY = "family-tree:v1";

const seed: Member[] = [
  { id: "1", name: "Dada", gender: "male", birthYear: "1945", spouseId: "2" },
  { id: "2", name: "Dadi", gender: "female", birthYear: "1948", spouseId: "1" },
  { id: "3", name: "Papa", gender: "male", birthYear: "1972", parentId: "1", spouseId: "4" },
  { id: "4", name: "Mummy", gender: "female", birthYear: "1975", spouseId: "3" },
  { id: "5", name: "Aap", gender: "other", birthYear: "2000", parentId: "3" },
];

const FamilyTree = () => {
  const [members, setMembers] = useState<Member[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return seed;
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
  }, [members]);

  const upsert = (m: Member) => {
    setMembers((prev) => {
      const exists = prev.find((p) => p.id === m.id);
      let next = exists
        ? prev.map((p) => (p.id === m.id ? m : p))
        : [...prev, m];
      // Sync spouse symmetry
      next = next.map((p) => {
        if (p.id === m.spouseId) return { ...p, spouseId: m.id };
        if (p.spouseId === m.id && p.id !== m.spouseId) return p;
        if (p.id !== m.id && p.spouseId === m.id && m.spouseId !== p.id) {
          return { ...p, spouseId: undefined };
        }
        return p;
      });
      return next;
    });
  };

  const remove = (id: string) => {
    setMembers((prev) =>
      prev
        .filter((m) => m.id !== id)
        .map((m) => ({
          ...m,
          parentId: m.parentId === id ? null : m.parentId,
          spouseId: m.spouseId === id ? null : m.spouseId,
        })),
    );
    toast.success("Member removed");
  };

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (m: Member) => {
    setEditing(m);
    setDialogOpen(true);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(members, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "family-tree.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (Array.isArray(data)) {
          setMembers(data);
          toast.success("Tree imported");
        }
      } catch {
        toast.error("Invalid file");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:py-10 overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/30 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-accent/30 blur-[120px]" />

      {/* Header */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/20 text-primary shadow-[0_0_20px_hsl(var(--primary)/0.4)]">
            <TreePine className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Family Tree
            </h1>
            <p className="text-xs text-muted-foreground">
              {members.length} members
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="application/json"
            id="import-input"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => document.getElementById("import-input")?.click()}
          >
            <Upload className="mr-1 h-4 w-4" /> Import
          </Button>
          <Button variant="ghost" size="sm" onClick={exportJson}>
            <Download className="mr-1 h-4 w-4" /> Export
          </Button>
          <Sheet open={membersOpen} onOpenChange={setMembersOpen}>
            <SheetTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                aria-label={`Open all members list (${members.length} members)`}
                aria-haspopup="dialog"
                aria-expanded={membersOpen}
                aria-controls="members-sheet"
                className={cn(
                  "min-h-11 min-w-11 gap-1.5 rounded-xl",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-ring focus-visible:ring-offset-2",
                  "focus-visible:ring-offset-background",
                  "transition-transform active:scale-95",
                )}
              >
                <Users className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">All members</span>
                <span
                  aria-hidden="true"
                  className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 text-xs font-semibold text-primary"
                >
                  {members.length}
                </span>
              </Button>
            </SheetTrigger>
            <SheetContent
              id="members-sheet"
              className="w-full sm:max-w-md overflow-y-auto bg-card border-border/60"
            >
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4" /> All members ({members.length})
                </SheetTitle>
              </SheetHeader>
              <ul className="mt-4 grid gap-2">
                {members.map((m) => {
                  const parent = members.find((p) => p.id === m.parentId);
                  const spouse = members.find((p) => p.id === m.spouseId);
                  return (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <GenderDot gender={m.gender} />
                          <span className="font-medium text-foreground truncate">
                            {m.name}
                          </span>
                          {m.birthYear && (
                            <span className="text-xs text-muted-foreground">
                              ({m.birthYear})
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground truncate">
                          {parent ? `Child of ${parent.name}` : "Root"}
                          {spouse ? ` • Spouse: ${spouse.name}` : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setMembersOpen(false);
                            openEdit(m);
                          }}
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
                  );
                })}
              </ul>
            </SheetContent>
          </Sheet>
          <Button onClick={openAdd} className="shadow-[0_0_20px_hsl(var(--primary)/0.4)]">
            <Plus className="mr-1 h-4 w-4" /> Add member
          </Button>
        </div>
      </header>

      {/* Tree */}
      <section
        aria-label="Family tree"
        className="relative z-10 rounded-3xl border border-border/60 bg-card p-4 sm:p-8 overflow-x-auto"
      >
        {members.length === 0 ? (
          <EmptyState onAdd={openAdd} />
        ) : (
          <TreeView members={members} onEdit={openEdit} onDelete={remove} />
        )}
      </section>

      <MemberDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        members={members}
        onSave={(m) => {
          upsert(m);
          setDialogOpen(false);
          toast.success(editing ? "Member updated" : "Member added");
        }}
      />
    </div>
  );
};

const GenderDot = ({ gender }: { gender: Gender }) => (
  <span
    className={cn(
      "inline-block h-2.5 w-2.5 rounded-full",
      gender === "male" && "bg-primary shadow-[0_0_8px_hsl(var(--primary))]",
      gender === "female" && "bg-accent shadow-[0_0_8px_hsl(var(--accent))]",
      gender === "other" && "bg-equals shadow-[0_0_8px_hsl(var(--equals))]",
    )}
  />
);

// ---------- Tree rendering ----------

interface TreeProps {
  members: Member[];
  onEdit: (m: Member) => void;
  onDelete: (id: string) => void;
}

const TreeView = ({ members, onEdit, onDelete }: TreeProps) => {
  // Build a forest: roots = members without parentId, excluding spouse duplicates
  const byId = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m])),
    [members],
  );

  // A "couple" is rendered together. We pick the partner with smaller id as primary.
  const childrenOfCouple = (id: string, spouseId?: string | null) =>
    members.filter(
      (m) => m.parentId && (m.parentId === id || (spouseId && m.parentId === spouseId)),
    );

  const isPrimaryInCouple = (m: Member) => {
    if (!m.spouseId) return true;
    return m.id <= m.spouseId;
  };

  const roots = members.filter(
    (m) => !m.parentId && isPrimaryInCouple(m),
  );

  const renderNode = (m: Member, depth = 0): JSX.Element => {
    const spouse = m.spouseId ? byId[m.spouseId] : undefined;
    const children = childrenOfCouple(m.id, m.spouseId).filter(isPrimaryInCouple);

    return (
      <li key={m.id} className="flex flex-col items-center">
        <div className="flex items-center gap-2">
          <PersonCard member={m} onEdit={onEdit} onDelete={onDelete} />
          {spouse && (
            <>
              <div className="h-px w-6 bg-primary/60" aria-hidden />
              <PersonCard member={spouse} onEdit={onEdit} onDelete={onDelete} />
            </>
          )}
        </div>

        {children.length > 0 && (
          <>
            <div className="h-6 w-px bg-border" aria-hidden />
            <ul className="relative flex items-start gap-6 sm:gap-10 pt-0">
              {/* Horizontal connector */}
              {children.length > 1 && (
                <div className="absolute left-0 right-0 top-0 h-px bg-border" />
              )}
              {children.map((c) => (
                <div key={c.id} className="flex flex-col items-center">
                  <div className="h-6 w-px bg-border" aria-hidden />
                  {renderNode(c, depth + 1)}
                </div>
              ))}
            </ul>
          </>
        )}
      </li>
    );
  };

  return (
    <ul className="flex min-w-max items-start justify-center gap-12">
      {roots.map((r) => renderNode(r))}
    </ul>
  );
};

const PersonCard = ({
  member,
  onEdit,
  onDelete,
}: {
  member: Member;
  onEdit: (m: Member) => void;
  onDelete: (id: string) => void;
}) => {
  const ring =
    member.gender === "male"
      ? "ring-primary/50 shadow-[0_0_20px_hsl(var(--primary)/0.25)]"
      : member.gender === "female"
      ? "ring-accent/50 shadow-[0_0_20px_hsl(var(--accent)/0.25)]"
      : "ring-equals/50 shadow-[0_0_20px_hsl(var(--equals)/0.25)]";

  const initials = member.name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={cn(
        "group relative w-32 sm:w-36 rounded-2xl bg-muted/60 backdrop-blur-sm px-3 py-3 text-center",
        "ring-1 transition-all hover:bg-muted",
        ring,
      )}
    >
      <div
        className={cn(
          "mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full text-base font-semibold",
          member.gender === "male" && "bg-primary/30 text-primary-foreground",
          member.gender === "female" && "bg-accent/30 text-accent-foreground",
          member.gender === "other" && "bg-equals/30 text-equals-foreground",
        )}
      >
        {initials || "?"}
      </div>
      <div className="truncate text-sm font-semibold text-foreground">
        {member.name}
      </div>
      {member.birthYear && (
        <div className="text-[11px] text-muted-foreground">
          b. {member.birthYear}
        </div>
      )}

      <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => onEdit(member)}
          className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow"
          aria-label="Edit"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={() => onDelete(member.id)}
          className="grid h-6 w-6 place-items-center rounded-full bg-destructive text-destructive-foreground shadow"
          aria-label="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};

const EmptyState = ({ onAdd }: { onAdd: () => void }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <TreePine className="mb-3 h-10 w-10 text-primary" />
    <p className="mb-4 text-muted-foreground">Koi member nahi hai abhi.</p>
    <Button onClick={onAdd}>
      <Plus className="mr-1 h-4 w-4" /> Add first member
    </Button>
  </div>
);

// ---------- Dialog ----------

interface DialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Member | null;
  members: Member[];
  onSave: (m: Member) => void;
}

const NONE = "__none__";

const MemberDialog = ({ open, onOpenChange, editing, members, onSave }: DialogProps) => {
  const [name, setName] = useState(editing?.name ?? "");
  const [gender, setGender] = useState<Gender>(editing?.gender ?? "other");
  const [birthYear, setBirthYear] = useState(editing?.birthYear ?? "");
  const [parentId, setParentId] = useState<string>(editing?.parentId ?? NONE);
  const [spouseId, setSpouseId] = useState<string>(editing?.spouseId ?? NONE);

  const candidates = members.filter((m) => m.id !== editing?.id);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name required");
      return;
    }
    const member: Member = {
      id: editing?.id ?? crypto.randomUUID(),
      name: trimmed,
      gender,
      birthYear: birthYear.trim() || undefined,
      parentId: parentId === NONE ? null : parentId,
      spouseId: spouseId === NONE ? null : spouseId,
    };
    onSave(member);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit member" : "Add family member"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rohan"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Gender</Label>
              <Select value={gender} onValueChange={(v) => setGender(v as Gender)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="year">Birth year</Label>
              <Input
                id="year"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                placeholder="1990"
                inputMode="numeric"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Parent</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None (root)</SelectItem>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Spouse</Label>
            <Select value={spouseId} onValueChange={setSpouseId}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>{editing ? "Save" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FamilyTree;