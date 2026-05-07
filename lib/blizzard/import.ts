/**
 * Blizzard API payload → canonical Character + Build conversion (D11-D16, D29).
 *
 * Key decisions:
 * - D9: ID-only resolution — no display-string fallback.
 * - D11: Items not in catalog → name + rarity='unique' + isAncestral; omit aspect; warn.
 * - D12/D30: Populate the import provenance block on Character.
 * - D14: Unresolved affix IDs stored as "unresolved:<id>"; warn count in preview.
 * - D15: Paladin/Warlock imported with warnings (skill/paragon catalogs empty).
 * - D16: Build name = character name.
 * - D29: CharacterSchema.parse() run before returning (resolver-time validation).
 */

import { CharacterSchema } from "@/lib/schema/character";
import type { Character } from "@/lib/schema/character";
import type { Item } from "@/lib/schema/item";
import type { AffixInstance } from "@/lib/schema/affix";
import type { AspectInstance } from "@/lib/schema/aspect";
import type { SkillSelection } from "@/lib/schema/skill";
import { gameMathConstants } from "@/lib/catalog";
import type { BnetHero, BnetHeroItems, BnetItem, BnetAffix } from "./types";
import type { CatalogResolvers } from "./resolvers";

// ─── Warning accumulator ───────────────────────────────────────────────────

export interface ImportWarning {
  /** Entity type that was unresolved or missing. */
  type: "affix" | "aspect" | "skill" | "item" | "class" | "slot";
  /** Raw Blizzard ID or name that could not be resolved. */
  rawId: string | number;
  /** Catalog-ID prefix stored in the data (e.g. "unresolved:334512"). */
  storedAs: string;
  /** Human-readable context (slot name, etc.) for the preview banner. */
  context?: string;
}

// ─── Rarity mapping ────────────────────────────────────────────────────────

const QUALITY_TO_RARITY: Record<string, Item["rarity"]> = {
  common: "common",
  magic: "magic",
  rare: "rare",
  legendary: "legendary",
  unique: "unique",
  mythic: "mythic",
  // Blizzard API may use different casing or values
  normal: "common",
  superior: "common",
  sacred: "rare",
  ancestral: "unique",
};

function mapRarity(quality: string): Item["rarity"] {
  return QUALITY_TO_RARITY[quality.toLowerCase()] ?? "legendary";
}

// ─── Affix conversion ──────────────────────────────────────────────────────

function convertAffixes(
  bnetAffixes: BnetAffix[] | undefined,
  resolvers: CatalogResolvers,
  warnings: ImportWarning[],
  context: string
): AffixInstance[] {
  if (!bnetAffixes || bnetAffixes.length === 0) return [];

  return bnetAffixes.map((bnetAffix): AffixInstance => {
    const hit = resolvers.affix(bnetAffix.id);
    if (!hit.isUnresolved) {
      return {
        affixId: hit.entry.id,
        rolledValue: bnetAffix.value ?? 0,
      };
    }
    // D14: store with unresolved prefix, accumulate warning
    const storedId = hit.unresolvedKey;
    warnings.push({
      type: "affix",
      rawId: bnetAffix.id,
      storedAs: storedId,
      context,
    });
    return {
      affixId: storedId,
      rolledValue: bnetAffix.value ?? 0,
    };
  });
}

// ─── Aspect conversion ─────────────────────────────────────────────────────

function convertAspect(
  bnetAspect: { id: number; value?: number } | undefined,
  resolvers: CatalogResolvers,
  warnings: ImportWarning[],
  context: string
): AspectInstance | undefined {
  if (!bnetAspect) return undefined;

  const hit = resolvers.aspect(bnetAspect.id);
  if (!hit.isUnresolved) {
    return {
      aspectId: hit.entry.id,
      rolledValue: bnetAspect.value ?? 0,
      source: hit.entry.source,
    };
  }

  // D14: unresolved aspect — store with prefix, warn
  warnings.push({
    type: "aspect",
    rawId: bnetAspect.id,
    storedAs: hit.unresolvedKey,
    context,
  });
  // Return a minimal unresolved aspect instance
  return {
    aspectId: hit.unresolvedKey,
    rolledValue: bnetAspect.value ?? 0,
    source: "legendary",
  };
}

// ─── Item conversion ───────────────────────────────────────────────────────

const ANCESTRAL_THRESHOLD = gameMathConstants.itemPower.ancestralThreshold;

