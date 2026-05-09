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
import type { AffixEntry, AspectEntry } from "../catalog";
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
  config: DamageConfig
): AffixContribution[] {
  const contributions: AffixContribution[] = [];

  for (const [slotId, item] of Object.entries(equippedItems)) {
    collectFromItem(item, slotId, affixCatalog, aspectCatalog, config, contributions);
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
  config: DamageConfig
): AffixContribution[] {
  return collectAllAffixContributions(
    character.equippedItems,
    affixCatalog,
    aspectCatalog,
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
