/** Shared aggregate types. */

/** Entry from data/mod-dictionary.json. */
export type ModDictionaryEntry = {
  category: string;
  displayLabel: string;
};

/**
 * Keyed by mod `name` (e.g. `"item_fastercastrate"`).
 * Built by scripts/build-mod-dictionary.ts from data/mod-dictionary.json.
 */
export type ModDictionary = Record<string, ModDictionaryEntry>;
