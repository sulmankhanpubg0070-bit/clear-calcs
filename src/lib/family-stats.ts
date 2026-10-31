import type { Member } from "@/components/FamilyTree";

export const familyContact = {
  display: "03095625845",
  phone: "tel:+923095625845",
  whatsapp: "https://wa.me/923095625845",
};

export function getFamilyStats(members: Member[]) {
  const ids = new Set(members.map((member) => member.id));
  const couples = new Set<string>();
  for (const member of members) {
    if (member.spouseId && member.spouseId !== member.id && ids.has(member.spouseId)) {
      couples.add(JSON.stringify([member.id, member.spouseId].sort()));
    }
  }
  return {
    total: members.length,
    male: members.filter((m) => m.gender === "male").length,
    female: members.filter((m) => m.gender === "female").length,
    other: members.filter((m) => m.gender === "other").length,
    couples: couples.size,
    parentLinks: members.filter((m) => m.parentId && m.parentId !== m.id && ids.has(m.parentId)).length,
  };
}