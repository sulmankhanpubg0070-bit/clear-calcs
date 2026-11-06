import type { Member } from "@/components/FamilyTree";

/** Add or update one member, keeping spouse links symmetric on both sides. */
export function upsertMember(current: Member[], m: Member): Member[] {
  const exists = current.some((p) => p.id === m.id);
  const next = current.map((p) => {
    if (p.id === m.id) return m;
    // The chosen spouse points back to this member.
    if (p.id === m.spouseId) return { ...p, spouseId: m.id };
    // Someone still pointed at this member, but this member no longer points back.
    if (p.spouseId === m.id) return { ...p, spouseId: null };
    // The chosen spouse was already married to someone else: free that person.
    if (m.spouseId && p.spouseId === m.spouseId) return { ...p, spouseId: null };
    return p;
  });
  return exists ? next : [...next, m];
}

/** Remove one member and clear every parent/spouse link that pointed at them. */
export function removeMember(current: Member[], id: string): Member[] {
  return current
    .filter((m) => m.id !== id)
    .map((m) => ({
      ...m,
      parentId: m.parentId === id ? null : m.parentId,
      spouseId: m.spouseId === id ? null : m.spouseId,
    }));
}

/**
 * Validate imported JSON and keep only the fields the server accepts.
 * Returns null when the data is not a usable member list.
 */
export function sanitizeMembers(raw: unknown): Member[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Member[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id) return null;
    if (typeof r.name !== "string" || !r.name.trim()) return null;
    const gender = r.gender === "male" || r.gender === "female" ? r.gender : "other";
    const birthYear = r.birthYear === undefined || r.birthYear === null || r.birthYear === "" ? undefined : String(r.birthYear);
    out.push({
      id: r.id,
      name: r.name.trim(),
      gender,
      birthYear,
      parentId: typeof r.parentId === "string" ? r.parentId : null,
      spouseId: typeof r.spouseId === "string" ? r.spouseId : null,
    });
  }
  return out;
}
