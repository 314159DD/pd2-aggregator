// Copies the static game data the Meta aggregation needs from the repo root
// into server/src/core/static/ byte for byte. Never edit the copies by hand.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const dest = path.join(__dirname, "..", "src", "core", "static");
const files = [
  "data/item-slots.json",
  "data/skill-prereqs.json",
  "data/skill-classification.json",
  "data/mod-dictionary.json",
  "public/runeword-runes.json",
];

fs.mkdirSync(dest, { recursive: true });
for (const f of files) {
  fs.copyFileSync(path.join(root, f), path.join(dest, path.basename(f)));
  console.log("synced", f);
}
