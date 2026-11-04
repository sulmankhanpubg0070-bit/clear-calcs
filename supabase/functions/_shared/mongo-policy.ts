export const FAMILY_DATABASE = "Familyloveable";

export function publicTree(record: { title: string; members: unknown[]; passwordHash?: string; aiBlock?: unknown }) {
  return { title: record.title, members: record.members };
}

// Collection names for separate data storage
export const COLLECTION_WEBSITE_STATE = "website_state";
export const COLLECTION_MEMBER_DATA = "member_data";
export const COLLECTION_ADMIN_CREDENTIALS = "admin_credentials";

export interface WebsiteState {
  _id: string;
  title: string;
  revision: number;
  members?: unknown[];
  passwordHash?: string;
  aiBlock?: { blocked_status: number; message: string } | null;
}
export interface MemberData { _id: string; members: unknown[] }
export interface AdminCredentials { _id: string; passwordHash: string }

// Prefer existing separated records; only fill gaps from the original document.
export function separationSeed(state: WebsiteState, members: MemberData | null, admin: AdminCredentials | null) {
  const selectedMembers = members?.members ?? state.members;
  const selectedHash = admin?.passwordHash ?? state.passwordHash;
  if (!Array.isArray(selectedMembers) || !selectedHash) {
    throw new Error("Existing family data or admin password is missing. No changes were saved.");
  }
  return {
    members: { _id: "family-tree", members: selectedMembers },
    admin: { _id: "family-tree", passwordHash: selectedHash },
  };
}