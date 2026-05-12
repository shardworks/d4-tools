/**
 * Catalog loader for the D4 data catalog.
 *
 * All data is imported as JSON (resolveJsonModule) — no runtime fs access.
 * Every catalog file carries a `verifiedAgainst` stamp following the
 * docs/data-sources/ convention (expansion, season, patch, accessedDate).
 * Catalog files are regenerated from the DiabloTools/d4data datamine
 * by `tools/datamine-import/`.
 */

import classesCatalog from "./classes.json";
import slotsCatalog from "./slots.json";
import affixesCatalog from "./affixes.json";
import aspectsCatalog from "./aspects.json";
import uniquesCatalog from "./uniques.json";
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
  /** Per-class source provenance for tree-allocation rank caps (url, accessed date, notes). */
  maxRankSource?: { url: string; accessedDate: string; notes: string };
}

export interface ClassEntry {
  id: string;
  label: string;
  primaryStat: string;
  supported: boolean;
  unsupportedReason?: string;
  /** Datamine class identifier string (e.g. "sorcerer", "barbarian") — sourced from `DiabloTools/d4data` PlayerClass entries. */
  bnetClassName?: string;
  /** Datamine numeric class SNO ID — sourced from `DiabloTools/d4data` PlayerClass entries. */
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
  /** Datamine slot key (e.g. "head", "torso") — sourced from `DiabloTools/d4data`. */
  bnetSlotKey?: string;
}

/**
 * A single IP-tier value band for an affix.
 * minItemPower is the minimum item power at which this band applies (ascending sort).
 */
export interface ValueRangeBand {
  minItemPower: number;
  min: number;
  max: number;
}

export interface AffixEntry {
  id: string;
  label: string;
  labelTemplate: string;
  /** Per-IP-tier value bands, sorted ascending by minItemPower. Non-empty. */
  valueRanges: [ValueRangeBand, ...ValueRangeBand[]];
  isPercent: boolean;
  slotRestrictions: string[];
  classRestrictions: string[];
  /** Datamine numeric SNO ID for this affix — sourced from `DiabloTools/d4data`. */
  bnetId?: number;
  /** Datamine file-name (without `.aff.json` extension) for this affix — sourced from `DiabloTools/d4data`. */
  bnetFileName?: string;
  deprecated?: boolean;
  /**
   * v15: Datamine attribute reference for this affix (first attribute only — multi-attribute
   * affixes use the first attribute per D6; curation handles edge cases).
   * Used by the damage engine to route affix contributions to the correct bucket.
   */
  attribute?: { eAttribute: string; nParam: number };
  /**
   * v18: True when this affix is an implicit property — built-in to the item type and not
   * replaceable via enchanting. Absent (undefined) means false (explicit affix).
   * Used by the triage resolver to scope candidates by position (implicit vs. explicit).
   */
  isImplicit?: boolean;
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
  /** Datamine numeric SNO ID for this aspect — sourced from `DiabloTools/d4data`. */
  bnetId?: number;
  /** Datamine file-name (without `.asp.json` extension) for this aspect — sourced from `DiabloTools/d4data`. */
  bnetFileName?: string;
  deprecated?: boolean;
  /**
   * v15: Optional datamine attribute reference. Mechanical aspects (e.g. movement-speed,
   * utility) may not have an attribute reference — skip-when-unset is legitimate state (D7).
   */
  attribute?: { eAttribute: string; nParam: number };
  /**
   * v15: True when this aspect is a [×]-tagged distinct multiplicative source in-game.
   * Set via curation record's `isDistinctMultiplier` field (D16).
   * Engine multiplies each distinct-multiplicative aspect into its own bucket.
   */
  isDistinctMultiplier?: boolean;
}

export interface UniqueEntry {
  id: string;
  label: string;
  slot: string;
  classRestrictions: string[];
  bnetId?: number;
  bnetFileName?: string;
  deprecated?: boolean;
  /**
   * v15: Intrinsic affix attribute references extracted from the datamine (D8).
   * Each entry carries the attribute reference and the value range [min, max].
   * Used by the damage engine to compute DPS contributions from unique intrinsic powers.
   */
  intrinsicAffixes?: Array<{
    attribute: { eAttribute: string; nParam: number };
    valueRange: [number, number];
  }>;
  /**
   * v17: Intrinsic aspect-like powers on unique items (D1).
   * Carries the unique's intrinsic power text (for display), the catalogued aspect id
   * if this power maps to an existing aspect, and the value range so the short-circuit
   * resolver (D16) can emit a resolved AspectMatchResult without a full catalog scan.
   * Used by resolveUnique() and (future) the damage engine for distinct-multiplier uniques.
   */
  intrinsicAspects?: Array<{
    /** Matching catalog aspect id, if the power maps to an existing AspectEntry. */
    aspectId?: string;
    /** Human-readable label for the intrinsic power (display fallback when aspectId absent). */
    label: string;
    /** [min, max] value range for the power's numeric parameter. */
    valueRange: [number, number];
    /** Whether the value is expressed as a percent (mirrors AspectEntry.isPercent). */
    isPercent: boolean;
    /** Whether this power is a [×]-tagged distinct multiplicative source. */
    isDistinctMultiplier?: boolean;
  }>;
}

