import type { Member } from "@/lib/types";

let revision: number | undefined;
let queue: Promise<unknown> = Promise.resolve();

/** Error from the family-data function, carrying the HTTP status (401 = session expired, 403 = wrong password, 409 = tree changed elsewhere, 429 = locked out). */
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

/** Run saves/restores one at a time so each one uses an up-to-date revision. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.catch(() => undefined).then(job);
  queue = run;
  return run;
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

/** Log in with the password; returns a session token. The password itself is never kept. */
export async function loginAdmin(password: string) {
  return (await request<{ token: string }>({ action: "login", password })).token;
}
export async function logoutAdmin(token: string) {
  await request({ action: "logout", token }).catch(() => undefined);
}
/** Needs the current password as well; returns a fresh session token (old logins stop working). */
export async function changeAdminPassword(token: string, password: string, newPassword: string) {
  return (await request<{ token: string }>({ action: "change-password", token, password, newPassword })).token;
}

export function saveFamily(token: string, title: string, members: Member[]) {
  return enqueue(async () => {
    if (revision === undefined) throw new Error("Saved data did not load. Refresh the page before saving.");
    const result = await request<{ saved: boolean; revision: number }>({ action: "save", token, title, members, revision });
    if (!result.saved) throw new Error("MongoDB did not confirm the save.");
    revision = result.revision;
  });
}

export interface BackupInfo {
  id: string;
  createdAt: string;
  revision: number;
  title: string;
  count: number;
  reason: string;
}
export async function listBackups(token: string) {
  return (await request<{ backups: BackupInfo[] }>({ action: "list-backups", token })).backups;
}
export function restoreBackup(token: string, backupId: string) {
  return enqueue(async () => {
    if (revision === undefined) throw new Error("Saved data did not load. Refresh the page before restoring.");
    const result = await request<{ saved: boolean; revision: number }>({ action: "restore-backup", token, backupId, revision });
    if (!result.saved) throw new Error("MongoDB did not confirm the restore.");
    revision = result.revision;
  });
}
