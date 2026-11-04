import { MongoClient } from "npm:mongodb@6.17.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";
import { FAMILY_DATABASE, COLLECTION_WEBSITE_STATE, COLLECTION_MEMBER_DATA, COLLECTION_ADMIN_CREDENTIALS, separationSeed, type WebsiteState, type MemberData, type AdminCredentials } from "./mongo-policy.ts";

let connection: Promise<MongoClient> | undefined;
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
  return { client, state, members, admin };
}

export async function readFamily(store: Awaited<ReturnType<typeof familyStore>>) {
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
