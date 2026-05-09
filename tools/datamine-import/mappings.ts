/**
 * Mapping constants for datamine → catalog translation.
 */

/** Maps datamine uppercase slot keys → catalog lowercase slot IDs */
export const SLOT_MAP: Record<string, string> = {
  HELM: "helm",
  CHEST: "chest",
  GLOVES: "gloves",
  PANTS: "pants",
  BOOTS: "boots",
  AMULET: "amulet",
  RING: "ring1",
  OFFHAND: "offHand",
  WEAPON: "weapon",
};

/**
 * Barbarian weapon fan-out (D16): any weapon-restricted affix gets all four
 * barb-slot ids appended instead of (or in addition to) the generic weapon slot.
 */
export const BARB_WEAPON_SLOTS: string[] = [
  "barb_1h_main",
  "barb_1h_off",
  "barb_2h_bludgeoning",
  "barb_2h_slashing",
];

/** Maps datamine uppercase class identifiers → catalog TitleCase class names */
export const CLASS_MAP: Record<string, string> = {
  CLASS_BARBARIAN: "Barbarian",
  CLASS_DRUID: "Druid",
  CLASS_NECROMANCER: "Necromancer",
  CLASS_ROGUE: "Rogue",
  CLASS_SORCERER: "Sorcerer",
  CLASS_SPIRITBORN: "Spiritborn",
  CLASS_CRUSADER: "Paladin",
  CLASS_WARLOCK: "Warlock",
};

/**
 * Index 0-7 of fUsableByClass bitmap → class name.
 * Used to decode glyph class usability flags.
 */
export const GLYPH_CLASS_ORDER: string[] = [
  "Sorcerer",
  "Druid",
  "Barbarian",
  "Necromancer",
  "Rogue",
  "Spiritborn",
  "Paladin",
  "Warlock",
];
