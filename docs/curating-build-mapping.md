# Curating the Build → Skills Mapping

A guide for the build expert. No coding required to *review* — only to *apply* changes (and even that is just editing one text file).

## Why this file exists

The site's build preset buttons come from the **Dark Humility tier list** (the
public Google Sheet behind `pd2.madebykontra.com`). That sheet lists each
build's *name* and *performance*, and the site computes the **tier letter**
from it automatically.

What the sheet does **not** contain is which in-game **skills** each build
uses. The site needs the skills — that is how it filters real pd2.tools
characters to show gear/affix data for a build. So there is exactly one
hand-maintained file that supplies the skills:

```
data/kontra-build-skills.json
```

**This is the only file a curator touches.** Tier letters, sorting, and the
nightly refresh are all automatic.

## The format

It is a JSON object. Each **key** is the exact build name as written in the DH
sheet. Each **value** describes that build:

```json
"Blessed Hammer (H Lvl 1)": { "skills": ["Blessed Hammer"] },

"Confuse (+ Amp + Iron Maiden)": {
  "skills": ["Confuse", "Amplify Damage", "Iron Maiden"]
},

"Physical Sacrifice (1-H) (Schaeffer's) (RT'd)": {
  "skills": ["Sacrifice"], "mergeInto": "Physical Sacrifice"
},
"Physical Sacrifice (2-H) (Leoric's) (RT'd)": {
  "skills": ["Sacrifice"], "mergeInto": "Physical Sacrifice"
},

"Wolf Barb (H Lvl 1)": {
  "skills": ["Frenzy"],
  "notes": "Item-granted werewolf Barbarian; defining Barb skill uncertain — expert to verify."
}
```

### Fields

| Field | Required | What it does |
|-------|----------|--------------|
| `skills` | yes | The in-game skill name(s) that **define** the build. |
| `mergeInto` | no | Collapses several sheet rows into one preset button. |
| `notes` | no | Free text — explain a non-obvious choice or flag doubt. |

**`skills`** — the skill(s) the build invests in. For most builds this is a
single skill. List several **only** when the build genuinely needs more than
one to be identified (a curse-stacking build, an aura + attack combo). The
first skill in the list also decides which **class** the build is filed under.

> ⚠️ Spelling matters. Skill names must match how Project Diablo 2 spells them
> exactly — `"Fist of the Heavens"`, not `"Fist of Heavens"`; `"Multiple
> Shot"`, not `"Multishot"`. A misspelled skill makes the preset filter match
> nothing. (A safety check in the test suite catches unknown skill names.)

**`mergeInto`** — when two or more sheet rows are the *same build* differing
only by gear (1-handed vs 2-handed, weapon choice), give them all the **same**
`mergeInto` value. They become a single preset button, which shows the **best
tier** among the merged rows. Use this only for true gear variants — if the
builds differ in playstyle or damage type, keep them separate.

**`notes`** — anything worth recording. The seed file already uses this to
flag builds whose skill mapping is a best guess.

## How to find the builds that need attention

Open `data/kontra-build-skills.json` and search for `notes`. Every entry with
a note has a reason. The phrases **"uncertain"** and **"expert to verify"**
mark the builds where an expert opinion is most valuable — mostly the
item-granted shapeshifter builds (Wolf/Bear/Zeal Barb, Bearzon, Bear Sorc) and
a few proc builds, where the build is defined more by gear than by a skill.

For those: decide which skill best represents what the *character* actually
invests points in, set `skills` accordingly, and update or remove the note.

## Applying a change

Pick whichever fits the curator:

- **Easiest — review only:** open the file, write corrections (build name →
  the skills it should have), send them back. The repo owner applies them.
- **Direct edit via GitHub:** edit `data/kontra-build-skills.json` in the
  GitHub web editor and commit. Keep the JSON valid — every entry needs its
  commas and braces; a single typo breaks the file.

After a change lands, a nightly job rebuilds `data/kontra-builds.json` (the
preset data the site reads) from the DH sheet + this mapping, and the site
redeploys. Changes are visible within a day, or immediately if the owner
triggers a rebuild.

## What the site does with it

```
DH Google Sheet  ─┐
                  ├─►  nightly job  ─►  data/kontra-builds.json  ─►  preset buttons
this mapping file ─┘   (computes tier,
                        joins skills)
```

The curator only ever owns the mapping file. Everything downstream is
automatic.

## Coming later

A PIN-protected editor page on the site itself (a spreadsheet-style table,
class filter, no JSON, no GitHub) is planned — it will write to this same
file. Until then, the two methods above are how curation happens.
