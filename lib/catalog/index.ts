/**
 * Catalog loader for the hand-curated D4 data catalog.
 *
 * All data is imported as JSON (resolveJsonModule) — no runtime fs access.
 * Every catalog file carries a `verifiedAgainst` stamp following the
 * docs/data-sources/ convention (expansion, season, patch, accessedDate).
 */

import classesCatalog from "./classes.json";
import slotsCatalog from "./slots.json";
import affixesCatalog from "./affixes.json";
import aspectsCatalog from "./aspects.json";
import gameMath from "./game-math.json";

// Per-class skill catalogs
import barbSkills from "./skills/Barbarian.json";
import druidSkills from "./skills/Druid.json";
import necroSkills from "./skills/Necromancer.json";
import paladinSkills from "./skills/Paladin.json";
import rogueSkills from "./skills/Rogue.json";
import sorcSkills from "./skills/Sorcerer.json";
import sbSkills from "./skills/Spiritborn.json";
import warlockSkills from "./skills/Warlock.json";

// Per-class paragon catalogs
import barbParagon from "./paragon/Barbarian.json";
import druidParagon from "./paragon/Druid.json";
import necroParagon from "./paragon/Necromancer.json";
import paladinParagon from "./paragon/Paladin.json";
import rogueParagon from "./paragon/Rogue.json";
import sorcParagon from "./paragon/Sorcerer.json";
import sbParagon from "./paragon/Spiritborn.json";
import warlockParagon from "./paragon/Warlock.json";

// ─── Type aliases for catalog shapes ───────────────────────────────────────

export interface VerifiedAgainst {
  expansion: string;
  season: string;
  patch: string;
  accessedDate: string;
}

export interface ClassEntry {
  id: string;
  label: string;
  primaryStat: string;
  supported: boolean;
  unsupportedReason?: string;
  /** Blizzard API class identifier string (e.g. "sorcerer", "barbarian") — D26/D28 */
  bnetClassName?: string;
  /** Blizzard API numeric class sno ID — D26/D28 */
  bnetClassId?: number;
  /** Named class resources (e.g. ["Fury"] for Barbarian, ["Wrath", "Dominance"] for Warlock) */
  resources?: string[];
}

export interface SlotEntry {
  id: string;
  label: string;
  cluster: "armor" | "jewelry" | "weapon";
  classSpecific?: string[];
  excludedClasses?: string[];
  /** Blizzard API slot key (e.g. "head", "torso") — D28 */
  bnetSlotKey?: string;
}

export interface AffixEntry {
  id: string;
  label: string;
  labelTemplate: string;
  /** [min, max] roll range for this affix */
  valueRange: number[];
  isPercent: boolean;
  slotRestrictions: string[];
  classRestrictions: string[];
  /** Blizzard API numeric sno ID for this affix — D28 */
  bnetId?: number;
  /** Blizzard API fileName string for this affix — D28 */
  bnetFileName?: string;
}

export interface AspectEntry {
  id: string;
  label: string;
  labelTemplate: string;
  /** [min, max] roll range for this aspect */
  valueRange: number[];
  isPercent: boolean;
  slotRestrictions: string[];
  classRestrictions: string[];
  source: "legendary" | "codex";
  /** Blizzard API numeric sno ID for this aspect — D28 */
  bnetId?: number;
  /** Blizzard API fileName string for this aspect — D28 */
  bnetFileName?: string;
}

export interface SkillEntry {
  id: string;
  label: string;
  category: string;
  maxRank: number;
  /** Blizzard API numeric sno ID for this skill — D28 */
  bnetId?: number;
  /** Blizzard API fileName string for this skill — D28 */
  bnetFileName?: string;
}

export interface ParagonBoardEntry {
  id: string;
  label: string;
  isStarterBoard?: boolean;
  /** Blizzard API numeric sno ID for this board — D28 */
  bnetId?: number;
  /** Blizzard API fileName string for this board — D28 */
  bnetFileName?: string;
}

export interface ParagonGlyphEntry {
  id: string;
  label: string;
  /** Blizzard API numeric sno ID for this glyph — D28 */
  bnetId?: number;
  /** Blizzard API fileName string for this glyph — D28 */
  bnetFileName?: string;
}

// ─── Exported catalog data ─────────────────────────────────────────────────

/** The verifiedAgainst stamp from the classes catalog (representative for all catalogs). */
export const verifiedAgainst: VerifiedAgainst = classesCatalog.verifiedAgainst;

/** All classes (including unsupported Paladin/Warlock). */
export const classes: ClassEntry[] = classesCatalog.classes as ClassEntry[];

/** Supported classes only. */
export const supportedClasses: ClassEntry[] = classes.filter((c) => c.supported);

