/**
 * Bucket aggregation helpers.
 *
 * Collects all affix/aspect attribute contributions from a character's equipped
 * items and resolves each to its engine bucket, conditional type, and rolled value.
 *
 * D28: Item.tempered aggregates identically to Item.implicits + Item.explicits —
 * bucket is determined by the underlying attribute, not the source list.
 * D30: Unknown attribute → throw with the missing attribute id.
 */

import type { Character, Item } from "../schema";
import type { AffixEntry, AspectEntry, UniqueEntry } from "../catalog";
import { normalizeLabel } from "../catalog";
import type { DamageConfig } from "./config";
import type { AffixContribution } from "./types";

// ─── Attribute lookup helpers ─────────────────────────────────────────────────

/** Returns the AffixEntry for a given affixId, or undefined if not found. */
function findAffix(
  affixId: string,
  affixCatalog: AffixEntry[]
): AffixEntry | undefined {
  return affixCatalog.find((a) => a.id === affixId);
}

/** Returns the AspectEntry for a given aspectId, or undefined if not found. */
function findAspect(
  aspectId: string,
  aspectCatalog: AspectEntry[]
): AspectEntry | undefined {
  return aspectCatalog.find((a) => a.id === aspectId);
}

// ─── Unique intrinsic contribution collector ──────────────────────────────────

/**
 * Collects intrinsic-affix and routable intrinsic-aspect contributions from the
 * UniqueEntry that matches the equipped item's name.
 *
 * Gate: only fires when item.rarity ∈ {"unique", "mythic"} AND item.name is non-empty.
 * Silent-skip when the name does not resolve to a UniqueEntry (D16).
 *
 * intrinsicAffixes:  push valueRange[1] as-is (decimal form per catalog convention).
 * intrinsicAspects:
 *   - aspectId present → route via AspectEntry (D3); fail-loud on unknown aspectId (D7);
 *     silent-skip when AspectEntry has no attribute (D6).
 *   - aspectId absent + isDistinctMultiplier === true → push D4 sentinel row with
 *     rolledValue = isPercent ? valueRange[1] / 100 : valueRange[1] (D5 conversion).
 *   - all other cases (label-only, no routing flag) → silent-skip.
 */
