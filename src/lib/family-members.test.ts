import { describe, expect, it } from "vitest";
import type { Member } from "@/components/FamilyTree";
import { removeMember, sanitizeMembers, upsertMember } from "./family-members";

const a: Member = { id: "a", name: "A", gender: "male", spouseId: "b" };
const b: Member = { id: "b", name: "B", gender: "female", spouseId: "a" };
const byId = (list: Member[], id: string) => list.find((m) => m.id === id);

describe("upsertMember", () => {
  it("adds a new member at the end", () => {
    const c: Member = { id: "c", name: "C", gender: "other", parentId: "a" };
    expect(upsertMember([a, b], c)).toEqual([a, b, c]);
  });

  it("links the spouse back on both sides", () => {
    const x: Member = { id: "x", name: "X", gender: "male" };
    const y: Member = { id: "y", name: "Y", gender: "female" };
    const result = upsertMember([x, y], { ...x, spouseId: "y" });
    expect(byId(result, "x")?.spouseId).toBe("y");
    expect(byId(result, "y")?.spouseId).toBe("x");
  });

  it("clears the old partner when a spouse is removed", () => {
    const result = upsertMember([a, b], { ...b, spouseId: null });
    expect(byId(result, "a")?.spouseId).toBeNull();
    expect(byId(result, "b")?.spouseId).toBeNull();
  });

  it("frees the previous partner when someone else becomes the spouse", () => {
    const c: Member = { id: "c", name: "C", gender: "female" };
    const result = upsertMember([a, b, c], { ...c, spouseId: "a" });
    expect(byId(result, "a")?.spouseId).toBe("c");
    expect(byId(result, "b")?.spouseId).toBeNull();
    expect(byId(result, "c")?.spouseId).toBe("a");
  });
});

describe("removeMember", () => {
  it("clears parent and spouse links to the removed member", () => {
    const child: Member = { id: "c", name: "C", gender: "other", parentId: "a" };
    const result = removeMember([a, b, child], "a");
    expect(result.map((m) => m.id)).toEqual(["b", "c"]);
    expect(byId(result, "b")?.spouseId).toBeNull();
    expect(byId(result, "c")?.parentId).toBeNull();
  });
});

describe("sanitizeMembers", () => {
  it("rejects data that is not a member list", () => {
    expect(sanitizeMembers({})).toBeNull();
    expect(sanitizeMembers([{ id: "1" }])).toBeNull();
    expect(sanitizeMembers([null])).toBeNull();
  });

  it("keeps only allowed fields and fixes types", () => {
    const result = sanitizeMembers([
      { id: "1", name: " Ali ", gender: "unknown", birthYear: 1990, parentId: null, extra: "drop me" },
    ]);
    expect(result).toEqual([
      { id: "1", name: "Ali", gender: "other", birthYear: "1990", parentId: null, spouseId: null },
    ]);
    expect(result?.[0]).not.toHaveProperty("extra");
  });
});
