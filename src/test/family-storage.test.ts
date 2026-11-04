import { beforeEach, describe, expect, it, vi } from "vitest";

describe("MongoDB-only family storage", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });
  const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  it("rejects wrong passwords even when old browser data exists", async () => {
    localStorage.setItem("family-tree-data", JSON.stringify({ members: [], passwordHash: "old" }));
    vi.mocked(fetch).mockResolvedValue(respond({ message: "Wrong password" }, 403));
    const { loginAdmin } = await import("../lib/family-storage");
    await expect(loginAdmin("invalid")).rejects.toThrow("Wrong password");
  });
  it("never loads stale browser data when MongoDB is unavailable", async () => {
    localStorage.setItem("family-tree-data", JSON.stringify({ title: "Stale", members: [] }));
    vi.mocked(fetch).mockRejectedValue(new Error("Unavailable"));
    const { loadFamily } = await import("../lib/family-storage");
    await expect(loadFamily()).rejects.toThrow("Unavailable");
  });
  it("only confirms saves after MongoDB acknowledges them", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(respond({ title: "Family", members: [], revision: 7, hasPassword: true }))
      .mockResolvedValueOnce(respond({ message: "Save failed" }, 503));
    const { loadFamily, saveFamily } = await import("../lib/family-storage");
    await loadFamily();
    await expect(saveFamily("test-password", "Family", [])).rejects.toThrow("Save failed");
  });
  it("serializes saves with the confirmed revision", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(respond({ title: "Family", members: [], revision: 7, hasPassword: true }))
      .mockResolvedValueOnce(respond({ saved: true, revision: 8 }))
      .mockResolvedValueOnce(respond({ saved: true, revision: 9 }));
    const { loadFamily, saveFamily } = await import("../lib/family-storage");
    await loadFamily();
    await Promise.all([saveFamily("test-password", "First", []), saveFamily("test-password", "Second", [])]);
    const requests = vi.mocked(fetch).mock.calls.slice(1).map(([, init]) => JSON.parse(String(init?.body)));
    expect(requests.map(r => r.revision)).toEqual([7, 8]);
  });
});