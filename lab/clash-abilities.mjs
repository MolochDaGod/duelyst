/**
 * Clash-like battle cards + castle commander.
 * Not Nexus Nemesis. Not a second bag.
 *
 * Commander = player's NFT / cNFT (THC GROWERZ, THC Labz, Grudge Studio)
 * sits on the castle and grants passives / an active from traits.
 * Duelyst generals are troop cards, not the commander.
 *
 * COST / ATK / HP / RANGE / SPEED here are Clash stand-ins until
 * Open Duelyst card JSON is joined. Do not mint these as Railway truth.
 */
export const COMMANDER = {
  slot: "castle",
  sources: ["THC GROWERZ NFT", "THC Labz cNFT", "Grudge Studio cNFT"],
  role: "Placed on the castle. Passives and one active from the NFT. Not a deck card.",
};

/**
 * Six ribbon icons = Clash of Clans troop abilities (always this order).
 * Keys stay melee/ranged/splash/flying/tank/charge so chrome slots stay wired.
 */
export const PLAY_STYLES = ["melee", "ranged", "splash", "flying", "tank", "charge"];
export const ABILITIES = PLAY_STYLES;

export const ABILITY_DEFS = {
  melee: { label: "Melee", short: "MEL", text: "Melee DPS. Hits the nearest keep." },
  ranged: { label: "Range", short: "RNG", text: "Shoots from the back, like Archers." },
  splash: { label: "Splash", short: "SPL", text: "Area hit, like Wizards." },
  flying: { label: "Air", short: "AIR", text: "Air troop. Ignores walls." },
  tank: { label: "Tank", short: "TNK", text: "Prefers defenses. Soaks the keep." },
  charge: { label: "Rush", short: "RSH", text: "Rushes and jumps walls, like Hog Rider." },
};

export const KEYWORDS = {
  melee: ABILITY_DEFS.melee.text,
  ranged: ABILITY_DEFS.ranged.text,
  splash: ABILITY_DEFS.splash.text,
  flying: ABILITY_DEFS.flying.text,
  charge: ABILITY_DEFS.charge.text,
  tank: ABILITY_DEFS.tank.text,
  swarm: "Cheap housing. Keep sending.",
  building: "Siege building. Ticks on a clock.",
  spawn: "Spawns a troop, like a Witch.",
  death: "Death bomb, like a Balloon.",
  spell: "Casts an active, like a hero ability.",
};

const EFFECT = {
  slash: "Slash",
  bolt: "Bolt",
  burst: "Burst",
  cast: "Cast",
  hatch: "Hatch",
  spawn: "Spawn",
  slam: "Slam",
};

function clipsOf(u) {
  return (u.clips || u.anims || []).map((c) => String(c).toLowerCase());
}

/** Packed-sheet flyers (wings / hover). Not windblade, not mandrake, not all *support. */
function isAirId(id) {
  const s = String(id || "").toLowerCase();
  if (s === "f1_support" || s === "f1_sunstonemaiden") return true;
  if (/mandrake|windblade|sandhowler|shadowlord/.test(s)) return false;
  const parts = s.split(/[_-]+/);
  if (parts.some((p) => /^(fly|flying|wing|wings|drake|drakes|wyrm|phoenix|owl|hawk|raven|bat|moth|aether|vespyr|griffin|gryphon|gryph|seraph|wisp|harpy|sky)$/.test(p))) return true;
  if (parts.some((p) => /(?:wing|wyrm|drake|gryph|seraph|wisp|hawk|owl|aether|vespyr|phoenix|harpy|raven)/.test(p))) return true;
  return /pandoraminionfly|f1_support|f1_sunstonemaiden/.test(s);
}

