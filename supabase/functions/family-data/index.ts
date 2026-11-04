import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { familyStore, readFamily, verifyPassword, hashPassword } from "../_shared/mongo-store.ts";

// Schema definitions
const password = z.string().min(1).max(72);
const member = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(256),
  gender: z.enum(["male", "female", "other"]),
  birthYear: z.string().max(32).optional(),
  parentId: z.string().max(128).nullable().optional(),
  spouseId: z.string().max(128).nullable().optional()
}).strict();

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("load") }).strict(),
  z.object({ action: z.literal("check"), password }).strict(),
  z.object({ action: z.literal("save"), password, title: z.string().trim().min(1).max(256), members: z.array(member).max(10000), revision: z.number().int().nonnegative() }).strict(),
  z.object({ action: z.literal("change-password"), password, newPassword: z.string().min(6).max(72) }).strict(),
]);

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { 
  status, 
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } 
});

class Conflict extends Error {}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ message: "Only POST requests are allowed." }, 405);
  try {
    const input = schema.safeParse(await req.json().catch(() => null));
    if (!input.success) return json({ message: "Invalid request. Check the entered data." }, 400);
    const store = await familyStore();
    if (input.data.action === "load") {
      const saved = await readFamily(store);
      const admin = await store.admin.findOne({ _id: "family-tree" });
      if (!saved || !admin) return json({ message: "Existing website data is unavailable." }, 503);
      return json({ title: saved.title, members: saved.members, revision: saved.revision, hasPassword: !!admin.passwordHash });
    }
    const admin = await store.admin.findOne({ _id: "family-tree" });
    if (!admin?.passwordHash) return json({ message: "Existing admin password is unavailable." }, 503);
    if (!await verifyPassword(input.data.password, admin.passwordHash)) return json({ message: "Wrong password" }, 403);
    if (input.data.action === "check") return json({ valid: true });
    if (input.data.action === "change-password") {
      const hash = await hashPassword(input.data.newPassword);
      const result = await store.admin.updateOne({ _id: "family-tree", passwordHash: admin.passwordHash }, { $set: { passwordHash: hash } });
      if (!result.matchedCount) return json({ message: "Password changed elsewhere. Try again." }, 409);
      return json({ saved: true });
    }
    const { title, members, revision } = input.data;
    if (new Set(members.map(m => m.id)).size !== members.length) return json({ message: "Member IDs must be unique." }, 400);
    const session = store.client.startSession();
    try {
      await session.withTransaction(async () => {
        const credential = await store.admin.findOne({ _id: "family-tree", passwordHash: admin.passwordHash }, { session });
        if (!credential) throw new Conflict("Password changed elsewhere. Log in again.");
        const result = await store.state.updateOne({ _id: "family-tree", revision }, { $set: { title }, $inc: { revision: 1 } }, { session });
        if (!result.matchedCount) throw new Conflict("The tree changed elsewhere. Reload before saving.");
        const memberResult = await store.members.updateOne({ _id: "family-tree" }, { $set: { members } }, { session });
        if (!memberResult.matchedCount) throw new Error("Saved member data is unavailable.");
      });
    } finally { await session.endSession(); }
    return json({ saved: true, revision: revision + 1 });
  } catch (error) {
    if (error instanceof Conflict) return json({ message: error.message }, 409);
    return json({ message: "Unable to access website data. No changes were saved." }, 503);
  }
});
