import type { Member } from "@/components/FamilyTree";

let revision: number | undefined;
let queue: Promise<unknown> = Promise.resolve();

/** Error from the family-data function, carrying the HTTP status (403 = wrong password, 409 = tree changed elsewhere). */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/family-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.message || "Unable to access saved website data.", response.status);
  return payload as T;
}

/**
 * Load the saved tree. Errors are NOT hidden: if loading fails the caller must know,
 * otherwise an empty tree could be shown (and later saved) in place of the real one.
 */
export async function loadFamily() {
  const data = await request<{ title: string; members: Member[]; revision: number; hasPassword: boolean }>({ action: "load" });
  revision = data.revision;
  return data;
}
export async function hasAdminPassword() {
  return (await request<{ hasPassword: boolean }>({ action: "load" })).hasPassword;
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
    if (revision === undefined) throw new Error("Saved data did not load. Refresh the page before saving.");
    const result = await request<{ saved: boolean; revision: number }>({ action: "save", password, title, members, revision });
    if (!result.saved) throw new Error("MongoDB did not confirm the save.");
    revision = result.revision;
  });
  queue = save;
  return save;
}
