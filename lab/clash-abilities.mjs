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

/** Six ribbon icons = play styles / ability marks (always this order). */
export const PLAY_STYLES = ["melee", "ranged", "splash", "flying", "tank", "charge"];

export const KEYWORDS = {
  melee: "Closes and cuts.",
  ranged: "Picks from the backline.",
  splash: "Hits the cluster.",
  flying: "Over the wall.",
  charge: "First contact is a slam.",
  tank: "Eats the tower shots.",
  swarm: "Cheap bodies. Keep sending.",
  building: "Planted. Ticks. Spawns.",
  spawn: "Drops a troop on a clock.",
  death: "Dies loud.",
  spell: "Casts the packed clip.",
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

function markPlayStyles(id, role, clips, hasProj, hasCast, hasExplode) {
  const on = new Set();
  if (hasProj || /ranged|archer|slinger|bow|cannon|gun|mage|wizard|staff|orb|shot|sniper|crossbow/.test(id)) {
    on.add("ranged");
  } else if (role !== "structure" && !clips.includes("open")) {
    on.add("melee");
  }
  if (hasCast && !role.startsWith("general")) on.add("ranged");
  if (
    /fly|wing|drake|wyrm|phoenix|owl|hawk|raven|bat|moth|aether|spirit|wraith|ghost|vespyr|wind|sky|griffin|gryphon/.test(id)
    || role === "critter"
  ) on.add("flying");
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
    if (/fly|celerit|wing/.test(id) || role === "critter") {
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

  return {
    kind,
    keywords: uniq,
    playStyles: styles,
    text: passive,
    passive,
    cost,
    attack,
    health,
    range,
    speed,
    effect,
    vfx,
  };
}
