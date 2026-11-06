import { MongoClient, type ClientSession } from "npm:mongodb@6.17.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";
import { FAMILY_DATABASE, COLLECTION_WEBSITE_STATE, COLLECTION_MEMBER_DATA, COLLECTION_ADMIN_CREDENTIALS, separationSeed, type WebsiteState, type MemberData, type AdminCredentials } from "./mongo-policy.ts";

const SESSION_MS = 12 * 60 * 60 * 1000; // admin login lasts 12 hours
const MAX_FAILURES = 5; // wrong passwords allowed...
const FAILURE_WINDOW_MS = 15 * 60 * 1000; // ...within this window
const LOCK_MS = 10 * 60 * 1000; // then locked out for this long
export const MAX_BACKUPS = 30;

interface SessionDoc { _id: string; createdAt: Date; expiresAt: Date }
interface AttemptDoc { _id: string; failures: number; lockedUntil: Date | null; updatedAt: Date }
export interface BackupDoc { createdAt: Date; revision: number; title: string; count: number; reason: string; members: MemberData["members"] }

let connection: Promise<MongoClient> | undefined;
let indexesReady = false;
async function connect() {
  const uri = Deno.env.get("MONGODB_URI");
  if (!uri) throw new Error("MongoDB connection is not configured.");
  if (!connection) {
    connection = (async () => {
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, maxPoolSize: 3 });
      try {
        await client.connect();
        await client.db(FAMILY_DATABASE).command({ ping: 1 });
        return client;
      } catch {
        await client.close();
        connection = undefined;
        throw new Error("MongoDB connection failed. Existing data has not been changed.");
      }
    })();
  }
  return connection;
}

export async function familyStore() {
  const client = await connect();
  const db = client.db(FAMILY_DATABASE);
  const state = db.collection<WebsiteState & { storageVersion?: number }>(COLLECTION_WEBSITE_STATE);
  const members = db.collection<MemberData>(COLLECTION_MEMBER_DATA);
  const admin = db.collection<AdminCredentials>(COLLECTION_ADMIN_CREDENTIALS);
  let existing = await state.findOne({ _id: "family-tree" });
  if (!existing) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Unable to access the original website backup.");
    const source = createClient(url, key, { auth: { persistSession: false } });
    const [tree, secret, block] = await Promise.all([
      source.from("site_data").select("title,members").eq("id", 1).single(),
      source.from("admin_secret").select("password_hash").eq("id", 1).single(),
      source.from("family_summary_ai_state").select("blocked_status,message").eq("id", 1).maybeSingle(),
    ]);
    if (tree.error || secret.error || block.error || !Array.isArray(tree.data.members)) {
      throw new Error("Unable to copy the original website safely. Original data has not been changed.");
    }
    await state.updateOne({ _id: "family-tree" }, { $setOnInsert: {
      title: tree.data.title, members: tree.data.members, passwordHash: secret.data.password_hash,
      revision: 0, aiBlock: block.data ?? null,
    } }, { upsert: true });
    existing = await state.findOne({ _id: "family-tree" });
  }
  if (!existing) throw new Error("Unable to load saved website data.");
  if (existing.storageVersion !== 2) {
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const current = await state.findOne({ _id: "family-tree" }, { session });
        if (!current) throw new Error("Unable to load saved website data.");
        const memberRecord = await members.findOne({ _id: "family-tree" }, { session });
        const adminRecord = await admin.findOne({ _id: "family-tree" }, { session });
        const seed = separationSeed(current, memberRecord, adminRecord);
        await members.updateOne({ _id: "family-tree" }, { $setOnInsert: { members: seed.members.members } }, { upsert: true, session });
        await admin.updateOne({ _id: "family-tree" }, { $setOnInsert: { passwordHash: seed.admin.passwordHash } }, { upsert: true, session });
        await state.updateOne({ _id: "family-tree" }, { $set: { storageVersion: 2 }, $unset: { members: "", passwordHash: "" } }, { session });
      });
    } finally { await session.endSession(); }
  }
  const sessions = db.collection<SessionDoc>("admin_sessions");
  const attempts = db.collection<AttemptDoc>("admin_login_attempts");
  const backups = db.collection<BackupDoc>("family_backups");
  if (!indexesReady) {
    try {
      await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // expired logins delete themselves
      await backups.createIndex({ createdAt: -1 });
      indexesReady = true;
    } catch { /* indexes are an optimisation; never block the site on them */ }
  }
  return { client, state, members, admin, sessions, attempts, backups };
}