function markPlayStyles(id, role, clips, hasProj, hasCast, hasExplode) {
  const on = new Set();
  if (hasProj || /ranged|archer|slinger|bow|cannon|gun|mage|wizard|staff|orb|shot|sniper|crossbow/.test(id)) {
    on.add("ranged");
  } else if (role !== "structure" && !clips.includes("open")) {
    on.add("melee");
  }
  if (hasCast && !role.startsWith("general")) on.add("ranged");
  if (isAirId(id) || role === "critter") on.add("flying");
  if (
    /rush|charge|celerity|dash|wolf|hound|lion|knight|raider|berserk|assassin|rogue|stalker|pounce|leap|swift|hunter|predator/.test(id)
    || role === "mercenary"
    || role === "token-minion"
  ) on.add("charge");
  if (
    /frenzy|splash|nova|blast|bomb|grenade|storm|quake|meteor|flame|magma|lava|explod|pulse|wave|fire|frost|ice|poison/.test(id)
    || hasExplode
  ) on.add("splash");
  if (
    /provoke|guard|ironcliffe|golem|tank|titan|wall|fort|shield|sentinel|monument|coloss|obelysk/.test(id)
    || role === "golem"
    || role === "structure"
    || role.startsWith("general")
    || role === "boss"
    || role === "boss-part"
  ) on.add("tank");
  if (role.startsWith("general") && !on.has("ranged")) on.add("melee");
  return on;
}

