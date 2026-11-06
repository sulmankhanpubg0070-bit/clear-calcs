import { describe, expect, it } from "vitest";
import { validateTree } from "./tree-rules";

const p = (id: string, extra: Record<string, string | null> = {}) => ({ id, name: id.toUpperCase(), ...extra });

describe("validateTree", () => {
  it("accepts a normal tree", () => {
    expect(validateTree([p("a", { spouseId: "b" }), p("b", { spouseId: "a" }), p("c", { parentId: "a" })])).toBeNull();
  });

  it("rejects a parent or spouse that does not exist", () => {
    expect(validateTree([p("a", { parentId: "zzz" })])).toContain("A");
    expect(validateTree([p("a", { spouseId: "zzz" })])).toContain("spouse");
  });

  it("rejects someone being their own parent or spouse", () => {
    expect(validateTree([p("a", { parentId: "a" })])).toContain("own parent");
    expect(validateTree([p("a", { spouseId: "a" })])).toContain("own spouse");
  });

  it("rejects a simple loop (grandfather becomes grandson's child)", () => {
    const tree = [p("a", { parentId: "c" }), p("b", { parentId: "a" }), p("c", { parentId: "b" })];
    expect(validateTree(tree)).toContain("family loop");
  });

  it("rejects a loop that goes through a married couple", () => {
    // s and e are married; p is a child of s; e is made a child of p.
    const tree = [p("s", { spouseId: "e" }), p("e", { spouseId: "s", parentId: "p" }), p("p", { parentId: "s" })];
    expect(validateTree(tree)).toContain("family loop");
  });

  it("rejects a parent who is married to their own child", () => {
    const tree = [p("a", { spouseId: "b" }), p("b", { spouseId: "a", parentId: "a" })];
    expect(validateTree(tree)).toContain("family loop");
  });
});
