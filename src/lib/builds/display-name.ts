import { Profanity } from "@2toad/profanity";

// Names stay raw in the API; masking is display only. Whole-word matching on a tokenised name
// (camelCase, "_", "-" and digits split into words) avoids false hits like Nobody, Assassin, Peacock.
const profanity = new Profanity({ wholeWord: true });

const tokenise = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-0-9]+/g, " ");

export function displayName(name: string): string {
  if (!name || !profanity.exists(tokenise(name))) return name;
  return name[0] + "*".repeat(name.length - 1);
}