function collectIntrinsicsFromUnique(
  item: Item,
  slotId: string,
  uniqueCatalog: UniqueEntry[],
  aspectCatalog: AspectEntry[],
  config: DamageConfig,
  contributions: AffixContribution[]
): void {
  // Gate: unique/mythic rarity only, non-empty name
  if (item.rarity !== "unique" && item.rarity !== "mythic") return;
  if (!item.name) return;

  // Resolve unique entry against the passed-in catalog (exact match — same two-tier
  // logic as lib/catalog's findUniqueByName, applied locally so the engine uses the
  // catalog instance the caller provides rather than the module-level singleton).
  const normalizedName = normalizeLabel(item.name);
  if (!normalizedName) return;
  const uniqueEntry =
    uniqueCatalog.find((u) => normalizeLabel(u.id.replace(/_/g, " ")) === normalizedName) ??
    uniqueCatalog.find((u) => normalizeLabel(u.label) === normalizedName);
  if (!uniqueEntry) return;

  // ── intrinsicAffixes path ──
  for (const ia of uniqueEntry.intrinsicAffixes ?? []) {
    const eAttr = ia.attribute.eAttribute;
    const bucketEntry = config.attributeToBucket[eAttr];
    if (!bucketEntry) {
      throw new Error(
        `[damage/buckets] Equipped unique '${uniqueEntry.id}' has intrinsicAffix referencing attribute '${eAttr}' which is not mapped in attributeToBucket. ` +
        `Add an entry to lib/damage/config.json or data/damage-config.local.json to resolve.`
      );
    }
    contributions.push({
      attribute: eAttr,
      rolledValue: ia.valueRange[1], // catalog-max, decimal form (D5)
      bucket: bucketEntry.bucket,
      conditional: bucketEntry.conditional,
      slotId,
    });
  }

  // ── intrinsicAspects path ──
  for (const ia of uniqueEntry.intrinsicAspects ?? []) {
    if (ia.aspectId) {
      // D3: route through AspectEntry
      const aspectEntry = findAspect(ia.aspectId, aspectCatalog);
      if (!aspectEntry) {
        // D7: fail-loud on missing AspectEntry
        throw new Error(
          `[damage/buckets] Equipped unique '${uniqueEntry.id}' has intrinsicAspect referencing aspect id '${ia.aspectId}' which does not exist in the aspect catalog.`
        );
      }
      if (!aspectEntry.attribute) {
        // D6: silent-skip when AspectEntry has no attribute
        continue;
      }
      const eAttr = aspectEntry.attribute.eAttribute;
      const bucketEntry = config.attributeToBucket[eAttr];
      if (!bucketEntry) {
        throw new Error(
          `[damage/buckets] Equipped unique '${uniqueEntry.id}' has intrinsicAspect (aspect id '${ia.aspectId}') referencing attribute '${eAttr}' which is not mapped in attributeToBucket. ` +
          `Add an entry to lib/damage/config.json or data/damage-config.local.json to resolve.`
        );
      }
      contributions.push({
        attribute: eAttr,
        rolledValue: ia.isPercent ? ia.valueRange[1] / 100 : ia.valueRange[1],
        bucket: bucketEntry.bucket,
        conditional: bucketEntry.conditional,
        isDistinctMultiplier: aspectEntry.isDistinctMultiplier ?? false,
        slotId,
      });
    } else if (ia.isDistinctMultiplier === true) {
      // D4: no-aspectId distinct-mult path (Tibault's Will)
      const rolledValue = ia.isPercent ? ia.valueRange[1] / 100 : ia.valueRange[1];
      contributions.push({
        attribute: `unique_intrinsic:${uniqueEntry.id}`,
        rolledValue,
        bucket: "distinct_mult",
        conditional: "unconditional",
        isDistinctMultiplier: true,
        slotId,
      });
    }
    // else: label-only, no routing flag → silent-skip (out of scope per brief)
  }
}

// ─── Single-item contribution collector ───────────────────────────────────────

/**
 * Collects affix contributions from a single equipped item.
 * Throws with the attribute id when an affix references an unmapped attribute (D30).
 */
function collectFromItem(
  item: Item,
  slotId: string,
  affixCatalog: AffixEntry[],
  aspectCatalog: AspectEntry[],
  uniqueCatalog: UniqueEntry[],
  config: DamageConfig,
  contributions: AffixContribution[]
): void {
  // All three affix lists aggregate identically (D28)
  const allAffixes = [
    ...item.implicits,
    ...item.explicits,
    ...item.tempered,
  ];

  for (const affixInstance of allAffixes) {
    const catalogEntry = findAffix(affixInstance.affixId, affixCatalog);
    if (!catalogEntry) continue; // unknown/missing catalog entry — skip

    // Respect deprecated entries: they still contribute if equipped (D37)
    const attrRef = catalogEntry.attribute;
    if (!attrRef) continue; // no attribute reference — skip (non-damaging or missing)

    const bucketEntry = config.attributeToBucket[attrRef.eAttribute];
    if (!bucketEntry) {
      // D30: fail loud with missing attribute id
      throw new Error(
        `[damage/buckets] Equipped affix '${affixInstance.affixId}' references attribute '${attrRef.eAttribute}' which is not mapped in attributeToBucket. ` +
        `Add an entry to lib/damage/config.json or data/damage-config.local.json to resolve.`
      );
    }

    // Weapon-damage range implicits have no rolledValue (only rolledRange).
    // They contribute via the damage formula directly, not via bucket.
    if (affixInstance.rolledValue === undefined) continue;

    contributions.push({
      attribute: attrRef.eAttribute,
      rolledValue: affixInstance.rolledValue,
      bucket: bucketEntry.bucket,
      conditional: bucketEntry.conditional,
      slotId,
    });
  }

  // Aspect contribution (single aspect per item)
  if (item.aspect) {
    const aspectEntry = findAspect(item.aspect.aspectId, aspectCatalog);
    if (aspectEntry?.attribute) {
      const bucketEntry = config.attributeToBucket[aspectEntry.attribute.eAttribute];
      if (!bucketEntry) {
        throw new Error(
          `[damage/buckets] Equipped aspect '${item.aspect.aspectId}' references attribute '${aspectEntry.attribute.eAttribute}' which is not mapped in attributeToBucket. ` +
          `Add an entry to lib/damage/config.json or data/damage-config.local.json to resolve.`
        );
      }

      contributions.push({
        attribute: aspectEntry.attribute.eAttribute,
        rolledValue: item.aspect.rolledValue,
        bucket: bucketEntry.bucket,
        conditional: bucketEntry.conditional,
        isDistinctMultiplier: aspectEntry.isDistinctMultiplier ?? false,
        slotId,
      });
    }
  }

  // Unique intrinsic contributions (intrinsicAffixes + routable intrinsicAspects)
  collectIntrinsicsFromUnique(item, slotId, uniqueCatalog, aspectCatalog, config, contributions);
}

