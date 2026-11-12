/**
 * The Edgeliner power tables (rulebook v0.4, pp. 13–37). Pure data: no Foundry globals.
 *
 * A power is a base cost plus groups of options; the caster picks exactly one option from every group and the
 * Construction Points (CP) add up. Options carry an `effect` the casting card reads (targets, damage, duration…).
 * Totem aspect options carry a `tier` (minor … grand); the totem animal caps the tier per aspect.
 */

/* -------------------------------------------------------------------------- */
/*  Shared option groups                                                      */
/* -------------------------------------------------------------------------- */

const opt = (label, cp, effect = {}, tier = null) => ({ label, cp, effect, ...(tier ? { tier } : {}) });
const group = (key, label, options, extra = {}) => ({ key, label, options, ...extra });

const TIERS = ["minor", "moderate", "significant", "grand"];
/** Attach the four tiers, in order, to the first four options. */
const tiered = options => options.map((o, i) => (i < 4 ? { ...o, tier: TIERS[i] } : o));

export const TARGETS = () => group("targets", "Targets", [
  opt("1 Target", 3, { targets: 1 }), opt("2 Targets", 5, { targets: 2 }),
  opt("3 Targets", 7, { targets: 3 }), opt("4 Targets", 9, { targets: 4 })
]);

export const RESIST = () => group("resist", "Resistance", [
  opt("+2 Bonus", 1, { resist: 2 }), opt("+1 Bonus", 4, { resist: 1 }), opt("+0 Bonus", 7, { resist: 0 }),
  opt("-1 Penalty", 10, { resist: -1 }), opt("-2 Penalty", 13, { resist: -2 })
]);

export const DURATION = () => group("duration", "Duration", [
  opt("1 round x PAB", 1, { duration: "round" }), opt("1 minute x PAB", 3, { duration: "minute" }),
  opt("1 hour x PAB", 6, { duration: "hour" })
]);

const RADIUS_OPTIONS = () => [
  opt("Very Close Radius", 3, { radius: "veryClose" }), opt("Close Radius", 5, { radius: "close" }),
  opt("Far Radius", 7, { radius: "far" }), opt("Very Far Radius", 9, { radius: "veryFar" })
];
export const RADIUS = (label = "Target Radius") => group("radius", label, RADIUS_OPTIONS());

const DAMAGE_OPTIONS = () => [
  opt("1 Wound (odd)", 1, { wounds: 1, increment: "odd" }), opt("1 Wound (even)", 4, { wounds: 1, increment: "even" }),
  opt("2 Wounds (odd)", 7, { wounds: 2, increment: "odd" }), opt("2 Wounds (even)", 10, { wounds: 2, increment: "even" }),
  opt("2 Wounds (every)", 13, { wounds: 2, increment: "every" })
];
export const DAMAGE = (label = "Damage") => group("damage", label, DAMAGE_OPTIONS());

export const HEAVY_WEAPON = () => group("heavy", "Considered Heavy Weapon", [
  opt("Does not count as", 0), opt("Counts as", 10, { heavy: true })
]);

const AR_OPTIONS = () => [
  opt("AR +1", 3, { ar: 1 }), opt("AR +2", 5, { ar: 2 }), opt("AR +3", 7, { ar: 3 }), opt("AR +4", 9, { ar: 4 })
];
export const ARMOR_RATING = () => group("ar", "Armor Rating", AR_OPTIONS());

export const HEAVY_ARMOR = () => group("heavyArmor", "Considered Heavy Armor", [
  opt("Does not count as", 0), opt("Counts as", 10, { heavyArmor: true })
]);

const SPIRIT_OPTIONS = () => [
  opt("Medium", 4, { size: "medium" }), opt("Large", 6, { size: "large" }),
  opt("Huge", 10, { size: "huge" }), opt("Massive", 16, { size: "massive" })
];

const HOW_FAR_BACK = () => group("back", "How Far Back", [
  opt("1 Hour x PAB", 6, { back: "hour" }), opt("1 Day x PAB", 12, { back: "day" }),
  opt("1 Week x PAB", 18, { back: "week" }), opt("1 Month x PAB", 24, { back: "month" })
]);

const SKILL_SELECTION = n => group("skills", "Skill Selection",
  [1, 2, 3, 4].slice(0, n).map(k => opt(`${k} Skill${k > 1 ? "s" : ""}`, 3 * k, { skills: k })));