function convertItem(
  bnetItem: BnetItem,
  slotId: string,
  resolvers: CatalogResolvers,
  warnings: ImportWarning[]
): Item {
  const rarity = mapRarity(bnetItem.quality);
  const itemPower = bnetItem.power;

  // isAncestral: use API flag if present, else derive from itemPower threshold (D11)
  const isAncestral = bnetItem.isAncestral ?? (itemPower != null && itemPower >= ANCESTRAL_THRESHOLD);

  const implicits = convertAffixes(bnetItem.implicits, resolvers, warnings, `${slotId}.implicits`);
  const explicits = convertAffixes(bnetItem.explicits, resolvers, warnings, `${slotId}.explicits`);
  const tempered = convertAffixes(bnetItem.tempered, resolvers, warnings, `${slotId}.tempered`);
  const aspect = convertAspect(bnetItem.aspect, resolvers, warnings, `${slotId}.aspect`);

  return {
    slot: slotId,
    name: bnetItem.name,
    rarity,
    itemPower,
    isAncestral,
    implicits,
    explicits,
    tempered,
    aspect,
    masterworkRank: 0,
    runes: [],
    sockets: [],
  };
}

// ─── Skill conversion ──────────────────────────────────────────────────────

function convertSkills(
  hero: BnetHero,
  resolvers: CatalogResolvers,
  warnings: ImportWarning[]
): SkillSelection[] {
  const selections: SkillSelection[] = [];
  const activeSkills = hero.skills?.active ?? [];
  const passiveSkills = hero.skills?.passive ?? [];

  for (const s of [...activeSkills, ...passiveSkills]) {
    const hit = resolvers.skill(s.id);
    if (!hit.isUnresolved) {
      selections.push({
        skillId: hit.entry.id,
        rank: 1, // API does not expose rank; default to 1
      });
    } else {
      warnings.push({ type: "skill", rawId: s.id, storedAs: hit.unresolvedKey });
      // D14: store unresolved skills too
      selections.push({ skillId: hit.unresolvedKey, rank: 1 });
    }
  }

  return selections;
}

// ─── Main conversion ───────────────────────────────────────────────────────

export interface ConversionResult {
  character: Omit<Character, "id">;
  buildName: string;
  warnings: ImportWarning[];
}

/**
 * Convert a Blizzard API hero + items payload into a canonical Character (D12, D29).
 * Does NOT assign an ID (that is done by saveCharacter).
 *
 * @param hero     - Hero detail from /hero endpoint
 * @param items    - Equipped items from /hero-items endpoint
 * @param region   - The API region this hero belongs to
 * @param resolvers - Catalog resolvers for ID lookup
 * @param season   - Current season string (null for eternal realm, D30)
 */
export function convertBnetHero(
  hero: BnetHero,
  items: BnetHeroItems,
  region: "americas" | "europe" | "asia",
  resolvers: CatalogResolvers,
  season: string | null
): ConversionResult {
  const warnings: ImportWarning[] = [];

  // ─── Class resolution (D26) ───────────────────────────────────────────
  let characterClass: Character["class"] = "Sorcerer"; // fallback
  const classHit = resolvers.class(hero.class);
  if (!classHit.isUnresolved) {
    characterClass = classHit.entry.id as Character["class"];
  } else {
    warnings.push({ type: "class", rawId: hero.class, storedAs: classHit.unresolvedKey });
  }

  // ─── Equipped items ──────────────────────────────────────────────────
  const equippedItems: Record<string, Item> = {};
  for (const [bnetSlotKey, bnetItem] of Object.entries(items)) {
    if (!bnetItem) continue;

    const slot = resolvers.slot(bnetSlotKey);
    if (!slot) {
      // Unknown slot key — skip with a warning
      warnings.push({
        type: "slot",
        rawId: bnetSlotKey,
        storedAs: `unresolved:${bnetSlotKey}`,
        context: bnetItem.name,
      });
      continue;
    }

    equippedItems[slot.id] = convertItem(bnetItem, slot.id, resolvers, warnings);
  }

  // ─── Skills (D15: Paladin/Warlock accepted with warnings via D14) ─────
  const skillSelections = convertSkills(hero, resolvers, warnings);

  // ─── Import provenance block (D12, D30) ──────────────────────────────
  const realmSlug = hero.seasonal ? "seasonal" : "eternal";
  const importedAt = new Date().toISOString();

  const characterData: Omit<Character, "id"> = {
    name: hero.name,
    class: characterClass,
    level: Math.min(Math.max(hero.level, 1), 100),
    paragonAllocation: {
      paragonLevel: Math.min(Math.max(hero.paragonLevel ?? 0, 0), 300),
      boards: [],
    },
    skillSelections,
    equippedItems,
    playstyleConstraints: [],
    import: {
      source: "battlenet",
      heroId: hero.id,
      realm: realmSlug,
      region,
      season,
      importedAt,
    },
  };

  // D29: CharacterSchema.parse before returning — surfaces schema errors close to source
  CharacterSchema.omit({ id: true }).parse(characterData);

  return {
    character: characterData,
    buildName: hero.name, // D16: build name = character name
    warnings,
  };
}