/** All gear slots. */
export const slots: SlotEntry[] = slotsCatalog.slots as SlotEntry[];

/** All affixes (normalized picker-friendly shape). */
export const affixes: AffixEntry[] = affixesCatalog.affixes as unknown as AffixEntry[];

/** All aspects. */
export const aspects: AspectEntry[] = aspectsCatalog.aspects as unknown as AspectEntry[];

/** Game-math constants (skill points, paragon points, item power thresholds). */
export const gameMathConstants = gameMath;

// ─── Skill catalog helpers ─────────────────────────────────────────────────

const skillCatalogByClass: Record<string, SkillEntry[]> = {
  Barbarian: barbSkills.skills as SkillEntry[],
  Druid: druidSkills.skills as SkillEntry[],
  Necromancer: necroSkills.skills as SkillEntry[],
  Paladin: paladinSkills.skills as SkillEntry[],
  Rogue: rogueSkills.skills as SkillEntry[],
  Sorcerer: sorcSkills.skills as SkillEntry[],
  Spiritborn: sbSkills.skills as SkillEntry[],
  Warlock: warlockSkills.skills as SkillEntry[],
};

export function getSkillsForClass(className: string): SkillEntry[] {
  return skillCatalogByClass[className] ?? [];
}

// ─── Paragon catalog helpers ───────────────────────────────────────────────

const paragonCatalogByClass: Record<
  string,
  { boards: ParagonBoardEntry[]; glyphs: ParagonGlyphEntry[] }
> = {
  Barbarian: barbParagon as { boards: ParagonBoardEntry[]; glyphs: ParagonGlyphEntry[] },
  Druid: druidParagon as { boards: ParagonBoardEntry[]; glyphs: ParagonGlyphEntry[] },
  Necromancer: necroParagon as { boards: ParagonBoardEntry[]; glyphs: ParagonGlyphEntry[] },
  Paladin: paladinParagon as { boards: ParagonBoardEntry[]; glyphs: ParagonGlyphEntry[] },
  Rogue: rogueParagon as { boards: ParagonBoardEntry[]; glyphs: ParagonGlyphEntry[] },
  Sorcerer: sorcParagon as { boards: ParagonBoardEntry[]; glyphs: ParagonGlyphEntry[] },
  Spiritborn: sbParagon as { boards: ParagonBoardEntry[]; glyphs: ParagonGlyphEntry[] },
  Warlock: warlockParagon as { boards: ParagonBoardEntry[]; glyphs: ParagonGlyphEntry[] },
};

export function getParagonCatalogForClass(className: string): {
  boards: ParagonBoardEntry[];
  glyphs: ParagonGlyphEntry[];
} {
  return paragonCatalogByClass[className] ?? { boards: [], glyphs: [] };
}

// ─── Slot helpers ──────────────────────────────────────────────────────────

/**
 * Returns the slots that should appear for a given class.
 * Barbarians get their 4 weapon slots; all other classes get weapon+offHand.
 */
export function getSlotsForClass(className: string): SlotEntry[] {
  return slots.filter((slot) => {
    if (slot.excludedClasses?.includes(className)) return false;
    if (slot.classSpecific && !slot.classSpecific.includes(className)) return false;
    return true;
  });
}

// ─── Affix helpers ─────────────────────────────────────────────────────────

/**
 * Returns affixes available for a given slot and class.
 * If slotRestrictions is empty, the affix is available on all slots.
 * If classRestrictions is empty, the affix is available to all classes.
 */
export function getAffixesForSlotAndClass(slotId: string, className: string): AffixEntry[] {
  return affixes.filter((a) => {
    const slotOk = a.slotRestrictions.length === 0 || a.slotRestrictions.includes(slotId);
    const classOk = a.classRestrictions.length === 0 || a.classRestrictions.includes(className);
    return slotOk && classOk;
  });
}

/**
 * Returns aspects available for a given slot and class.
 */
export function getAspectsForSlotAndClass(slotId: string, className: string): AspectEntry[] {
  return aspects.filter((a) => {
    const slotOk = a.slotRestrictions.length === 0 || a.slotRestrictions.includes(slotId);
    const classOk = a.classRestrictions.length === 0 || a.classRestrictions.includes(className);
    return slotOk && classOk;
  });
}

/**
 * Computes the maximum skill points available at a given character level
 * from leveling alone (not counting renown bonuses).
 */
export function getSkillPointsAvailable(level: number): number {
  const cap = gameMath.skillPoints.levelingCapLevel;
  return Math.min(Math.max(level - 1, 0), cap - 1);
}

/**
 * Computes the paragon points available from paragon leveling alone.
 */
export function getParagonPointsAvailable(paragonLevel: number): number {
  return paragonLevel * gameMath.paragonPoints.pointsPerParagonLevel;
}