/* -------------------------------------------------------------------------- */
/*  Psychic Discipline powers (pp. 14–25)                                     */
/* -------------------------------------------------------------------------- */

/**
 * Keyed by discipline (the psychic skill). Each discipline has an A, B and C rated power; a psychic's rank in the
 * skill sets which ratings they can use (1–3: A, 4–5: A–B, 6: A–C).
 * `resist` names the resistance the target rolls, when the power says so.
 */
export const PSYCHIC_POWERS = {
  chronokinesis: [
    { id: "sloth", name: "Sloth", rating: "A", base: 4, resist: "reflex",
      text: "The targets move slowly: their movement range bands drop one level (walk Very Close, run Close). Reflex resistance to avoid.",
      groups: [TARGETS(), RESIST(), DURATION()] },
    { id: "speed", name: "Speed", rating: "B", base: 5,
      text: "The targets hasten: their movement range bands rise one level (walk Far, run Very Far).",
      groups: [TARGETS(), DURATION()] },
    { id: "rewindAction", name: "Rewind Action", rating: "C", base: 11,
      text: "Gain a 0-action reaction, usable once at any time, that forces the current action to roll again and keep the new result. The power ends once used.",
      groups: [DURATION()] }
  ],
  control: [
    { id: "confusion", name: "Confusion", rating: "A", base: 3, resist: "mind",
      text: "On a failed Mind resistance the creature acts confused: roll a d12; 1–4 it does nothing, 5–12 it attacks the nearest creature, even an ally. A new Mind check at the end of every turn.",
      groups: [TARGETS(), RESIST(), DURATION()] },
    { id: "charm", name: "Charm", rating: "B", base: 5, resist: "mind",
      text: "On a failed Mind resistance the creature treats you (not your companions) as an ally and protects you until it is hit, which grants another check. On a success it knows who tried to charm it.",
      groups: [TARGETS(), RESIST(), DURATION()] },
    { id: "dominate", name: "Dominate", rating: "C", base: 7, resist: "mind",
      text: "Take control of the target and tell it what to do on its next initiative, even self-harm. Mind resistance to resist, and again at the end of each turn of combat.",
      groups: [TARGETS(), RESIST(), DURATION()] }
  ],
  construct: [
    { id: "createItem", name: "Create Item", rating: "A", base: 4,
      text: "Create a facsimile of a solid object: not electrical. A mechanical object (pistol, bicycle) works but makes no ammunition.",
      groups: [DURATION(),
        group("size", "Object Size", [opt("Tiny", 1), opt("Small", 2), opt("Medium", 4), opt("Large", 7)]),
        group("mechanical", "Mechanical", [opt("A Non-mechanical Object (shovel)", 0), opt("A Mechanical Object (pistol, bicycle)", 10)])] },
    { id: "barrier", name: "Barrier", rating: "B", base: 6,
      text: "A barrier that stops kinetic motion and provides hard cover.",
      groups: [DURATION(),
        group("wall", "Wall Size", [opt("2 yards wide, 2 tall, 1 thick", 2), opt("4 yards wide, 2 tall, 1 thick", 5),
          opt("6 yards wide, 2 tall, 1 thick", 8), opt("8 yards wide, 2 tall, 1 thick", 12)])] },
    { id: "createServant", name: "Create Servant", rating: "C", base: 10,
      text: "An allied servant follows you. It has 6 Health and a skill equal to half your Power skill ranks. The basic form doesn't fight; the combat model does.",
      groups: [DURATION(),
        group("stats", "Attribute/Resistance Statistics", [opt("d12+0", 1), opt("d10+2", 3), opt("d8+4", 6), opt("d6+6", 10), opt("d4+8", 15)]),
        DAMAGE("Damage (Combat Model)"),
        group("combat", "Combat Model", [opt("Non-Combat Servant", 0), opt("Combat Servant", 10)])] }
  ],
  cryokinesis: [
    { id: "freezeWater", name: "Freeze Water", rating: "A", base: 3,
      text: "Freeze the water in the air into ice. A water spirit gets disadvantage on all checks on its next initiative.",
      groups: [RADIUS(), DURATION()] },
    { id: "throwIce", name: "Throw Ice", rating: "B", base: 4, attack: true,
      text: "Freeze the water in the air and hurl it at the targets.",
      groups: [TARGETS(), DAMAGE(), HEAVY_WEAPON()] },
    { id: "frozenArmor", name: "Frozen Armor", rating: "C", base: 5,
      text: "Armor of frozen air that resists kinetic and cold damage.",
      groups: [DURATION(), ARMOR_RATING(), HEAVY_ARMOR()] }
  ],
  detection: [
    { id: "locatePower", name: "Locate Power", rating: "A", base: 2,
      text: "Scan the area for power sources; the greater the concentration, the more power there is.",
      groups: [RADIUS(), DURATION()] },
    { id: "locateThing", name: "Locate Thing", rating: "B", base: 3,
      text: "Pinpoint a specific thing you know (a holo-display is enough) within the radius.",
      groups: [RADIUS(), DURATION()] },
    { id: "locatePerson", name: "Locate Person", rating: "C", base: 4, resist: "mind",
      text: "Pinpoint a person you know within the radius. The target makes a Mind resistance check to fool your senses.",
      groups: [RADIUS(), RESIST(), DURATION()] }
  ],
  electrokinesis: [
    { id: "shieldElectrical", name: "Shield Electrical", rating: "A", base: 5,
      text: "An energy shield that stops electrical attacks. Adds to worn armor, only against electrical damage.",
      groups: [DURATION(), ARMOR_RATING(), HEAVY_ARMOR()] },
    { id: "throwElectrical", name: "Throw Electrical", rating: "B", base: 4, attack: true, resist: "fortitude", ignoresArmor: true,
      text: "Electrical arcs hit targets within Close range. Always resisted with Fortitude; only fully enclosed body armor and vehicles protect.",
      groups: [TARGETS(), DAMAGE(), HEAVY_WEAPON()] },
    { id: "drainRecharge", name: "Drain or Recharge Device", rating: "C", base: 4,
      text: "All electronics in the radius recharge to full or drain to zero. Draining: each device makes a usage check (devices d6, shielded d8, vehicles and robots d10, cybernetics d12) and shuts down on a 1 to (1 − resistance value), minimum 1. Reactors shut off for one round. Awakened AI make a Mind resistance check instead.",
      groups: [RADIUS(), RESIST()] }
  ],
  empathy: [
    { id: "calmEmotions", name: "Calm Emotions", rating: "A", base: 3, resist: "mind",
      text: "Calm others' feelings and reduce hostility. Mind resistance to avoid calming down.",
      groups: [TARGETS(), RESIST()] },
    { id: "bolsterEmotions", name: "Bolster Emotions", rating: "B", base: 3,
      text: "Grant advantage on up to two skills of your choice to the targets (the same skills for all).",
      groups: [TARGETS(), SKILL_SELECTION(2)] },
    { id: "healing", name: "Healing", rating: "C", base: 3, healing: true,
      text: "Channel your energy into a person to heal them. Repairs flesh, not metal: no use on Awakened AI.",
      groups: [TARGETS(), group("heal", "Heals Health", [opt("2 Wounds", 2, { heal: 2 }), opt("4 Wounds", 6, { heal: 4 }), opt("6 Wounds", 10, { heal: 6 })])] }
  ],
  geokinesis: [
    { id: "senseMineral", name: "Sense Mineral", rating: "A", base: 4,
      text: "Detect and categorize all the minerals in the area: earth, gems and metals.",
      groups: [RADIUS()] },
    { id: "throwShards", name: "Throw Shards", rating: "B", base: 4, attack: true,
      text: "Turn raw metal into shards and throw them. Kinetic piercing damage.",
      groups: [TARGETS(), DAMAGE(), HEAVY_WEAPON()] },
    { id: "magnetize", name: "Magnetize", rating: "C", base: 6, resist: "fortitude",
      text: "Turn a metal source into a super magnet: it erases magnetic drives and pulls everyone one range band closer each round. Fortitude resistance each round to resist being pulled.",
      groups: [RADIUS(), RESIST(), DURATION()] }
  ],
  hydrokinesis: [
    { id: "createWater", name: "Create or Evaporate Water", rating: "A", base: 5,
      text: "Pull pure, fresh water from the air (a day's supply), or evaporate a supply. A water spirit gets disadvantage on all actions on its next initiative.",
      groups: [RADIUS(), RESIST()] },
    { id: "throwWater", name: "Throw Water", rating: "B", base: 4, attack: true,
      text: "Bolts of water hit the targets. Kinetic blunt damage, always blocked by armor.",
      groups: [TARGETS(), DAMAGE(), HEAVY_WEAPON()] },
    { id: "engulf", name: "Engulf", rating: "C", base: 7, resist: "reflex",
      text: "Encase targets within Close range in water: they drown per the drowning rules. Reflex resistance to fight through to air. No effect on creatures that breathe water or don't breathe.",
      groups: [TARGETS(), RESIST(), DURATION()] }
  ],
  machine: [
    { id: "lockUp", name: "Lock Up", rating: "A", base: 5,
      text: "Freeze a machine's energy for the duration.",
      groups: [TARGETS(), DURATION()] },
    { id: "seeSignals", name: "See Signals", rating: "B", base: 5,
      text: "See every electrical signal (Wi-Fi and the like) and single one out to follow.",
      groups: [RADIUS(), DURATION()] },
    { id: "controlMachine", name: "Control Machine", rating: "C", base: 5,
      text: "Take control of a machine like a hacker or drone jockey. You can view data on a monitor but not download it.",
      groups: [TARGETS(), DURATION()] }
  ],
  mind: [
    { id: "illusion", name: "Illusion", rating: "A", base: 6, resist: "mind",
      text: "Place an image, sound or smell in the targets' minds (within Close range). A Mind resistance success sees through it.",
      groups: [TARGETS(), RESIST(), DURATION()] },
    { id: "wipe", name: "Wipe", rating: "B", base: 9, resist: "mind",
      text: "Delete memories, leaving a foggy sense of missing time. Mind resistance; targets within Very Close range.",
      groups: [TARGETS(), RESIST(), HOW_FAR_BACK()] },
    { id: "modify", name: "Modify", rating: "C", base: 12, resist: "mind",
      text: "Replace a memory with a false one. Mind resistance; targets within Very Close range.",
      groups: [TARGETS(), RESIST(), HOW_FAR_BACK()] }
  ],
  projection: [
    { id: "light", name: "Light", rating: "A", base: 3,
      text: "An orb of light hovers near you: bright light in the radius, dim light one band beyond.",
      groups: [RADIUS(), DURATION()] },
    { id: "projectBlade", name: "Project Blade", rating: "B", base: 5, weapon: true,
      text: "Project energy into a bladed weapon the size of a short sword. Attack with it as a melee weapon using the damage chosen.",
      groups: [DURATION(), DAMAGE(), HEAVY_WEAPON()] },
    { id: "projectPain", name: "Project Pain", rating: "C", base: 7, attack: true, resist: "mind", ignoresArmor: true,
      text: "Project pain into the targets. Resisted with Mind only; ignores all armor.",
      groups: [TARGETS(), RESIST(), DAMAGE(), HEAVY_WEAPON()] }
  ],
  pyrokinesis: [
    { id: "shieldFire", name: "Shield Fire", rating: "A", base: 5,
      text: "An energy shield that stops fire, heat and plasma. Adds to worn armor, only against fire damage.",
      groups: [DURATION(), ARMOR_RATING(), HEAVY_ARMOR()] },
    { id: "throwFire", name: "Throw Fire", rating: "B", base: 4, attack: true,
      text: "Waves of flame hit targets within Close range. Fire damage, blocked by armor.",
      groups: [TARGETS(), DAMAGE(), HEAVY_WEAPON()] },
    { id: "controlFires", name: "Control Fires", rating: "C", base: 5,
      text: "Start a natural fire or snuff out fires in the radius. A fire spirit gets disadvantage on all actions on its next initiative.",
      groups: [RADIUS(), RESIST()] }
  ],
  telekinesis: [
    { id: "throwObject", name: "Throw Object", rating: "A", base: 4, attack: true,
      text: "Hurl nearby objects at the targets. Blocked by armor.",
      groups: [TARGETS(), DAMAGE(), HEAVY_WEAPON()] },
    { id: "shieldKinetic", name: "Shield Kinetic", rating: "B", base: 5,
      text: "An energy shield that stops fast-moving kinetic attacks. Adds to worn armor, only against blunt, piercing and slashing damage.",
      groups: [DURATION(), ARMOR_RATING(), HEAVY_ARMOR()] },
    { id: "flight", name: "Flight", rating: "C", base: 4,
      text: "Telekinetic flight for you or others: slower than a vehicle, but over a chasm or onto a roof.",
      groups: [TARGETS(), DURATION(),
        group("pace", "Pace", [opt("Max of Very Close Range", 3), opt("Max of Close Range", 6), opt("Max of Far Range", 9), opt("Max of Very Far Range", 12)])] }
  ],
  telepathy: [
    { id: "mentalShield", name: "Mental Shield", rating: "A", base: 3,
      text: "Shield a mind from intrusion: advantage on Mind resistance checks.",
      groups: [DURATION(), group("shield", "Resistance", [opt("Advantage on Mind Resistance", 3)])] },
    { id: "reading", name: "Reading", rating: "B", base: 7, resist: "mind",
      text: "Listen to a person's thoughts, even ones they don't realize they're feeling. Mind resistance.",
      groups: [TARGETS(), RESIST(), group("digging", "Digging", [opt("Surface Thoughts", 3), opt("Deep Thoughts", 7)])] },
    { id: "talking", name: "Talking", rating: "C", base: 9,
      text: "A psychic link with the targets that works at any range once established. You must share a language.",
      groups: [TARGETS(), DURATION()] }
  ]
};

