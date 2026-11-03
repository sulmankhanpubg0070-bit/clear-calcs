export const FAMILY_DATABASE = "family_tree";

export function hasIsolatedAccess(roles: { role: string; db: string }[]): boolean {
  return roles.length > 0 && roles.every((role) => role.db === FAMILY_DATABASE && role.role === "readWrite");
}

export function publicTree(record: { title: string; members: unknown[]; passwordHash?: string; aiBlock?: unknown }) {
  return { title: record.title, members: record.members };
}