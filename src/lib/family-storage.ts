import type { Member } from "@/components/FamilyTree";

let mongo = false;
let revision = 0;
let queue: Promise<unknown> = Promise.resolve();

async function request<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/family-data`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "Unable to access website data.");
  return payload;
}

export async function loadFamily() {
    const data = await request<{ title: string; members: Member[]; revision: number }>({ action: "load" });
    mongo = true;
    revision = data.revision;
    return { ...data, migrationError: null };
}

export async function hasAdminPassword() {
  return true;
}

export async function loginAdmin(password: string, setup = false) {
  if (setup) throw new Error("Use the existing admin password.");
  await request({ action: "check", password });
}

export async function changeAdminPassword(password: string, newPassword: string) {
  await request({ action: "change-password", password, newPassword });
}

export function saveFamily(password: string, title: string, members: Member[]) {
  const save = queue.catch(() => undefined).then(async () => {
    if (mongo) {
      const result = await request<{ revision: number }>({ action: "save", password, title, members, revision });
      revision = result.revision;
      return;
    }
    throw new Error("Wait for saved data to load.");
  });
  queue = save;
  return save;
}