// ─── Full-character collector ─────────────────────────────────────────────────

/**
 * Collects all affix contributions from a character's equipped items.
 *
 * @param equippedItems  - Map of slotId → Item (from Character.equippedItems)
 * @param affixCatalog   - All affix entries
 * @param aspectCatalog  - All aspect entries
 * @param config         - Resolved damage config
 * @returns              - Flat list of all affix contributions across all slots
 * @throws               - When an affix references an unmapped attribute (D30)
 */
export function collectAllAffixContributions(
  equippedItems: Record<string, Item>,
  affixCatalog: AffixEntry[],
  aspectCatalog: AspectEntry[],
  uniqueCatalog: UniqueEntry[],
  config: DamageConfig
): AffixContribution[] {
  const contributions: AffixContribution[] = [];

  for (const [slotId, item] of Object.entries(equippedItems)) {
    collectFromItem(item, slotId, affixCatalog, aspectCatalog, uniqueCatalog, config, contributions);
  }

  return contributions;
}

/**
 * Collects all affix contributions from a character, using the character's equippedItems.
 * Convenience wrapper over collectAllAffixContributions.
 */
export function collectCharacterContributions(
  character: Character,
  affixCatalog: AffixEntry[],
  aspectCatalog: AspectEntry[],
  uniqueCatalog: UniqueEntry[],
  config: DamageConfig
): AffixContribution[] {
  return collectAllAffixContributions(
    character.equippedItems,
    affixCatalog,
    aspectCatalog,
    uniqueCatalog,
    config
  );
}

// ─── Bucket summing helpers ───────────────────────────────────────────────────

/** Filters contributions to a specific bucket and sums their rolled values. */
export function sumBucket(
  contributions: AffixContribution[],
  bucket: string
): number {
  return contributions
    .filter((c) => c.bucket === bucket)
    .reduce((sum, c) => sum + c.rolledValue, 0);
}

/** Returns distinct-multiplier contributions (isDistinctMultiplier = true). */
export function getDistinctMultiplierContributions(
  contributions: AffixContribution[]
): AffixContribution[] {
  return contributions.filter((c) => c.isDistinctMultiplier);
}

/** Sums primary stat contributions that match the class's primary stat attribute. */
export function sumPrimaryStat(
  contributions: AffixContribution[],
  classPrimaryStatAttr: string
): number {
  // Also count Attr_All_Stats contributions regardless of class
  return contributions
    .filter(
      (c) =>
        c.bucket === "primary_stat" &&
        (c.attribute === classPrimaryStatAttr || c.attribute === "Attr_All_Stats")
    )
    .reduce((sum, c) => sum + c.rolledValue, 0);
}
