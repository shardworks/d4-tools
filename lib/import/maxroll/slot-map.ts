/**
 * Maxroll slot → our canonical slot id translation table (D27).
 *
 * Maxroll's planner uses its own slot key strings; this map translates them
 * to the catalog slot ids in lib/catalog/slots.json.
 *
 * This is importer-private, not catalog data — mirrors lib/triage/anthropic.ts
 * keeping its prompt vocabulary local.
 *
 * Maxroll slot keys sourced from observed `data.min.json` ItemSlot enum and
 * planner payload `equipped` object keys.
 */

/** Map from Maxroll slot string → our catalog slot id. */
export const MAXROLL_SLOT_MAP: Readonly<Record<string, string>> = {
  // Head
  helm: "helm",
  Helm: "helm",
  // Chest
  chest: "chest",
  Chest: "chest",
  // Gloves
  gloves: "gloves",
  Gloves: "gloves",
  // Pants
  pants: "pants",
  Pants: "pants",
  // Boots
  boots: "boots",
  Boots: "boots",
  // Amulet
  amulet: "amulet",
  Amulet: "amulet",
  // Rings
  ring1: "ring1",
  Ring1: "ring1",
  ring2: "ring2",
  Ring2: "ring2",
  // Weapons (Maxroll uses numeric suffixes for dual/two-handed)
  weapon1: "weapon1",
  Weapon1: "weapon1",
  weapon2: "weapon2",
  Weapon2: "weapon2",
  // Offhand
  offhand: "offhand",
  Offhand: "offhand",
  // Some planners use these forms
  "main-hand": "weapon1",
  "off-hand": "weapon2",
  mainhand: "weapon1",
  offhand1: "offhand",
};

/**
 * Translate a Maxroll slot string to our catalog slot id.
 * Returns undefined if no mapping is found (caller should skip the item or use slot as-is).
 */
export function mapMaxrollSlot(maxrollSlot: string): string | undefined {
  return MAXROLL_SLOT_MAP[maxrollSlot] ?? undefined;
}
