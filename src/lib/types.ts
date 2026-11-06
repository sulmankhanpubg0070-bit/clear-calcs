export type Gender = "male" | "female" | "other";

export interface Member {
  id: string;
  name: string;
  gender: Gender;
  birthYear?: string;
  deathYear?: string;
  phone?: string;
  /** Small resized picture stored as a data: URL. */
  photo?: string;
  parentId?: string | null;
  spouseId?: string | null;
}
