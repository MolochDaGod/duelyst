/**
 * DopeBudz city PVE roster — Season 1 55 + 17 Growerz goons.
 * 12 cities × 5 goons + 1 boss. Not Duelyst. Not Nemesis. Not a bag.
 */
import fs from "node:fs";

const PVE_PATH =
  "D:/Games/Models/THC_CARD_PACKS_OPTIONS/Cnftspriteasset/battle-cnft/production/city-pve.json";

export function flattenCityPve(pvePath = PVE_PATH) {
  if (!fs.existsSync(pvePath)) return [];
  const pve = JSON.parse(fs.readFileSync(pvePath, "utf8"));
  const out = [];
  for (const city of pve.citiesRoster || []) {
    const push = (row, pveRole) => {
      const cls = String(row.class || "melee");
      const abilities = row.abilities || [];
      out.push({
        ...row,
        city: city.city,
        pveRole,
        faction: city.city,
        kind: row.type === "building" || row.type === "tower" ? "building" : "troop",
        playStyles: [
          { key: "melee", on: cls === "melee" },
          { key: "ranged", on: cls === "ranged" || cls === "magical" },
          { key: "splash", on: cls === "magical" },
          { key: "flying", on: false },
          { key: "tank", on: cls === "tank" || pveRole === "boss" },
          { key: "charge", on: cls === "melee" && pveRole === "goon" },
        ],
        abilityNames: abilities.slice(0, 4),
        keywords: abilities,
        range: cls === "ranged" || cls === "magical" ? 5 : "Melee",
        speed: pveRole === "boss" ? "Slow" : "Medium",
        effect: cls === "magical" ? "Burst" : cls === "ranged" ? "Bolt" : "Slash",
        passive: abilities.join(". ") || (row.abilityDesc || ""),
        image: row.image,
        mintImage: "https://assets.grudge-studio.com/sprites/thc-pve/" + String(row.image || "").split("/").pop(),
      });
    };
    if (city.boss) push(city.boss, "boss");
    for (const g of city.goons || []) push(g, "goon");
  }
  return out;
}
