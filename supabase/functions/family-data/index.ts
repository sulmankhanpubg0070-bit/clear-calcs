import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { familyStore, hashPassword, verifyPassword } from "../_shared/mongo-store.ts";
import { publicTree } from "../_shared/mongo-policy.ts";

const password = z.string().min(1).max(72);
const member = z.object({ id: z.string().min(1).max(128), name: z.string().min(1).max(256), gender: z.enum(["male", "female", "other"]), birthYear: z.string().max(32).optional(), parentId: z.string().max(128).nullable().optional(), spouseId: z.string().max(128).nullable().optional() }).strict();
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("load") }).strict(),
  z.object({ action: z.literal("check"), password }).strict(),
  z.object({ action: z.literal("save"), password, title: z.string().trim().min(1).max(256), members: z.array(member).max(10000), revision: z.number().int().nonnegative() }).strict(),
  z.object({ action: z.literal("change-password"), password, newPassword: z.string().min(6).max(72) }).strict(),
]);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ message: "Only POST requests are allowed." }, 405);
  try {
    const input = schema.safeParse(await req.json().catch(() => null));
    if (!input.success) return json({ message: "Invalid request. Check the entered data." }, 400);
    const store = await familyStore();
    const record = await store.findOne({ _id: "family-tree" });
    if (!record) return json({ message: "Website data is not available." }, 503);
    if (input.data.action === "load") return json({ ...publicTree(record), revision: record.revision, hasPassword: true });
    if (!await verifyPassword(input.data.password, record.passwordHash)) return json({ message: "Wrong password" }, 403);
    if (input.data.action === "check") return json({ valid: true });
    if (input.data.action === "change-password") {
      const hash = await hashPassword(input.data.newPassword);
      const result = await store.updateOne({ _id: record._id, passwordHash: record.passwordHash }, { $set: { passwordHash: hash } });
      if (!result.matchedCount) return json({ message: "Password changed elsewhere. Log in again." }, 409);
      return json({ saved: true });
    }
    const ids = new Set(input.data.members.map((item) => item.id));
    if (ids.size !== input.data.members.length) return json({ message: "Member IDs must be unique." }, 400);
    const result = await store.updateOne({ _id: record._id, revision: input.data.revision, passwordHash: record.passwordHash }, { $set: { title: input.data.title, members: input.data.members }, $inc: { revision: 1 } });
    if (!result.matchedCount) return json({ message: "The tree changed elsewhere. Reload before saving." }, 409);
    return json({ saved: true, revision: input.data.revision + 1 });
  } catch (error) {
    const message = error instanceof Error && /^(MongoDB |Unable to (copy|access))/.test(error.message) ? error.message : "Unable to access website data. No changes were saved.";
    return json({ message }, 503);
  }
});