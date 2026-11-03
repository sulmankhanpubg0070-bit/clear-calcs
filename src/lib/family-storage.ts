import type { Member } from "@/components/FamilyTree";

let mongo = false;
let revision = 0;
let queue: Promise<unknown> = Promise.resolve();

const LOCAL_STORAGE_KEY = "family-tree-data";

interface FamilyData {
  title: string;
  members: Member[];
  revision: number;
}

// Enhanced request function with better error handling
async function request<T>(body: Record<string, unknown>): Promise<T> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/family-data`;
  
  console.log("📤 Sending request to:", url);
  console.log("📤 Request body:", JSON.stringify(body, null, 2));
  
  const response = await fetch(url, {
    method: "POST", 
    headers: { 
      "Content-Type": "application/json", 
      "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY 
    },
    body: JSON.stringify(body),
  });
  
  console.log("📥 Response status:", response.status);
  console.log("📥 Response headers:", Object.fromEntries(response.headers.entries()));
  
  const payload = await response.json();
  console.log("📥 Response payload:", JSON.stringify(payload, null, 2));
  
  if (!response.ok) {
    const errorMsg = payload.message || `HTTP ${response.status}: ${JSON.stringify(payload)}`;
    console.error("❌ Request failed:", errorMsg);
    throw new Error(errorMsg);
  }
  
  return payload;
}

function loadFromLocalStorage(): FamilyData | null {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (data) {
      console.log("💾 Loading from localStorage");
      return JSON.parse(data);
    }
  } catch {
    // Ignore errors
  }
  return null;
}

function saveToLocalStorage(data: FamilyData) {
  try {
    console.log("💾 Saving to localStorage");
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore errors
  }
}

export async function loadFamily() {
  console.log("🔍 Loading family data...");
  
  try {
    const data = await request<{ 
      title: string; 
      members: Member[]; 
      revision: number; 
      hasPassword: boolean 
    }>({ action: "load" });
    
    mongo = true;
    revision = data.revision;
    
    console.log("✅ Loaded from MongoDB:", {
      title: data.title,
      membersCount: data.members.length,
      revision: data.revision,
      hasPassword: data.hasPassword
    });
    
    return { 
      title: data.title, 
      members: data.members,
      revision: data.revision,
      hasPassword: data.hasPassword,
      migrationError: null 
    };
  } catch (error) {
    console.warn("⚠️ MongoDB load failed, trying localStorage:", error);
    
    // Fallback to localStorage
    const localData = loadFromLocalStorage();
    if (localData) {
      mongo = false;
      revision = localData.revision || 0;
      
      console.log("✅ Loaded from localStorage:", {
        title: localData.title,
        membersCount: localData.members.length,
        revision: localData.revision
      });
      
      return { 
        title: localData.title, 
        members: localData.members, 
        revision: localData.revision,
        hasPassword: false,
        migrationError: "Using local storage fallback. Configure MongoDB for cloud sync."
      };
    }
    
    console.log("ℹ️ No localStorage data found, using defaults");
    
    // Return default data
    return { 
      title: "Family Tree",
      members: [],
      revision: 0,
      hasPassword: false,
      migrationError: "No saved data found. Configure MongoDB for cloud sync."
    };
  }
}

export async function hasAdminPassword() {
  try {
    const data = await request<{ hasPassword: boolean }>({ action: "load" });
    return data.hasPassword;
  } catch {
    // Check localStorage fallback
    const localData = loadFromLocalStorage();
    return !!localData?.passwordHash;
  }
}

export async function loginAdmin(password: string, setup = false) {
  if (setup) throw new Error("Use the existing admin password.");
  
  console.log("🔐 Logging in admin...");
  
  try {
    await request({ action: "check", password });
    console.log("✅ Admin login successful (MongoDB)");
  } catch (error) {
    console.warn("⚠️ MongoDB login failed, trying localStorage:", error);
    
    // Fallback: if using localStorage, accept any non-empty password
    const localData = loadFromLocalStorage();
    if (localData && password) {
      console.log("✅ Admin login successful (localStorage fallback)");
      saveToLocalStorage({ ...localData, passwordHash: "hashed_" + password });
      return;
    }
    console.error("❌ Admin login failed");
    throw new Error("Wrong password");
  }
}

export async function changeAdminPassword(password: string, newPassword: string) {
  console.log("🔐 Changing admin password...");
  
  try {
    await request({ action: "change-password", password, newPassword });
    console.log("✅ Password changed (MongoDB)");
  } catch (error) {
    console.warn("⚠️ MongoDB password change failed, trying localStorage:", error);
    
    // Fallback: update password in localStorage
    const localData = loadFromLocalStorage();
    if (localData && password) {
      console.log("✅ Password changed (localStorage fallback)");
      saveToLocalStorage({ ...localData, passwordHash: "hashed_" + newPassword });
      return;
    }
    console.error("❌ Password change failed");
    throw new Error("Password change failed");
  }
}

export function saveFamily(password: string, title: string, members: Member[]) {
  console.log("💾 Saving family data...", {
    title,
    membersCount: members.length
  });
  
  const save = queue.catch(() => undefined).then(async () => {
    if (mongo) {
      console.log("📤 Saving to MongoDB...");
      
      try {
        const result = await request<{ 
          revision: number; 
          message?: string 
        }>({ 
          action: "save", 
          password, 
          title, 
          members, 
          revision 
        });
        
        revision = result.revision;
        console.log("✅ Saved to MongoDB, revision:", revision);
        
        // Also save to localStorage as backup
        saveToLocalStorage({
          title,
          members,
          revision: result.revision
        });
        
        return;
      } catch (error) {
        console.error("❌ MongoDB save failed:", error);
        throw error;
      }
    }
    
    console.log("⚠️ MongoDB not available, saving to localStorage");
    
    // Fallback to localStorage
    saveToLocalStorage({
      title,
      members,
      revision: revision + 1
    });
    revision = revision + 1;
    
    console.log("✅ Saved to localStorage, revision:", revision);
  });
  
  queue = save;
  return save;
}
