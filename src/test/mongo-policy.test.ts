import { describe, expect, it } from "vitest";
import { FAMILY_DATABASE, publicTree, separationSeed, COLLECTION_ADMIN_CREDENTIALS, COLLECTION_MEMBER_DATA } from "../../supabase/functions/_shared/mongo-policy";

describe("isolated family storage", () => {
  it("targets only the owner's exact Familyloveable database", () => {
    expect(FAMILY_DATABASE).toBe("Familyloveable");
  });
  it("never exposes the admin password hash or AI access state publicly", () => {
    expect(publicTree({ title: "Family", members: [], passwordHash: "private", aiBlock: { message: "private" } })).toEqual({ title: "Family", members: [] });
  });
  it("stores admin credentials and members in different collections", () => {
    expect(COLLECTION_ADMIN_CREDENTIALS).toBe("admin_credentials");
    expect(COLLECTION_MEMBER_DATA).toBe("member_data");
  });
  it("preserves the original password hash and member data during separation", () => {
    const result = separationSeed({ _id: "family-tree", title: "Family", revision: 4, passwordHash: "existing-bcrypt-hash", members: [{ id: "1", name: "Dada" }] }, null, null);
    expect(result.admin).toEqual({ _id: "family-tree", passwordHash: "existing-bcrypt-hash" });
    expect(result.members).toEqual({ _id: "family-tree", members: [{ id: "1", name: "Dada" }] });
  });
  it("never replaces already separated records with stale original data", () => {
    const result = separationSeed({ _id: "family-tree", title: "Family", revision: 4, passwordHash: "old", members: [] }, { _id: "family-tree", members: [{ id: "new" }] }, { _id: "family-tree", passwordHash: "current" });
    expect(result.members.members).toEqual([{ id: "new" }]);
    expect(result.admin.passwordHash).toBe("current");
  });
  it("fails closed rather than creating a new admin password", () => {
    expect(() => separationSeed({ _id: "family-tree", title: "Family", revision: 0, members: [] }, null, null)).toThrow("Existing family data or admin password is missing");
  });
});