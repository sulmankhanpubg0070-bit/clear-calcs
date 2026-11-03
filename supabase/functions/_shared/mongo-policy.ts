export const FAMILY_DATABASE = "Familyloveable";

export function publicTree(record: { title: string; members: unknown[]; passwordHash?: string; aiBlock?: unknown }) {
  return { title: record.title, members: record.members };
}

// Collection names for separate data storage
export const COLLECTION_WEBSITE_STATE = "website_state";
export const COLLECTION_MEMBER_DATA = "member_data";
export const COLLECTION_ADMIN_CREDENTIALS = "admin_credentials";