/* -------------------------------------------------------------------------- */
/*  Totem aspects (pp. 26–29)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One power per aspect. Options marked with a tier are capped by the totem animal; untiered options are open to all.
 * Aspects affect a single target at Close range, except Attunement and Growth, which affect a location.
 */
export const TOTEM_POWERS = {
  attunement: { name: "Attunement", base: 7, resist: "mind",
    text: "Attune your energy to a site: advantage on all checks made there. If someone else holds the site, they make a Mind resistance check to keep it.",
    groups: [group("radius", "Target Radius", tiered(RADIUS_OPTIONS())), RESIST(), DURATION()] },
  awakening: { name: "Awakening", base: 6,
    text: "Animate rocks, trees and other natural objects to cause a distraction, or harm nearby targets in combat mode.",
    groups: [DURATION(), group("damage", "Damage (If Combat Mode)", tiered(DAMAGE_OPTIONS().slice(0, 4))),
      group("mode", "Combat or Distraction", [opt("Distraction Mode", 0), opt("Combat Mode", 10, { combat: true })])] },
  banishing: { name: "Banishing", base: 6,
    text: "Expel a summoned spirit tied to a domain. The animal sets how big a spirit you can affect.",
    groups: [RESIST(), group("spirit", "Spirit Size", tiered(SPIRIT_OPTIONS()))] },
  bolstering: { name: "Bolstering", base: 7,
    text: "Boost up to four of the target's skills: advantage on checks with them.",
    groups: [DURATION(), group("skills", "Skill Selection", tiered([1, 2, 3, 4].map(k => opt(`${k} Skill${k > 1 ? "s" : ""}`, 3 * k, { skills: k }))))] },
  communion: { name: "Communion", base: 5, resist: "mind",
    text: "Talk with a spirit for guidance. The spirit gets a Mind resistance check not to answer.",
    groups: [RESIST(), DURATION(), group("spirit", "Spirit Size", tiered(SPIRIT_OPTIONS()))] },
  controlling: { name: "Controlling", base: 5,
    text: "Control a summoned spirit, even one someone else summoned.",
    groups: [RESIST(), DURATION(), group("spirit", "Spirit Size", tiered(SPIRIT_OPTIONS()))] },
  creation: { name: "Creation", base: 5,
    text: "Shape raw materials into an object (a stack of lumber into a bridge). Functional but inferior; it can't be sold.",
    groups: [DURATION(), group("size", "Object Size", tiered([opt("Tiny", 1), opt("Small", 2), opt("Medium", 4), opt("Large", 7)]))] },
  destructive: { name: "Destructive", base: 2, attack: true,
    text: "The totem animal's raw destructive power: kinetic damage in the form of a claw or bite.",
    groups: [group("damage", "Damage", tiered(DAMAGE_OPTIONS().slice(0, 4))), HEAVY_WEAPON()] },
  growth: { name: "Growth", base: 4,
    text: "Make the plant life in the area grow larger.",
    groups: [group("radius", "Target Radius", tiered(RADIUS_OPTIONS())), DURATION(),
      group("boost", "Size Boost", [opt("Double in Size", 3), opt("Triple in Size", 6), opt("Quadruple in Size", 10)])] },
  healing: { name: "Healing", base: 3, healing: true,
    text: "Heal the target's wounds. Can't repair mechanical or electrical parts such as cybernetics or armor.",
    groups: [group("heal", "Heals Health", tiered([opt("1 Wound", 2, { heal: 1 }), opt("2 Wounds", 6, { heal: 2 }), opt("3 Wounds", 10, { heal: 3 }), opt("4 Wounds", 15, { heal: 4 })]))] },
  protective: { name: "Protective", base: 4,
    text: "A shield of force energy that stacks over worn armor. The target takes on minor animal features.",
    groups: [DURATION(), group("ar", "Armor Rating", tiered(AR_OPTIONS())), HEAVY_ARMOR()] },
  reduction: { name: "Reduction", base: 7,
    text: "Weaken up to four of the target's skills: disadvantage on checks with them.",
    groups: [RESIST(), DURATION(), group("skills", "Skill Selection", tiered([1, 2, 3, 4].map(k => opt(`${k} Skill${k > 1 ? "s" : ""}`, 3 * k, { skills: k }))))] },
  sight: { name: "Sight", base: 5,
    text: "Otherworldly sight: through darkness, into the astral plane, and in thermal and ultraviolet light.",
    groups: [DURATION(), group("sight", "Sight", tiered([opt("Astral", 2), opt("Darkness", 4), opt("Thermo", 6), opt("Ultraviolet", 10)]))] },
  summoning: { name: "Summoning", base: 6,
    text: "Summon a spirit of the domain you stand in. It won't harm you for 1 minute x PAB, but it doesn't protect your companions and you don't control it.",
    groups: [DURATION(), group("spirit", "Spirit Size", tiered(SPIRIT_OPTIONS()))] },
  transformation: { name: "Transformation", base: 7,
    text: "Turn the target into an animal, prey or hunter, with its characteristics. Allies may willingly fail the resistance check.",
    groups: [RESIST(), DURATION(), group("size", "Animal Size", tiered([opt("Tiny", 1), opt("Small", 2), opt("Medium", 4), opt("Large", 7)]))] }
};

