/** Minimal shape needed to check a family tree. Dependency-free so the app and the server use the same rules. */
export interface TreeNode {
  id: string;
  name: string;
  parentId?: string | null;
  spouseId?: string | null;
}

/** Returns a human-readable problem, or null when the tree is valid. */
export function validateTree(members: TreeNode[]): string | null {
  const byId = new Map(members.map((m) => [m.id, m]));
  for (const m of members) {
    if (m.parentId) {
      if (m.parentId === m.id) return `${m.name} cannot be their own parent.`;
      if (!byId.has(m.parentId)) return `${m.name} has a parent that does not exist.`;
    }
    if (m.spouseId) {
      if (m.spouseId === m.id) return `${m.name} cannot be their own spouse.`;
      if (!byId.has(m.spouseId)) return `${m.name} has a spouse that does not exist.`;
    }
  }

  // Spouses are drawn as one couple, so a family loop must be checked between couples, not single people.
  const group = new Map<string, string>(members.map((m) => [m.id, m.id]));
  const find = (id: string): string => {
    let root = id;
    while (group.get(root) !== root) root = group.get(root)!;
    return root;
  };
  for (const m of members) {
    if (!m.spouseId) continue;
    const a = find(m.id);
    const b = find(m.spouseId);
    if (a !== b) group.set(a, b);
  }

  const parents = new Map<string, Set<string>>();
  for (const m of members) {
    if (!m.parentId) continue;
    const from = find(m.id);
    const set = parents.get(from) ?? new Set<string>();
    set.add(find(m.parentId));
    parents.set(from, set);
  }

  const state = new Map<string, "open" | "done">();
  const hasLoop = (node: string): boolean => {
    const seen = state.get(node);
    if (seen === "done") return false;
    if (seen === "open") return true;
    state.set(node, "open");
    for (const next of parents.get(node) ?? []) if (hasLoop(next)) return true;
    state.set(node, "done");
    return false;
  };
  for (const node of parents.keys()) {
    if (hasLoop(node)) return "This would make someone their own ancestor (a family loop). Please check the parent and spouse.";
  }
  return null;
}
