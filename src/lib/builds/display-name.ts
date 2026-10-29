import { Profanity } from "@2toad/profanity";

// Same settings as pd2-tools' scraper. Names stay raw in the API; masking is display only.
const profanity = new Profanity({ wholeWord: false });

export function displayName(name: string): string {
  if (!name || !profanity.exists(name)) return name;
  return name[0] + "*".repeat(name.length - 1);
}