/**
 * Totem animals (pp. 30–32): the highest tier each aspect can reach. Codes run in aspect order:
 * m minor, M moderate, S significant, G grand.
 */
const ASPECT_ORDER = ["attunement", "awakening", "banishing", "bolstering", "communion", "controlling", "creation",
  "destructive", "growth", "healing", "protective", "reduction", "sight", "summoning", "transformation"];
const CODE = { m: "minor", M: "moderate", S: "significant", G: "grand" };
const animal = (name, text, code) => ({
  name, text, limits: Object.fromEntries(code.split(" ").map((c, i) => [ASPECT_ORDER[i], CODE[c]]))
});

export const TOTEM_ANIMALS = {
  bear: animal("Bear", "Bears are healers unless they have a good reason not to, so they don't refuse healing to anyone.", "M m S S m M m M m G M m m m m"),
  beaver: animal("Beaver", "A land and water creature that builds big dams.", "M S m m M M S m G m m m m m M"),
  cat: animal("Cat", "Stealthy, vain, cunning, and sometimes cruel. Solitary types committed to no one but themselves.", "m m M G m S m M m m m m M S M"),
  coyote: animal("Coyote", "The great trickster, unpredictably bold one moment, cowardly the next.", "m m M S M M m m m m m S m M G"),
  dog: animal("Dog", "Loyal to friends and family. He fights furiously to defend his home, but isn't aggressive outside his territory.", "m m m M M M m S m S G m m M m"),
  eagle: animal("Eagle", "The highest-flying bird in the sky, who sees everything that happens beneath it.", "m m S m m S m M m M M m M G m"),
  fox: animal("Fox", "A shrewd hunter of the forests, seeing into all aspects of the life around it.", "S m m S m m m M M M m m G m M"),
  lion: animal("Lion", "A brave and mighty warrior. His methods are direct and pointed, not a creature of subtlety.", "M m M S m S m G m m M m m M m"),
  owl: animal("Owl", "A wise and silent watcher. She rules the night skies, and what she hunts, she finds.", "m m G S m m M S M m m m M M m"),
  raccoon: animal("Raccoon", "The clever bandit can break open any trap to remove the bait and escape any danger.", "m M S m m M G m m m m M m M S"),
  rat: animal("Rat", "A stealthy thief, too selfish to share, and a reluctant warrior who would rather run than fight.", "m m m m m M S m m m M G M M S"),
  raven: animal("Raven", "A trickster too: clever, devious, and a transformer responsible for change.", "M G m m M m S m M m m m M m S"),
  snake: animal("Snake", "A wise healer who knows many secrets. A good counselor, but her advice comes at a price.", "M m M m G M m m m m S m m M S"),
  turtle: animal("Turtle", "Lives on land and in the sea, and tends to stay in an area that isn't spread out.", "G m M m S M m m S m M m m M m"),
  wolf: animal("Wolf", "The hunter and warrior, a brother to all his pack and fiercely loyal to his mate and cubs.", "M m M M m G m S m m S m m M m")
};