export interface SkillScalingAttribute {
  /** Normalized attribute name (e.g. "Attr_Skill_Damage_Percent"). Hungarian prefix removed per D5. */
  attribute: string;
  /** Base damage coefficient at rank 1 (normalized from `fScaleValue`). */
  scaleValue: number;
  /** Additional coefficient per rank beyond rank 1 (normalized from `nRankScale`). */
  rankScale: number;
}

export interface SkillEntry {
  id: string;
  label: string;
  category: string;
  /** Tree allocation cap — the maximum rank a player can assign in the in-game skill tree. Excludes gear-derived bonuses. */
  maxRank: number;
  /** Datamine numeric SNO ID for this skill — sourced from `DiabloTools/d4data` Power entries. */
  bnetId?: number;
  /** Datamine file-name (without `.pow.json` extension) for this skill — sourced from `DiabloTools/d4data`. */
  bnetFileName?: string;
  /**
   * v15: Scaling attributes extracted from the Power file (D5).
   * Each entry carries a normalized attribute name, base coefficient, and per-rank coefficient.
   * The damage engine uses entries whose attribute maps to a damage bucket to classify the
   * skill as "damaging" (D17) and to compute its base damage contribution.
   */
  scalingAttributes?: SkillScalingAttribute[];
  /**
   * v15: Skill tags from `arTagsGranted` in the Power file (e.g. ["Fire", "Projectile"]).
   * Used for tag-conditional damage bucket routing in a future engine pass.
   */
  tags?: string[];
  /** v15: Resource cost per cast (normalized from `fResourceCost`). */
  resourceCostPerCast?: number;
  /** v15: Cooldown in seconds (normalized from `fCooldownDuration`). */
  cooldownSeconds?: number;
  /**
   * Ids previously used for this entry that the resolver still accepts.
   * Any saved character data carrying a legacy id is silently resolved to this entry.
   * Set via curation when an audit-driven label change renames the catalog id.
   */
  legacyIds?: string[];
}

export interface ParagonBoardEntry {
  id: string;
  label: string;
  isStarterBoard?: boolean;
  /** Datamine numeric SNO ID for this board — sourced from `DiabloTools/d4data` ParagonBoard entries. */
  bnetId?: number;
  /** Datamine file-name (without `.pbd.json` extension) for this board — sourced from `DiabloTools/d4data`. */
  bnetFileName?: string;
  /**
   * Ids previously used for this entry that the resolver still accepts.
   * Any saved character data carrying a legacy id is silently resolved to this entry.
   * Set via curation when an audit-driven label change renames the catalog id.
   */
  legacyIds?: string[];
}

export interface ParagonGlyphEntry {
  id: string;
  label: string;
  /** Datamine numeric SNO ID for this glyph — sourced from `DiabloTools/d4data` ParagonGlyph entries. */
  bnetId?: number;
  /** Datamine file-name (without `.gph.json` extension) for this glyph — sourced from `DiabloTools/d4data`. */
  bnetFileName?: string;
  /**
   * Ids previously used for this entry that the resolver still accepts.
   * Any saved character data carrying a legacy id is silently resolved to this entry.
   * Set via curation when an audit-driven label change renames the catalog id.
   */
  legacyIds?: string[];
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

/** All unique items. */
export const uniques: UniqueEntry[] = uniquesCatalog.uniques as unknown as UniqueEntry[];

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

// ─── Resolver helpers ─────────────────────────────────────────────────────────

/**
 * Finds a skill for a class by canonical `id` OR any known `legacyIds` value.
 * Returns the matching entry, or `undefined` on miss.
 * Use this instead of direct array iteration when looking up a stored skillId.
 */
export function findSkillById(className: string, id: string): SkillEntry | undefined {
  return getSkillsForClass(className).find(
    (s) => s.id === id || (s.legacyIds?.includes(id) ?? false)
  );
}

/**
 * Finds a paragon board for a class by canonical `id` OR any known `legacyIds` value.
 * Returns the matching entry, or `undefined` on miss.
 * Use this instead of direct array iteration when looking up a stored boardId.
 */
export function findParagonBoardById(
  className: string,
  id: string
): ParagonBoardEntry | undefined {
  return getParagonCatalogForClass(className).boards.find(
    (b) => b.id === id || (b.legacyIds?.includes(id) ?? false)
  );
}

/**
 * Finds a paragon glyph for a class by canonical `id` OR any known `legacyIds` value.
 * Returns the matching entry, or `undefined` on miss.
 * Use this instead of direct array iteration when looking up a stored glyphId.
 */
export function findParagonGlyphById(
  className: string,
  id: string
): ParagonGlyphEntry | undefined {
  return getParagonCatalogForClass(className).glyphs.find(
    (g) => g.id === id || (g.legacyIds?.includes(id) ?? false)
  );
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
 * Returns the value range band for the given item power tier.
 *
 * - When `itemPower` is provided, returns the highest band whose `minItemPower` ≤ `itemPower`.
 * - When `itemPower` is omitted (undefined), returns the last (highest IP) band (D8: IP-less fallback).
 * - Falls back to the first band when itemPower is below all band thresholds.
 */
export function getAffixValueRangeAtItemPower(
  entry: AffixEntry,
  itemPower?: number
): ValueRangeBand {
  const bands = entry.valueRanges;
  if (itemPower === undefined) {
    return bands[bands.length - 1];
  }
  for (let i = bands.length - 1; i >= 0; i--) {
    if (bands[i].minItemPower <= itemPower) {
      return bands[i];
    }
  }
  return bands[0];
}

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
