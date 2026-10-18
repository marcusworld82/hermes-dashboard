// Words and phrases that read as AI-written. Seeded from Marcus's writing rules; editable on the Carousels page.
export const DEFAULT_BANNED = [
  "delve", "crucial", "pivotal", "robust", "seamless", "leverage", "foster", "unlock", "navigate", "elevate", "utilize",
  "game-changer", "unlock your potential", "let's dive in", "here's the thing", "let that sink in",
  "in today's fast-paced world", "in today's world", "revolutionize", "next level", "let's break this down", "i hope this helps",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s: string) => s.replace(/[‘’]/g, "'");

export function findBanned(text: string, list: string[]): string[] {
  const t = norm(text);
  return list.filter((phrase) => new RegExp(`(^|[^\\p{L}\\p{N}'])${escape(norm(phrase))}(?=$|[^\\p{L}\\p{N}'])`, "iu").test(t));
}

// Marcus never wants em dashes. Spaced en dashes are used the same way; number ranges keep theirs.
export function stripDashes(text: string): string {
  return text.replace(/\s*—\s*/g, ", ").replace(/\s+–\s+/g, ", ");
}
