import { MongoClient } from "npm:mongodb@6.17.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";
import { FAMILY_DATABASE } from "./mongo-policy.ts";

export interface FamilyRecord {
  _id: string;
  title: string;
  members: unknown[];
  passwordHash: string;
  revision: number;
  aiBlock?: { blocked_status: number; message: string } | null;
}

let connection: Promise<MongoClient> | undefined;
async function connect() {
  const uri = Deno.env.get("MONGODB_URI");
  if (!uri) throw new Error("MongoDB connection is not configured.");
  if (!connection) {
    connection = (async () => {
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, maxPoolSize: 3 });
      try {
        await client.connect();
        // The owner permits the existing full-access credential; every operation
        // still targets the fixed application database, never a browser-supplied name.
        await client.db(FAMILY_DATABASE).command({ ping: 1 });
        return client;
      } catch (error) {
        await client.close();
        connection = undefined;
        throw new Error("MongoDB connection failed. Check the database password and Atlas network access. Existing data has not been changed.");
      }
    })();
  }
  return connection;
}

export async function familyStore() {
  const client = await connect();
  const collection = client.db(FAMILY_DATABASE).collection<FamilyRecord>("website_state");
  const existing = await collection.findOne({ _id: "family-tree" });
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
    // One atomic document: never expose a partially migrated tree or overwrite an existing destination.
    await collection.updateOne({ _id: "family-tree" }, { $setOnInsert: {
      title: tree.data.title, members: tree.data.members, passwordHash: secret.data.password_hash,
      revision: 0, aiBlock: block.data ?? null,
    } }, { upsert: true });
  }
  return collection;
}

export async function verifyPassword(password: string, hash: string) {
  // PostgreSQL crypt uses the compatible $2a$ bcrypt format.
  return bcrypt.compare(password, hash);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}