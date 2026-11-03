import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { MongoClient } from "npm:mongodb@6.17.0";
import bcrypt from "npm:bcryptjs@2.4.3";
import { FAMILY_DATABASE } from "../_shared/mongo-policy.ts";

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

// MongoDB connection helper
async function getClient() {
  const uri = Deno.env.get("MONGODB_URI");
  if (!uri) throw new Error("MongoDB connection is not configured.");
  
  const client = new MongoClient(uri, { 
    serverSelectionTimeoutMS: 10000, 
    connectTimeoutMS: 10000, 
    maxPoolSize: 3 
  });
  
  try {
    await client.connect();
    await client.db(FAMILY_DATABASE).command({ ping: 1 });
    return client;
  } catch (error) {
    await client.close();
    throw new Error("MongoDB connection failed. Check the database password and Atlas network access.");
  }
}

// Helper to get collections
async function getCollections() {
  const client = await getClient();
  const db = client.db(FAMILY_DATABASE);
  return {
    websiteState: db.collection("website_state"),
    memberData: db.collection("member_data"),
    adminCredentials: db.collection("admin_credentials"),
    client
  };
}

// Helper to close connection
async function closeClient(client: MongoClient) {
  try {
    await client.close();
  } catch {}
}

// Password verification
async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// Password hashing
async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ message: "Only POST requests are allowed." }, 405);
  
  let client: MongoClient | null = null;
  
  try {
    const input = schema.safeParse(await req.json().catch(() => null));
    if (!input.success) return json({ message: "Invalid request. Check the entered data." }, 400);
    
    const { websiteState, memberData, adminCredentials } = await getCollections();
    client = (await getCollections()).client;
    
    // Load website state
    if (input.data.action === "load") {
      const [state, members, admin] = await Promise.all([
        websiteState.findOne({ _id: "family-tree" }),
        memberData.findOne({ _id: "family-tree" }),
        adminCredentials.findOne({ _id: "family-tree" })
      ]);
      
      if (!state) {
        // Create default state if doesn't exist
        await websiteState.insertOne({
          _id: "family-tree",
          title: "Family Tree",
          revision: 0
        });
        await memberData.insertOne({
          _id: "family-tree",
          members: []
        });
        
        return json({
          title: "Family Tree",
          members: [],
          revision: 0,
          hasPassword: !!admin?.passwordHash
        });
      }
      
      return json({
        title: state.title,
        members: members?.members || [],
        revision: state.revision,
        hasPassword: !!admin?.passwordHash
      });
    }
    
    // Check password
    if (input.data.action === "check") {
      const admin = await adminCredentials.findOne({ _id: "family-tree" });
      if (!admin || !admin.passwordHash) {
        // If no admin in MongoDB, create one with the provided password
        const hash = await hashPassword(input.data.password);
        await adminCredentials.updateOne(
          { _id: "family-tree" },
          { $set: { passwordHash: hash } },
          { upsert: true }
        );
        return json({ valid: true });
      }
      
      const isValid = await verifyPassword(input.data.password, admin.passwordHash);
      if (!isValid) return json({ message: "Wrong password" }, 403);
      return json({ valid: true });
    }
    
    // Change password
    if (input.data.action === "change-password") {
      const admin = await adminCredentials.findOne({ _id: "family-tree" });
      if (!admin) return json({ message: "Admin not found" }, 404);
      
      const isValid = await verifyPassword(input.data.password, admin.passwordHash);
      if (!isValid) return json({ message: "Wrong password" }, 403);
      
      const hash = await hashPassword(input.data.newPassword);
      await adminCredentials.updateOne(
        { _id: "family-tree", passwordHash: admin.passwordHash },
        { $set: { passwordHash: hash } }
      );
      return json({ saved: true });
    }
    
    // Save data
    if (input.data.action === "save") {
      // Verify password first
      const admin = await adminCredentials.findOne({ _id: "family-tree" });
      if (!admin) return json({ message: "Admin not found" }, 404);
      
      const isValid = await verifyPassword(input.data.password, admin.passwordHash);
      if (!isValid) return json({ message: "Wrong password" }, 403);
      
      // Validate member IDs are unique
      const ids = new Set(input.data.members.map((item) => item.id));
      if (ids.size !== input.data.members.length) {
        return json({ message: "Member IDs must be unique." }, 400);
      }
      
      // Save to website_state collection
      const stateResult = await websiteState.updateOne(
        { _id: "family-tree", revision: input.data.revision },
        { $set: { title: input.data.title }, $inc: { revision: 1 } }
      );
      
      if (!stateResult.matchedCount) {
        return json({ message: "The tree changed elsewhere. Reload before saving." }, 409);
      }
      
      // Save to member_data collection
      await memberData.updateOne(
        { _id: "family-tree" },
        { $set: { members: input.data.members } },
        { upsert: true }
      );
      
      return json({ saved: true, revision: input.data.revision + 1 });
    }
    
    return json({ message: "Invalid action" }, 400);
    
  } catch (error) {
    const message = error instanceof Error && /^(MongoDB |Unable to (copy|access))/.test(error.message) 
      ? error.message 
      : "Unable to access website data. No changes were saved.";
    return json({ message }, 503);
  } finally {
    if (client) {
      await closeClient(client);
    }
  }
});
