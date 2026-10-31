import { describe, expect, it } from "vitest";
import { familyContact, getFamilyStats } from "@/lib/family-stats";

describe("family statistics", () => {
  it("counts reciprocal spouses once and only recorded parent links", () => {
    expect(getFamilyStats([
      { id: "1", name: "A", gender: "male", spouseId: "2" },
      { id: "2", name: "B", gender: "female", spouseId: "1" },
      { id: "3", name: "C", gender: "other", parentId: "1" },
      { id: "4", name: "D", gender: "male", parentId: "missing", spouseId: "missing" },
    ])).toEqual({ total: 4, male: 2, female: 1, other: 1, couples: 1, parentLinks: 1 });
  });
  it("returns zero counts for an empty tree", () => {
    expect(getFamilyStats([])).toEqual({ total: 0, male: 0, female: 0, other: 0, couples: 0, parentLinks: 0 });
  });
});

it("uses the owner's contact number for calls and WhatsApp", () => {
  expect(familyContact.display).toBe("03095625845");
  expect(familyContact.phone).toBe("tel:+923095625845");
  expect(familyContact.whatsapp).toBe("https://wa.me/923095625845");
});