import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { ObjectId } from "npm:mongodb@6.17.0";
import {
  familyStore, readFamily, verifyPassword, hashPassword, hashKey,
  createSession, verifySession, endSession, endAllSessions,
  lockRemaining, recordFailure, clearFailures, insertBackup, pruneBackups,
  type FamilyStore, type BackupDoc,
} from "../_shared/mongo-store.ts";
import { validateTree } from "../_shared/tree-rules.ts";

// Schema definitions
const password = z.string().min(1).max(72);
const token = z.string().min(16).max(128);
const year = z.string().regex(/^\d{3,4}$/, "must be a 3-4 digit year");
const member = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(256),
  gender: z.enum(["male", "female", "other"]),
  birthYear: year.optional(),
  deathYear: year.optional(),
  phone: z.string().regex(/^[0-9+\-\s()]{3,32}$/).optional(),
  photo: z.string().max(30000).startsWith("data:image/").optional(),
  parentId: z.string().max(128).nullable().optional(),
  spouseId: z.string().max(128).nullable().optional()
}).strict();

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("load") }).strict(),
  z.object({ action: z.literal("login"), password }).strict(),
  z.object({ action: z.literal("logout"), token }).strict(),
  z.object({ action: z.literal("save"), token, title: z.string().trim().min(1).max(256), members: z.array(member).max(10000), revision: z.number().int().nonnegative() }).strict(),
  z.object({ action: z.literal("change-password"), token, password, newPassword: z.string().min(6).max(72) }).strict(),
  z.object({ action: z.literal("list-backups"), token }).strict(),
  z.object({ action: z.literal("restore-backup"), token, backupId: z.string().regex(/^[a-f0-9]{24}$/), revision: z.number().int().nonnegative() }).strict(),
]);

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" }
});

class Conflict extends Error {}

/** Say WHICH member has a bad value instead of a vague "invalid request". */
function describeIssue(raw: unknown, issues: z.ZodIssue[]) {
  const path = issues[0]?.path ?? [];
  if (path[0] === "members" && typeof path[1] === "number") {
    const name = (raw as { members?: { name?: unknown }[] } | null)?.members?.[path[1]]?.name;
    const field = typeof path[2] === "string" ? path[2] : "data";
    return `Invalid ${field} for member ${typeof name === "string" && name ? `"${name}"` : `#${path[1] + 1}`}.`;
  }
  return "Invalid request. Check the entered data.";
}

function clientAddress(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "";
  return forwarded.split(",")[0].trim() || "unknown";
}
const tooMany = (seconds: number) => `Too many wrong passwords. Try again in ${Math.max(1, Math.ceil(seconds / 60))} minute(s).`;

/**
 * Replace the saved tree. The current tree is copied into the backups collection in the SAME
 * transaction, so a backup exists for every change and nothing is half-written.
 */
async function replaceTree(
  store: FamilyStore,
  revision: number,
  next: { title: string; members: BackupDoc["members"] },
  reason: string,
) {
  const session = store.client.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await store.state.findOne({ _id: "family-tree", revision }, { session });
      if (!current) throw new Conflict("The tree changed elsewhere. Reload before saving.");
      const saved = await store.members.findOne({ _id: "family-tree" }, { session });
      if (!saved) throw new Error("Saved member data is unavailable.");
      await insertBackup(store, { revision: current.revision, title: current.title, members: saved.members, reason }, session);
      const result = await store.state.updateOne({ _id: "family-tree", revision }, { $set: { title: next.title }, $inc: { revision: 1 } }, { session });
      if (!result.matchedCount) throw new Conflict("The tree changed elsewhere. Reload before saving.");
      const memberResult = await store.members.updateOne({ _id: "family-tree" }, { $set: { members: next.members } }, { session });
      if (!memberResult.matchedCount) throw new Error("Saved member data is unavailable.");
    });
  } finally { await session.endSession(); }
  await pruneBackups(store).catch(() => undefined);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ message: "Only POST requests are allowed." }, 405);
  try {
    const raw = await req.json().catch(() => null);
    const input = schema.safeParse(raw);
    if (!input.success) return json({ message: describeIssue(raw, input.error.issues) }, 400);
    const data = input.data;
    const store = await familyStore();

    if (data.action === "load") {
      const saved = await readFamily(store);
      const admin = await store.admin.findOne({ _id: "family-tree" });
      if (!saved || !admin) return json({ message: "Existing website data is unavailable." }, 503);
      return json({ title: saved.title, members: saved.members, revision: saved.revision, hasPassword: !!admin.passwordHash });
    }

    const who = await hashKey(clientAddress(req));

    if (data.action === "login") {
      const wait = await lockRemaining(store, who);
      if (wait) return json({ message: tooMany(wait) }, 429);
      const admin = await store.admin.findOne({ _id: "family-tree" });
      if (!admin?.passwordHash) return json({ message: "Existing admin password is unavailable." }, 503);
      if (!await verifyPassword(data.password, admin.passwordHash)) {
        await recordFailure(store, who);
        return json({ message: "Wrong password" }, 403);
      }
      await clearFailures(store, who);
      return json({ token: await createSession(store) });
    }

    // Everything below needs a valid admin session.
    if (!await verifySession(store, data.token)) return json({ message: "Session expired. Please log in again." }, 401);

    if (data.action === "logout") {
      await endSession(store, data.token);
      return json({ saved: true });
    }

    if (data.action === "list-backups") {
      const items = await store.backups.find({}, { projection: { members: 0 } }).sort({ createdAt: -1 }).limit(30).toArray();
      return json({
        backups: items.map((b) => ({ id: b._id.toString(), createdAt: b.createdAt.toISOString(), revision: b.revision, title: b.title, count: b.count, reason: b.reason })),
      });
    }

    if (data.action === "change-password") {
      const wait = await lockRemaining(store, who);
      if (wait) return json({ message: tooMany(wait) }, 429);
      const admin = await store.admin.findOne({ _id: "family-tree" });
      if (!admin?.passwordHash) return json({ message: "Existing admin password is unavailable." }, 503);
      if (!await verifyPassword(data.password, admin.passwordHash)) {
        await recordFailure(store, who);
        return json({ message: "Current password is wrong." }, 403);
      }
      const hash = await hashPassword(data.newPassword);
      const result = await store.admin.updateOne({ _id: "family-tree", passwordHash: admin.passwordHash }, { $set: { passwordHash: hash } });
      if (!result.matchedCount) return json({ message: "Password changed elsewhere. Try again." }, 409);
      await endAllSessions(store); // old logins stop working
      return json({ saved: true, token: await createSession(store) });
    }

    if (data.action === "restore-backup") {
      const backup = await store.backups.findOne({ _id: new ObjectId(data.backupId) });
      if (!backup) return json({ message: "Backup not found." }, 404);
      await replaceTree(store, data.revision, { title: backup.title, members: backup.members }, "before-restore");
      return json({ saved: true, revision: data.revision + 1 });
    }

    // action === "save"
    const { title, members, revision } = data;
    if (new Set(members.map((m) => m.id)).size !== members.length) return json({ message: "Member IDs must be unique." }, 400);
    const problem = validateTree(members);
    if (problem) return json({ message: problem }, 400);
    await replaceTree(store, revision, { title, members }, "save");
    return json({ saved: true, revision: revision + 1 });
  } catch (error) {
    if (error instanceof Conflict) return json({ message: error.message }, 409);
    return json({ message: "Unable to access website data. No changes were saved." }, 503);
  }
});
