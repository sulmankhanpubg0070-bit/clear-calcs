import { describe, expect, it } from "vitest";
import { FAMILY_DATABASE, publicTree } from "../../supabase/functions/_shared/mongo-policy";

describe("isolated family storage", () => {
  it("targets only the owner's exact Familyloveable database", () => {
    expect(FAMILY_DATABASE).toBe("Familyloveable");
  });
  it("never exposes the admin password hash or AI access state publicly", () => {
    expect(publicTree({ title: "Family", members: [], passwordHash: "private", aiBlock: { message: "private" } })).toEqual({ title: "Family", members: [] });
  });
});