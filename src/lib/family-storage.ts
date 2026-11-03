import { supabase } from "@/integrations/supabase/client";
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
  try {
    const data = await request<{ title: string; members: Member[]; revision: number }>({ action: "load" });
    mongo = true;
    revision = data.revision;
    return { ...data, migrationError: null };
  } catch (error) {
    // Retain the working original site until isolation and migration have actually succeeded.
    const { data, error: sourceError } = await supabase.from("site_data").select("title,members").eq("id", 1).single();
    if (sourceError) throw new Error("Unable to load saved family data.");
    return { title: data.title, members: data.members as unknown as Member[], migrationError: error instanceof Error ? error.message : "MongoDB is not ready." };
  }
}

export async function hasAdminPassword() {
  if (mongo) return true;
  const { data, error } = await supabase.rpc("admin_has_password");
  if (error) throw new Error(error.message);
  return data === true;
}

export async function loginAdmin(password: string, setup = false) {
  if (mongo) { await request({ action: "check", password }); return; }
  const { data, error } = await supabase.rpc(setup ? "admin_setup" : "admin_check", { _password: password });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error(setup ? "Password already set. Log in again." : "Wrong password");
}

export async function changeAdminPassword(password: string, newPassword: string) {
  if (mongo) { await request({ action: "change-password", password, newPassword }); return; }
  const { data, error } = await supabase.rpc("admin_change_password", { _old: password, _new: newPassword });
  if (error || data !== true) throw new Error(error?.message || "Password change failed.");
}

export function saveFamily(password: string, title: string, members: Member[]) {
  const save = queue.catch(() => undefined).then(async () => {
    if (mongo) {
      const result = await request<{ revision: number }>({ action: "save", password, title, members, revision });
      revision = result.revision;
      return;
    }
    const { data, error } = await supabase.rpc("admin_save", { _password: password, _title: title, _members: members as unknown as never });
    if (error || data !== true) throw new Error(error?.message || "Save failed.");
  });
  queue = save;
  return save;
}