/** Spirit domains (p. 32): you can only summon a spirit within its domain. */
export const SPIRIT_DOMAINS = {
  city: ["Streets, plazas, alleys, open areas, and abandoned buildings of a city.", "Homes, residences, occupied buildings.", "Cultivated, worked fields and growing areas."],
  land: ["Open desert.", "Forests, as well as decent-sized parks.", "Rugged mountain terrain.", "Open land and uncultivated fields."],
  sky: ["Open sky.", "Mist, fog, and rain.", "Thunderstorms, hurricanes, tornadoes, and violent storms."],
  water: ["Open lake water.", "Rivers, large streams, river deltas, inlets, and outlets."]
};

/* -------------------------------------------------------------------------- */
/*  Words of Power (pp. 33–37)                                                */
/* -------------------------------------------------------------------------- */

/** Damage options every aspect word offers: picked only when the spell does damage (Destroy, or Force). */
const ASPECT_DAMAGE = () => group("damage", "Damage Die Type", [
  opt("1 Wound", 1, { wounds: 1 }), opt("2 Wounds", 4, { wounds: 2 }), opt("3 Wounds", 7, { wounds: 3 })
], { damageOnly: true });

export const WORDS = {
  // Actions
  armor: { type: "action", name: "Armor", incantation: "Magithril",
    text: "An exterior shield that protects the target like armor against the aspect's damage type. Armor-piercing rounds penetrate it. Adds to worn armor.",
    groups: [DURATION(), ARMOR_RATING(), HEAVY_ARMOR()] },
  banish: { type: "action", name: "Banish", incantation: "Expellere",
    text: "Send a summoned creature not native to this place back to its origin.",
    groups: [group("spirit", "Spirit Size", SPIRIT_OPTIONS()), RESIST()] },
  control: { type: "action", name: "Control", incantation: "Dominari",
    text: "Dictate what the target does on its following turns.",
    groups: [DURATION(), RESIST()] },
  create: { type: "action", name: "Create", incantation: "Creare",
    text: "Bring a facsimile of an object or creature into existence. You don't control it; it behaves as its kind would.",
    groups: [DURATION(),
      group("size", "Object Size", [opt("Tiny", 1), opt("Small", 3), opt("Medium", 4), opt("Large", 7)]),
      group("life", "Semblance of Life", [opt("Stays inanimate", 0), opt("Semblance of Life and Movement", 10)])] },
  destroy: { type: "action", name: "Destroy", incantation: "Oblitus", damage: true,
    text: "Bring the aspect's destructive power to bear: damage to the target.",
    groups: [group("increment", "Damage Dice", [opt("Success based on Odd", 1, { increment: "odd" }),
      opt("Success based on Even", 4, { increment: "even" }), opt("Success based on Every", 7, { increment: "every" })]),
    HEAVY_WEAPON()] },
  entangle: { type: "action", name: "Entangle", incantation: "Vincire",
    text: "Trap and wrap up the target, restricting movement. A Reflex resistance check every round to escape.",
    groups: [DURATION(), group("size", "Creature Size", SPIRIT_OPTIONS())] },
  repair: { type: "action", name: "Repair", incantation: "Reficere",
    text: "Mend an object's damage. Destroyed objects (0 usage) can't be repaired.",
    groups: [group("size", "Object Size", [opt("Tiny", 1), opt("Small", 3), opt("Medium", 4), opt("Large", 7)]),
      group("restore", "Repair Material", [1, 2, 3, 4].map(n => opt(`Restore ${n} usage di${n > 1 ? "ce" : "e"} or ${n} Wound${n > 1 ? "s" : ""} to a robot`, 3 * n, { restore: n })))] },
  shield: { type: "action", name: "Shield", incantation: "Scutum",
    text: "Protection drawn from the aspect: advantage on all resistance checks.",
    groups: [DURATION(), group("shield", "Resistance", [opt("Advantage on All Resistance", 6)])] },
  summon: { type: "action", name: "Summon", incantation: "Vocare",
    text: "Bring a creature or object here. A creature obeys only for the duration, then acts of its own free will.",
    groups: [DURATION(), group("spirit", "Spirit Size", SPIRIT_OPTIONS()),
      group("after", "Condition after Duration", [opt("Disappears", 1), opt("Stays", 5)])] },
  transform: { type: "action", name: "Transform", incantation: "Mutare",
    text: "Reshape the target into something new based on the aspect.",
    groups: [DURATION(), group("size", "Creature Size", SPIRIT_OPTIONS()),
      group("mind", "Mental Faculties", [opt("Loses mental faculties", 0), opt("Keeps mental faculties", 5)])] },

  // Aspects
  air: { type: "aspect", name: "Air", incantation: "Aeris", damageType: "Electrical",
    text: "Electricity arcing through the sky. Entities of air are elemental air or electricity.",
    groups: [ASPECT_DAMAGE()] },
  animal: { type: "aspect", name: "Animal", incantation: "Bestia", damageType: "Slash",
    text: "An animal comes to the caster's aid. Banish and Control need the animal present; Create makes a facsimile; Summon brings one into the area.",
    groups: [ASPECT_DAMAGE(), group("animal", "Animal Type", [opt("Random Animal from Area", 2), opt("Spectral Animal of Choice", 4)])] },
  dark: { type: "aspect", name: "Dark", incantation: "Tenebris", damageType: "Cold",
    text: "Darkens the area, blinding or hard to see. Can deal cold damage.",
    groups: [ASPECT_DAMAGE(), group("bubble", "Darkness Bubble", [...RADIUS_OPTIONS(), opt("Blinds instead of radius", 3)])] },
  earth: { type: "aspect", name: "Earth", incantation: "Terris", damageType: "Blunt",
    text: "Solid strength: the target feels the crushing weight of earth. Entities are earth elementals.",
    groups: [ASPECT_DAMAGE()] },
  fire: { type: "aspect", name: "Fire", incantation: "Ignis", damageType: "Fire",
    text: "Burning power. Banish, Create, Summon and Control deal with fire elementals.",
    groups: [ASPECT_DAMAGE()] },
  force: { type: "aspect", name: "Force", incantation: "Vim", damageType: "Blunt", alwaysDamages: true,
    text: "A raw power of the universe: it deals damage as it is used, even with Repair or Shield.",
    groups: [ASPECT_DAMAGE()] },
  light: { type: "aspect", name: "Light", incantation: "Luxis", damageType: "Fire",
    text: "Brightens the area so one can see. Can deal heat damage.",
    groups: [ASPECT_DAMAGE(), group("bubble", "Light Bubble", RADIUS_OPTIONS())] },
  plant: { type: "aspect", name: "Plant", incantation: "Viridis", damageType: "Blunt",
    text: "A plant comes to the caster's aid. Banish and Control need the plant present; Create makes a facsimile.",
    groups: [ASPECT_DAMAGE(), group("plant", "Plant Type", [opt("Random Plant from Area", 2), opt("Spectral Plant of Choice", 4)])] },
  spirit: { type: "aspect", name: "Spirit", incantation: "Anima", damageType: "Cold",
    text: "The force of the soul, usually involving the undead. Repair, Shield and Destroy come with an undead curse.",
    groups: [ASPECT_DAMAGE()] },
  water: { type: "aspect", name: "Water", incantation: "Aquis", damageType: "Cold",
    text: "Cold waters: the target is chilled to the bone, even by Repair or Shield.",
    groups: [ASPECT_DAMAGE()] },

  // Targets
  it: { type: "target", name: "It", incantation: "Idem", text: "Only objects: not people or locations.",
    groups: [group("target", "Target", [opt("1 Object", 2, { targets: 1 })])] },
  me: { type: "target", name: "Me", incantation: "Ego", text: "Only yourself.",
    groups: [group("target", "Target", [opt("Self", 1, { self: true })])] },
  them: { type: "target", name: "Them", incantation: "Ferris", text: "The creatures in a radius (not objects or the location). Worn armor still takes damage.",
    groups: [RADIUS()] },
  there: { type: "target", name: "There", incantation: "Ibi", text: "A location: the area in the radius, not the creatures standing in it.",
    groups: [RADIUS()] },
  us: { type: "target", name: "Us", incantation: "Elynd", text: "Yourself and every creature in the radius around you.",
    groups: [RADIUS()] },
  you: { type: "target", name: "You", incantation: "Tibi", text: "A single creature. Worn armor still takes damage.",
    groups: [group("target", "Target", [opt("1 Creature", 1, { targets: 1 })])] }
};

export const WORD_TYPES = ["action", "aspect", "target"];