export type FamilyStore = Awaited<ReturnType<typeof familyStore>>;

export async function readFamily(store: FamilyStore) {
  const session = store.client.startSession();
  try {
    return await session.withTransaction(async () => {
      const state = await store.state.findOne({ _id: "family-tree" }, { session });
      const members = await store.members.findOne({ _id: "family-tree" }, { session });
      if (!state || !members) throw new Error("Unable to load saved family data.");
      return { title: state.title, revision: state.revision, members: members.members, aiBlock: state.aiBlock };
    }, { readConcern: { level: "snapshot" } });
  } finally { await session.endSession(); }
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

// ---------- hashing helper ----------
const toHex = (bytes: Uint8Array) => Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
export async function hashKey(text: string) {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}

// ---------- admin sessions (the browser keeps this token, never the password) ----------
export async function createSession(store: FamilyStore) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  // Only a hash of the token is stored, so a database leak cannot be used to log in.
  await store.sessions.insertOne({ _id: await hashKey(token), createdAt: new Date(now), expiresAt: new Date(now + SESSION_MS) });
  return token;
}
export async function verifySession(store: FamilyStore, token: string) {
  if (!token) return false;
  const found = await store.sessions.findOne({ _id: await hashKey(token), expiresAt: { $gt: new Date() } });
  return !!found;
}
export async function endSession(store: FamilyStore, token: string) {
  await store.sessions.deleteOne({ _id: await hashKey(token) });
}
export async function endAllSessions(store: FamilyStore) {
  await store.sessions.deleteMany({});
}

// ---------- wrong-password limiter (per visitor address) ----------
/** Seconds the visitor must still wait, or 0 when they may try. */
export async function lockRemaining(store: FamilyStore, key: string) {
  const record = await store.attempts.findOne({ _id: key });
  if (record?.lockedUntil && record.lockedUntil.getTime() > Date.now()) {
    return Math.ceil((record.lockedUntil.getTime() - Date.now()) / 1000);
  }
  return 0;
}
export async function recordFailure(store: FamilyStore, key: string) {
  const now = new Date();
  const record = await store.attempts.findOne({ _id: key });
  const recent = record && now.getTime() - record.updatedAt.getTime() < FAILURE_WINDOW_MS;
  const failures = (recent ? record.failures : 0) + 1;
  const locked = failures >= MAX_FAILURES;
  await store.attempts.updateOne(
    { _id: key },
    { $set: { failures: locked ? 0 : failures, lockedUntil: locked ? new Date(now.getTime() + LOCK_MS) : null, updatedAt: now } },
    { upsert: true },
  );
}
export async function clearFailures(store: FamilyStore, key: string) {
  await store.attempts.deleteOne({ _id: key });
}

// ---------- backups ----------
export async function insertBackup(
  store: FamilyStore,
  entry: { revision: number; title: string; members: BackupDoc["members"]; reason: string },
  session?: ClientSession,
) {
  await store.backups.insertOne(
    { createdAt: new Date(), revision: entry.revision, title: entry.title, count: entry.members.length, reason: entry.reason, members: entry.members },
    { session },
  );
}
export async function pruneBackups(store: FamilyStore) {
  const old = await store.backups.find({}, { projection: { _id: 1 } }).sort({ createdAt: -1 }).skip(MAX_BACKUPS).toArray();
  if (old.length) await store.backups.deleteMany({ _id: { $in: old.map((b) => b._id) } });
}
