import { describe, expect, it } from "vitest";
import { hasAdminAccess } from "../../supabase/functions/family-summary/policy";

describe("admin-only family summaries", () => {
  it("allows only a successful server password check", () => {
    expect(hasAdminAccess({ data: true, error: null })).toBe(true);
    expect(hasAdminAccess({ data: false, error: null })).toBe(false);
    expect(hasAdminAccess({ data: true, error: new Error("check failed") })).toBe(false);
    expect(hasAdminAccess({ data: "true", error: null })).toBe(false);
  });
});