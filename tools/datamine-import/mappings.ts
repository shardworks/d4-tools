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

/**
 * Index 0-7 of fAllowedForPlayerClass / fUsableByClass array → class name.
 * Used to decode affix and item class restriction bit arrays.
 * Same order as GLYPH_CLASS_ORDER — aliased here for semantic clarity.
 */
export const AFFIX_CLASS_ORDER: string[] = [
  "Sorcerer",
  "Druid",
  "Barbarian",
  "Necromancer",
  "Rogue",
  "Spiritborn",
  "Paladin",
  "Warlock",
];

/**
 * Maps integer arAllowedItemLabels values → catalog slot ID arrays.
 *
 * Primary labels (unique per slot):
 *   Helm=16, ChestArmor=17, Gloves=28, Legs/Pants=30, Boots=29
 *   Ring=19, Amulet=26
 *   Axe=1, Sword=2, Mace=3, Dagger=6, Polearm=7
 *   Staff=13, Bow=10, Crossbow2H=11, Scythe=46, OffHandTotem=47, Focus=31, Shield=15
 *
 * Category labels (broad groupings):
 *   0=any weapon, 8=1H melee, 9=2H weapon, 14=armor, 18=jewelry, 23=offhand, 54=any gear
 */
export const LABEL_TO_SLOTS: Record<number, string[]> = {
  // Armor slots
  16: ["helm"],
  17: ["chest"],
  28: ["gloves"],
  30: ["pants"],
  29: ["boots"],
  // Jewelry
  19: ["ring1", "ring2"],
  26: ["amulet"],
  // Weapon types
  1: ["weapon", "barb_1h_main", "barb_1h_off", "barb_2h_slashing"],   // axe
  2: ["weapon", "barb_1h_main", "barb_1h_off", "barb_2h_slashing"],   // sword
  3: ["weapon", "barb_1h_main", "barb_1h_off", "barb_2h_bludgeoning"], // mace
  6: ["weapon", "barb_1h_main", "barb_1h_off"],                         // dagger
  7: ["weapon", "barb_2h_slashing"],                                    // polearm
  10: ["weapon"],                                                        // bow
  11: ["weapon"],                                                        // crossbow2H
  13: ["weapon"],                                                        // staff
  15: ["offHand"],                                                       // shield
  31: ["offHand"],                                                       // focus
  46: ["weapon"],                                                        // scythe
  47: ["offHand"],                                                       // offhand totem
  // Category labels
  0: ["weapon", "barb_1h_main", "barb_1h_off", "barb_2h_bludgeoning", "barb_2h_slashing"], // any weapon
  8: ["weapon", "barb_1h_main", "barb_1h_off"],                         // 1H melee
  9: ["weapon", "barb_2h_bludgeoning", "barb_2h_slashing"],             // 2H weapon
  14: ["helm", "chest", "gloves", "pants", "boots"],                    // armor
  18: ["ring1", "ring2", "amulet"],                                      // jewelry
  23: ["offHand"],                                                       // offhand
  54: [],                                                                // any gear — too broad, omit slots
};