export function clashAbility(u) {
  const id = String(u.id || "").toLowerCase();
  const role = String(u.role || "minion");
  const clips = clipsOf(u);
  const kits = u.kits || [];
  const hasProj = !!(u.hasProjectile || clips.includes("projectile") || kits.includes("projectile"));
  const hasCast = !!(u.hasCast || clips.some((c) => c.startsWith("cast")) || kits.includes("caster"));
  const hasExplode = clips.includes("explode") || /explod/.test(id);
  const hasOpen = clips.includes("open") || /egg/.test(id);
  const hasCrawl = clips.includes("crawl");
  const keys = [];
  let kind = "troop";
  let cost = 3;
  let attack = 4;
  let health = 5;
  let range = "Melee";
  let speed = "Medium";
  let effect = EFFECT.slash;
  let passive = KEYWORDS.melee;

  if (role.startsWith("general")) {
    kind = "troop";
    keys.push("melee", "tank");
    if (hasCast) keys.push("spell");
    cost = 5;
    attack = 3;
    health = 14;
    range = "Melee";
    speed = /alt|3rd|tier2/.test(id) ? "Fast" : "Medium";
    effect = hasCast ? EFFECT.cast : EFFECT.slash;
    passive = hasCast ? "Lane general. Tank front. Packed cast." : "Lane general. Tank front.";
  } else if (role === "structure") {
    kind = "building";
    keys.push("building", "spawn");
    cost = 4;
    attack = 0;
    health = 11;
    range = "—";
    speed = "—";
    effect = EFFECT.spawn;
    passive = KEYWORDS.building;
  } else if (hasOpen || role === "token-minion" || id.includes("buildminion") || id.includes("pandora")) {
    kind = "troop";
    keys.push("swarm");
    if (hasOpen) keys.push("spawn");
    cost = hasOpen ? 2 : 1;
    attack = hasOpen ? 0 : 2;
    health = hasOpen ? 4 : 2;
    range = hasOpen ? "—" : "Melee";
    speed = hasOpen ? "Slow" : "Fast";
    effect = hasOpen ? EFFECT.hatch : EFFECT.slash;
    passive = hasOpen ? "Opens into a troop." : KEYWORDS.swarm;
  } else if (role === "boss" || role === "boss-part") {
    kind = "troop";
    keys.push("tank", "melee");
    if (hasExplode) keys.push("death", "splash");
    cost = 8;
    attack = 6;
    health = 22;
    range = "Melee";
    speed = "Slow";
    effect = hasExplode ? EFFECT.burst : EFFECT.slash;
    passive = hasExplode ? "Named horror. Dies loud." : "Named horror. Eats the tower.";
  } else {
    if (hasProj || /ranged|archer|slinger|grenadier|bow/.test(id)) {
      keys.push("ranged");
      cost = 3;
      attack = 4;
      health = 3;
      range = 5.5;
      speed = "Medium";
      effect = EFFECT.bolt;
      passive = KEYWORDS.ranged;
    } else {
      keys.push("melee");
    }
    if (isAirId(id) || role === "critter") {
      keys.push("flying");
      cost = Math.max(cost, 4);
      attack = Math.max(attack, 3);
      health = 4;
      range = hasProj ? 4 : 3;
      speed = "Fast";
      effect = hasProj ? EFFECT.bolt : EFFECT.slash;
      passive = KEYWORDS.flying;
    }
    if (/rush|charge/.test(id)) {
      keys.push("charge");
      attack = Math.max(attack, 5);
      health = Math.max(health, 4);
      speed = "Very Fast";
      effect = EFFECT.slam;
      passive = KEYWORDS.charge;
    }
    if (/frenzy|splash|nova/.test(id) || hasExplode) {
      keys.push("splash");
      if (hasExplode) keys.push("death");
      effect = EFFECT.burst;
      passive = hasExplode ? KEYWORDS.death : KEYWORDS.splash;
    }
    if (/provoke|guard|ironcliffe/.test(id) || role === "golem") {
      keys.push("tank");
      cost = 6;
      attack = 3;
      health = 13;
      speed = "Slow";
      passive = KEYWORDS.tank;
    }
    if (hasCast) {
      keys.push("spell");
      cost = Math.max(cost, 4);
      attack = Math.min(attack, 3);
      health = Math.max(health, 5);
      range = hasProj ? range : 5;
      speed = speed === "Very Fast" ? "Fast" : "Medium";
      effect = EFFECT.cast;
      passive = KEYWORDS.spell;
    }
    if (hasCrawl) {
      speed = "Slow";
      health = Math.max(health, 6);
      passive = "Low and mean.";
    }
    if (role === "mercenary") {
      cost = 3;
      attack = 4;
      health = 4;
      speed = "Fast";
      passive = "Hired steel. No faction oath.";
    }
  }

  const uniq = [...new Set(keys)];
  if (!uniq.length) uniq.push("melee");
  const styleSet = markPlayStyles(id, role, clips, hasProj, hasCast, hasExplode);
  for (const k of uniq) {
    if (PLAY_STYLES.includes(k)) styleSet.add(k);
  }
  const styles = PLAY_STYLES.map((k) => ({ key: k, on: styleSet.has(k) }));
  const vfx = {
    slash: uniq.includes("ranged") ? "energyProjectile" : "slashRedLg",
    burst: uniq.includes("death") || uniq.includes("splash") ? "arcaneslash" : "critSlash",
    projectile: uniq.includes("ranged") ? "firebolt" : null,
  };
  if (uniq.includes("flying")) vfx.slash = "slashBlueLg";
  if (uniq.includes("spell")) vfx.burst = "arcaneslash";

  const abilityNames = PLAY_STYLES.filter((k) => styleSet.has(k)).map((k) => ABILITY_DEFS[k].label);
  const specials = [];
  if (styleSet.has("tank")) specials.push("Prefers defenses.");
  if (styleSet.has("charge")) specials.push("Jumps walls.");
  if (styleSet.has("flying")) specials.push("Air troop.");
  if (styleSet.has("splash")) specials.push("Splash damage.");
  if (styleSet.has("ranged") && !styleSet.has("splash")) specials.push("Ranged DPS.");
  if (uniq.includes("death") || hasExplode) specials.push("Death bomb.");
  if (uniq.includes("spawn") || uniq.includes("building") || hasOpen) specials.push("Spawns a troop.");
  if (uniq.includes("spell") || hasCast) specials.push("Casts an active.");
  if (!specials.length && styleSet.has("melee")) specials.push("Melee DPS.");
  const cocPassive = specials.slice(0, 3).join(" ");

  return {
    kind,
    keywords: uniq,
    playStyles: styles,
    abilities: styles,
    abilityNames,
    preferredTarget: styleSet.has("tank") ? "Defenses" : "Any",
    text: cocPassive,
    passive: cocPassive,
    cost,
    attack,
    health,
    range,
    speed,
    effect,
    vfx,
  };
}
