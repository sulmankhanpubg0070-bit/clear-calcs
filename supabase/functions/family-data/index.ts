import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { MongoClient } from "npm:mongodb@6.17.0";
import bcrypt from "npm:bcryptjs@2.4.3";
import { FAMILY_DATABASE } from "../_shared/mongo-policy.ts";

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

// MongoDB connection with caching
let cachedClient: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

async function getClient(): Promise<MongoClient> {
  if (cachedClient) {
    return cachedClient;
  }
  
  if (!clientPromise) {
    const uri = Deno.env.get("MONGODB_URI");
    if (!uri) {
      throw new Error("MongoDB connection is not configured. Set MONGODB_URI secret.");
    }
    
    clientPromise = (async () => {
      const client = new MongoClient(uri, { 
        serverSelectionTimeoutMS: 10000, 
        connectTimeoutMS: 10000, 
        maxPoolSize: 3 
      });
      
      try {
        await client.connect();
        await client.db(FAMILY_DATABASE).command({ ping: 1 });
        cachedClient = client;
        return client;
      } catch (error) {
        await client.close();
        throw new Error(`MongoDB connection failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  }
  
  return clientPromise;
}

// Get database collections
async function getDb() {
  const client = await getClient();
  return client.db(FAMILY_DATABASE);
}

// Password helpers
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  
  if (req.method !== "POST") {
    return json({ message: "Only POST requests are allowed." }, 405);
  }
  
  try {
    const body = await req.json().catch(() => null);
    const input = schema.safeParse(body);
    
    if (!input.success) {
      return json({ message: "Invalid request. Check the entered data.", error: input.error.format() }, 400);
    }
    
    const db = await getDb();
    const websiteState = db.collection("website_state");
    const memberData = db.collection("member_data");
    const adminCredentials = db.collection("admin_credentials");
    
    const action = input.data.action;
    
    // LOAD: Get website state, members, and check if password exists
    if (action === "load") {
      const [state, members, admin] = await Promise.all([
        websiteState.findOne({ _id: "family-tree" }),
        memberData.findOne({ _id: "family-tree" }),
        adminCredentials.findOne({ _id: "family-tree" })
      ]);
      
      // Create default records if they don't exist
      if (!state) {
        await websiteState.insertOne({
          _id: "family-tree",
          title: "Family Tree",
          revision: 0
        });
      }
      
      if (!members) {
        await memberData.insertOne({
          _id: "family-tree",
          members: []
        });
      }
      
      const resultState = state || { title: "Family Tree", revision: 0 };
      const resultMembers = members || { members: [] };
      
      return json({
        title: resultState.title,
        members: resultMembers.members,
        revision: resultState.revision,
        hasPassword: !!admin?.passwordHash
      });
    }
    
    // CHECK: Verify admin password
    if (action === "check") {
      const admin = await adminCredentials.findOne({ _id: "family-tree" });
      
      if (!admin || !admin.passwordHash) {
        // First time: create admin with this password
        const hash = await hashPassword(input.data.password);
        await adminCredentials.updateOne(
          { _id: "family-tree" },
          { $set: { passwordHash: hash } },
          { upsert: true }
        );
        return json({ valid: true, message: "Admin created" });
      }
      
      const isValid = await verifyPassword(input.data.password, admin.passwordHash);
      if (!isValid) {
        return json({ message: "Wrong password" }, 403);
      }
      return json({ valid: true });
    }
    
    // CHANGE-PASSWORD: Update admin password
    if (action === "change-password") {
      const admin = await adminCredentials.findOne({ _id: "family-tree" });
      
      if (!admin) {
        return json({ message: "Admin not found" }, 404);
      }
      
      const isValid = await verifyPassword(input.data.password, admin.passwordHash);
      if (!isValid) {
        return json({ message: "Wrong password" }, 403);
      }
      
      const hash = await hashPassword(input.data.newPassword);
      const result = await adminCredentials.updateOne(
        { _id: "family-tree", passwordHash: admin.passwordHash },
        { $set: { passwordHash: hash } }
      );
      
      if (!result.matchedCount) {
        return json({ message: "Password changed elsewhere. Try again." }, 409);
      }
      
      return json({ saved: true, message: "Password changed" });
    }
    
    // SAVE: Save website state and members to separate collections
    if (action === "save") {
      const { password, title, members, revision } = input.data;
      
      // Verify password
      const admin = await adminCredentials.findOne({ _id: "family-tree" });
      if (!admin) {
        return json({ message: "Admin not found" }, 404);
      }
      
      const isValid = await verifyPassword(password, admin.passwordHash);
      if (!isValid) {
        return json({ message: "Wrong password" }, 403);
      }
      
      // Validate member IDs are unique
      const ids = new Set(members.map((m: { id: string }) => m.id));
      if (ids.size !== members.length) {
        return json({ message: "Member IDs must be unique." }, 400);
      }
      
      // Save to website_state collection
      const stateResult = await websiteState.updateOne(
        { _id: "family-tree", revision },
        { $set: { title }, $inc: { revision: 1 } }
      );
      
      if (!stateResult.matchedCount) {
        return json({ message: "The tree changed elsewhere. Reload before saving." }, 409);
      }
      
      // Save to member_data collection
      await memberData.updateOne(
        { _id: "family-tree" },
        { $set: { members } },
        { upsert: true }
      );
      
      return json({ saved: true, revision: revision + 1, message: "Data saved to MongoDB" });
    }
    
    return json({ message: "Invalid action" }, 400);
    
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to access website data. No changes were saved.";
    console.error("Edge Function Error:", error);
    return json({ message, error: error instanceof Error ? error.stack : undefined }, 503);
  }
});
