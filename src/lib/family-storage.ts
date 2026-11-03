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

async function request<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/family-data`, {
    method: "POST", 
    headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "Unable to access website data.");
  return payload;
}

function loadFromLocalStorage(): FamilyData | null {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch {
    // Ignore errors
  }
  return null;
}

function saveToLocalStorage(data: FamilyData) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore errors
  }
}

export async function loadFamily() {
  try {
    const data = await request<{ title: string; members: Member[]; revision: number; hasPassword: boolean }>({ action: "load" });
    mongo = true;
    revision = data.revision;
    return { 
      title: data.title, 
      members: data.members,
      revision: data.revision,
      hasPassword: data.hasPassword,
      migrationError: null 
    };
  } catch (error) {
    // Fallback to localStorage
    const localData = loadFromLocalStorage();
    if (localData) {
      mongo = false;
      revision = localData.revision || 0;
      return { 
        title: localData.title, 
        members: localData.members, 
        revision: localData.revision,
        hasPassword: false,
        migrationError: "Using local storage fallback. Configure MongoDB for cloud sync."
      };
    }
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
  try {
    await request({ action: "check", password });
  } catch {
    // Fallback: if using localStorage, accept any non-empty password
    const localData = loadFromLocalStorage();
    if (localData && password) {
      saveToLocalStorage({ ...localData, passwordHash: "hashed_" + password });
      return;
    }
    throw new Error("Wrong password");
  }
}

export async function changeAdminPassword(password: string, newPassword: string) {
  try {
    await request({ action: "change-password", password, newPassword });
  } catch {
    // Fallback: update password in localStorage
    const localData = loadFromLocalStorage();
    if (localData && password) {
      saveToLocalStorage({ ...localData, passwordHash: "hashed_" + newPassword });
      return;
    }
    throw new Error("Password change failed");
  }
}

export function saveFamily(password: string, title: string, members: Member[]) {
  const save = queue.catch(() => undefined).then(async () => {
    if (mongo) {
      const result = await request<{ revision: number }>({ 
        action: "save", 
        password, 
        title, 
        members, 
        revision 
      });
      revision = result.revision;
      
      // Also save to localStorage as backup
      saveToLocalStorage({
        title,
        members,
        revision: result.revision
      });
      return;
    }
    
    // Fallback to localStorage
    saveToLocalStorage({
      title,
      members,
      revision: revision + 1
    });
    revision = revision + 1;
  });
  queue = save;
  return save;
}
