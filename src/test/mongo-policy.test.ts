import { describe, expect, it } from "vitest";
import { FAMILY_DATABASE, hasIsolatedAccess, publicTree } from "../../supabase/functions/_shared/mongo-policy";

describe("isolated family storage", () => {
  it("restricts the MongoDB user to readWrite on family_tree only", () => {
    expect(FAMILY_DATABASE).toBe("family_tree");
    expect(hasIsolatedAccess([{ role: "readWrite", db: "family_tree" }])).toBe(true);
    expect(hasIsolatedAccess([{ role: "readWrite", db: "old_website" }])).toBe(false);
    expect(hasIsolatedAccess([{ role: "readWriteAnyDatabase", db: "admin" }])).toBe(false);
    expect(hasIsolatedAccess([{ role: "readWrite", db: "family_tree" }, { role: "readWrite", db: "old_website" }])).toBe(false);
    expect(hasIsolatedAccess([])).toBe(false);
  });
  it("never exposes the admin password hash or AI access state publicly", () => {
    expect(publicTree({ title: "Family", members: [], passwordHash: "private", aiBlock: { message: "private" } })).toEqual({ title: "Family", members: [] });
  });
});