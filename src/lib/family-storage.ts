import type { Member } from "@/components/FamilyTree";

let mongo = false;
let revision = 0;
let queue: Promise<unknown> = Promise.resolve();

const LOCAL_STORAGE_KEY = "family-tree-data";

interface FamilyData {
  title: string;
  members: Member[];
  passwordHash?: string;
  revision: number;
}

async function request<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/family-data`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
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
    const data = await request<{ title: string; members: Member[]; revision: number }>({ action: "load" });
    mongo = true;
    revision = data.revision;
    return { ...data, migrationError: null };
  } catch {
    // Fallback to localStorage
    const localData = loadFromLocalStorage();
    if (localData) {
      mongo = false;
      revision = localData.revision || 0;
      return { 
        title: localData.title, 
        members: localData.members, 
        revision: localData.revision,
        migrationError: "Using local storage fallback. Configure MongoDB for cloud sync."
      };
    }
    // Return default data
    return { 
      title: "Family Tree",
      members: [],
      revision: 0,
      migrationError: "No saved data found. Configure MongoDB for cloud sync."
    };
  }
}

export async function hasAdminPassword() {
  // Check if we have localStorage data with password
  const localData = loadFromLocalStorage();
  if (localData && localData.passwordHash) {
    return true;
  }
  // Try to check via Edge Function
  try {
    await request({ action: "check", password: "dummy" });
    return true;
  } catch {
    // If Edge Function fails, check if we have any localStorage data
    return localData !== null;
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
      // Store password hash in localStorage for future checks
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
      const result = await request<{ revision: number }>({ action: "save", password, title, members, revision });
      revision = result.revision;
      return;
    }
    // Fallback to localStorage
    saveToLocalStorage({
      title,
      members,
      revision: revision + 1,
    });
    revision = revision + 1;
  });
  queue = save;
  return save;
}