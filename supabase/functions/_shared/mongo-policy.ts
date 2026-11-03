export const FAMILY_DATABASE = "Familyloveable";

export function publicTree(record: { title: string; members: unknown[]; passwordHash?: string; aiBlock?: unknown }) {
  return { title: record.title, members: record.members };
}