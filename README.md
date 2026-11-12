# Pentra: Edgeliner (Foundry VTT v14 module)

The **Edgeliner** setting for **Pentra: Five-Dice Engine**, implementing the Edgeliner rules v0.5 on top of the core system.

**Requires** the [Pentra: Five-Dice Engine Core](https://github.com/millerrichd/pentra-core-foundry-vtt) system, **v0.5.1 or later**. That version adds the extension hooks this module uses (see [Core hooks](#core-hooks)).

## Install for development

Symlink this folder into your Foundry data directory so the folder name matches the module id:

```sh
ln -s "$(pwd)" "$HOME/Library/Application Support/FoundryVTT/Data/modules/pentra-edgeliner-foundry-vtt"
```

Then enable **Pentra: Edgeliner** in a world that uses the Pentra core system.

```sh
npm install          # dev tooling (Foundry CLI for compendiums)
npm test             # rules math tests (plain Node, no Foundry needed)
npm run build:packs  # compile src/packs/*.json -> packs/ (close Foundry first)
npm run unpack       # pull compendium edits made in Foundry back into src/packs/
```

## What's implemented

| Rule | How it works in Foundry |
| --- | --- |
| **Power attribute** | A sixth attribute on every character and NPC. It counts toward the 5 creation points like any other. |
| **Skills** | **Occult** (Knowledge), plus one Power skill per psychic discipline (15), totem aspect (15) and word of power (26). The Skills tab shows only the skills of the character's own tradition, and players can only raise those. |
| **Power talents** | **Power: Psychic Discipline / Totem Aspect / Words of Power**. Only one per character, and none for an Awakened AI (both are hard rules, GM included). Like any talent, they need a hindrance during creation. |
| **Drain Die** | Always shown on the sheet (base d8; Controlled Power / Improved Controlled Power raise it, the core's Uncontrolled Power lowers it). **Center** (Powers tab, or **Short Downtime** on the Downtime tab) recovers one size: 10 minutes of meditation. A **Camp** or **Day of rest** recovers it all, and their Downtime hints say so. Characters who can't use powers (Awakened AI) don't see these. |
| **Strain** | A new trait (base 4). Cybernetic Acceptance and Savant raise it, Cybernetic Rejection lowers it. Every implant point counts against it. Installing past the maximum is blocked for players (the GM is warned). **Every Strain point is −1 on every Power check**, added automatically. |
| **Casting** | **Powers tab → Build a Power** opens the builder. Choose the power and one option from each group; Construction Points, TN (7 + 1 per started 10 CP), drain range (1 to 1 + 1 per started 10 CP), the roll and the odds update as you go. Casting rolls Power + skill − Strain through the core check (Edge, advantage and statuses all apply), then makes the Drain Die usage check. The chat card lists the effect (targets, radius, duration × PAB, armor, healing) with buttons: **Apply damage** (armor applies, or ignored for Project Pain / Throw Electrical), **Heal** (not on machines), and **Resist** (a flat resistance check against 12 with the power's modifier). **Save build** keeps a configured power on the Powers tab for one-click casting. |
| **Psychic Disciplines** | A, B and C powers unlock at skill ranks 1, 4 and 6. Locked powers show a lock. |
| **Totem Aspects** | Choose the totem animal on the Powers tab. Its limit (Minor … Grand) for each aspect disables the higher-tier options in the builder. |
| **Words of Power** | Choose a known Action, Aspect and Target word; the incantation ("Oblitus Ignis Tibi") goes on the card. The check uses the **lowest** of the three word skills. |
| **Ancestries** | Awakened AI (Knowledge; doesn't breathe, so no drowning; no powers, Power stays d12+0; healing powers don't work on it), Uplifted Canine (Might), Feline (Intellect), Rodent (Finesse). |
| **Cyber tab** | Strain (used / maximum, with a meter), cybernetics, CyberDecks with their modules and programs, and hacking all live on their own **Cyber** tab, after Gear. Drones are listed there too, the way the Gear tab lists vehicles. |
| **Cybernetics** | All 21 from the book. Effects are automatic: advantage on an attribute's skill checks (AI Data Store, Body Sculpting, Bone Lacing, Cerebrum Processor, Muscle Stabilizer), advantage on a resistance (Boosted Reflexes, Cerebrum Mesh, Toxin Filters, including poison, disease and hit-location checks), Wired Reflexes (+d6 initiative), Subdermal Armor (+2 AR everywhere, with its own usage die that resets when Health is full), Cybernetic Limb Replacement (+1 AR per pair), Amphibious Modification (no breath checks), Smartgun Jack (cancels up to 2 points of range/cover), Bone Spurs (+1 wound unarmed), Muscle Enhancements (knockdown reminder on melee attacks), Skill Chip System + Skill Chips (slot 2; a chip raises its skill to rank 2). |
| **CyberDecks** | Basic, Deluxe and State-of-the-Art boards. Modules (Armor/Damage/Memory/Range Boost, basic or superior, one of each kind, up to the board's module slots) and programs (Burst, Drone Control, Stealth, Smoke, Warhammer, 1 Memory each; only Drone Control can be loaded more than once) are separate items, installed from the Cyber tab. The deck's stats include them. One deck is in use at a time. Hacking needs a working **Data Jack**. |
| **Short Burst Hacking** | The ⚡ button on the deck in use: Hacking vs the standard TN (−1 with Burst), checked against the deck's wireless range to the targeted token. On a success the d12 table sets 2/4/8/16 rounds, and the card's button lets the target's owner (usually the GM) pick the implant that goes down. Disabled implants give no bonus and count down at the end of their owner's turns in combat (the GM can bring one back early). |
| **Long System Delves** | **Delves** button at the top of the Actors sidebar (and on the Cyber tab's CyberDecks header), for GM and players. A delve is one **system**: the GM creates it and sets the security rank (which sets the Alert Threshold: Low 11, Moderate 9, High 7, Super High 5, Black Site 3), security Damage track and alert visibility. Hackers jack in by dragging a character onto it (players their own): dropped **on a run** they proceed together; dropped anywhere else they get a **run** of their own. Each run rolls its own usage checks (Multiple Hackers, p. 10); **Split off** and **Join run…** move a hacker between runs whenever neither is mid-gate or mid-fight. The **alert is shared** by the whole system, and a shutdown throws everyone out. **Gain access**: every hacker rolls their own; after a failure they're locked out until another hacker in the system has searched a round (straight away if nobody else is in). **Next round** rolls the run's d12 (whispered to the GM and the hackers' players): security (alert +1), a password gate, a data cache. **Gates**: every hacker in the run with access rolls Evade (+1 with Stealth); each failure raises the alert; once all have tried, the run gets through if anyone did, cache included. **Leave it** walks the whole run away. **Security fights**: every hacker in the run with access and a working deck fights. Security and each hacker roll a d6 Initiative Die (shifting like the core's); highest first, ties to the hackers, each side using all its actions before the next; the window shows every side's die, total and actions. On a hacker's turn their player gets **Attack** (Hacking vs security Evasion, deck damage − security AR), **Smoke** (that hacker leaves the fight; the others fight on) and **Pass**. On security's turn the GM picks the **target** deck and rolls **Security attacks** (attribute + skill vs that deck's Evasion, with the dice shown and spelled out); a deck brought to 0 Health crashes and its hacker is out of the fight and loses access. The fight ends when security's Damage reaches its track, nobody is left, or the GM ends it. Each delve **collapses** to a one-line summary (arrow in its header; **Collapse all** / **Expand all** at the bottom), remembered per user. Its whole **History** (up to 1,000 entries) is tagged with the run's round and who, oldest first, the acts-first line in bold. Player actions go to the GM's client over the module socket, so a GM must be logged in. Delves saved before runs existed become a system with one run. |
| **Defragmentation of CyberDeck** | Camp downtime (p. 10): a few hours make a deck as good as new. A **Defragment** button (wrench) appears on any damaged deck on the Cyber tab, and a row per damaged deck appears in the **Camp** section of the Downtime tab. It restores full Health, resets the deck's armor usage die to the owner's Durability Die, and recovers a crashed deck; a chat card says what was fixed. |
| **Drones** | Eagle, Sparrow, Doberman, Mustang, Assault Boat. They work like core vehicles: drag one from the Drones compendium onto a character to buy it, and it becomes a world actor that character's players own, with a linked token you drag from the Actors sidebar onto the scene and move around the board (it keeps its own Health, Evasion and AR, and can be targeted and damaged like any vehicle). Nobody rides in a drone: it's bought with an empty crew, and putting crew aboard is refused. The **Drones** section of the Cyber tab lists the character's drones (and any they operate), marks ones not yet on the scene, and sells them. Running a drone needs a working **Data Jack** and a **CyberDeck in use with a Drone Control program** loaded, one program per drone: the section shows programs used/loaded and says what's missing. **Take control** (🔗) checks all of that. Once in control: **Maneuver** (the drone's vehicle skill + Handling) and **Fire** each mounted weapon (range measured from the drone's token). There's −1 per drone in pseudo-AI mode; **Deep dive** into one drone removes it. **Drone Modifications** are the core vehicle mods at d4 R.D. |
| **Gear** | Synth-Clothing, Medium and Heavy Body Armor, Molecular Knife / Short Sword / Long Sword. The Flamethrower already ships with the core system. |
| **Language** | New characters' native language is **Corporate Trade**. |

## Compendiums

Edgeliner Ancestries, Hindrances, Talents, Armor and Weapons; Cybernetics; CyberDecks, Modules & Programs; Drones; Drone Modifications. The Uncontrolled Power hindrance comes from the core Hindrances compendium.

## Rules interpretations

These are places where the rulebook is ambiguous or silent. Each one is easy to change.

- **Drain on every cast**: the Drain Die usage check happens whether the cast succeeds or fails.
- **Words of Power damage**: the aspect word's damage group (1/2/3 wounds) is only part of the spell when it deals damage: with **Destroy**, or with **Force**, which "deals damage as it is used". Destroy sets the increment. Force without Destroy uses odd.
- **The Strain penalty** applies to every check made with the Power attribute (power skills and raw Power checks), not to resistances.
- **"X skill checks"** (AI Data Store etc.) means every check with a skill governed by that attribute, attacks included (Muscle Stabilizer covers Shooting), and languages for Knowledge. Raw attribute checks don't count.
- **Enhanced Hearing / Vision** aren't automated (the system can't tell a hearing check from a sight check). Choose advantage in the roll dialog.
- **Cybernetic limbs** are one item per limb; two in the same location (arms or legs) give +1 AR there. Hacked limbs keep their armor, as the book says. Subdermal plates also keep theirs while hacked, by the same reasoning.
- **Subdermal Armor** makes its own usage check (1 to the wounds before armor) on every hit, separately from worn armor.
- **Burst program**: "lowers the resistance check by 1" is read as −1 to the hacker's TN.
- **Shared data caches**: a cache found by a run of several hackers belongs to all of them. Each gets a copy on their Cyber tab, each worth one step less than the GM's price: one multiplier off (d8x2 → d8x1), or one die size at x1 (d8x1 → d6x1); a d4x1 stays d4x1. A solo hacker's cache is worth the full price.
- **Delve data caches** are kept as a list per delve: the round each was found, its **value tier** from the d12 that found it (4 low, 8 mid, 12 high; the GM can change it), what became of it, who recovered it, and what's in it. The GM sends a recovered cache to the hacker with the export icon, or sends them in bulk: **Send N ready to Cyber tab** (per delve) and **Send all ready caches** (bottom of the window, every delve) send each recovered, unsent cache that has a description and a Resource Die price to whoever recovered it; caches missing either stay put, with a note saying how many are waiting; it then lives on their Cyber tab under **Recovered data** (value, contents, which delve and round), independent of the delve, for the GM to price up afterwards. The GM also gives each cache a **Resource Die price** (die and multiplier, e.g. d8x2), in the Delves window or on the Cyber tab. The owner **sells** priced data from the Cyber tab: it's rolled against their Resource Die like any sale, but for the full price (the price is what a buyer pays for the data, so no resale markdown), and the entry is removed. The GM edits contents, value tier and price there; the owner can also just remove an entry. The book doesn't say what a cache holds, so the GM types the contents in; players see them only for caches they've recovered. A cache in the open is recovered when found. One behind a password gate stays locked until the hacker evades the gate (recovered), trips it (lost) or leaves it (left behind). The GM can correct a cache's status, remove one, or add a recovered cache by hand. Delves saved before this turn their old count into that many recovered caches.
- **Delve hidden information**: players see the round's finds (security, gate, cache) but not the alert level or security's stats, unless the GM shows the alert.
- **Delve security** has no Health in the book. Its **Damage** track defaults to 4 (the "four wounds before it crashes" the book gives computers) and the GM can change it. Security stats and the **Alert Threshold** follow the v0.5 tables (p. 10): Low 11, Moderate 9, High 7, Super High 5, Black Site 3; picking a rank sets the threshold, and the GM can adjust it after. The alert rises as soon as security is encountered.
- **Hacking combat initiative**: hacker and security each start on a d6 Initiative Die, separate from the characters' own, and it shifts the way the core's does (a natural 1 drops it, a natural max raises it, d4–d12) for that encounter. The higher total acts first (ties to the hacker) and uses all its actions (1 per 6 points, up to 3) before the other side; both re-roll when both are out. Wired Reflexes doesn't apply here: it's physical initiative only (the combat tracker).
- **Drones** have no Speed Class in the book; they're set to 1. Pseudo-AI penalty counts all of the operator's drones in pseudo-AI mode.
- **Totem options** without a tier (duration, resistance, heavy) are open to every animal. Powers whose resistance isn't named offer all three resistances on the card.
- **Uplifted sizes**: the book gives heights only, so all ancestries are Medium.
- **Amphibious Modification**'s "full Movement Pace while swimming" isn't automated: the core swimming limit still applies on the ruler.
- **Body Armor** from the core compendium counts as the light model, as the book says; it isn't renamed.

## Core hooks

The module relies on four extension points added to the core system in v0.5.1. Nothing else in the core changed:

| Hook | Called | Used for |
| --- | --- | --- |
| `pentraRollCheck(actor, ctx)` | Just before any check rolls | Strain penalty on powers, implant advantages, skill chips, Smartgun, Bone Spurs |
| `pentraWoundsApplied(actor, info)` | After damage is applied | Subdermal Armor usage check |
| `pentraRest(actor, kind)` | After a Camp / Day of rest | Recovering all Drain |
| `pentraNeedsAir(actor)` | Before a breath check | Awakened AI and Amphibious Modification |

The core's `rollCheck` also accepts `fromToken`, which measures range from a drone's token instead of the operator's.

## Project layout

```
module.json                  manifest (requires the core system ≥ 0.5.1; item sub-types; packs)
scripts/main.js              adds Power, the skills and Strain to the core config; registers everything
scripts/core.js              the one place that imports the core system's code
scripts/config.js            Edgeliner tables (security ranks, burst table, cyber effects …)
scripts/powers-data.js       every power, aspect, totem animal and word, with its option groups
scripts/rules.js             pure rules math (unit tested)
scripts/models.js            character/NPC models (Strain, cyber armor, tradition) and the item models
scripts/documents.js         purchases, Strain cap, Power talent rules, deck installs, initiative, hacked implants
scripts/checks.js            listeners on the core hooks
scripts/powers.js            casting, drain, and the chat card buttons
scripts/hacking.js           Short Burst and deck damage
scripts/drones.js            linking, maneuvering and firing drones
scripts/apps/caster.js       the Power Builder
scripts/apps/delve.js        the Delve tracker
scripts/sheets/              the character sheet (Cyber and Powers tabs) and the item sheet
templates/  lang/  css/
src/packs/                   compendium source JSON (source of truth)
packs/                       compiled LevelDB compendiums
tests/                       node:test suites
```
