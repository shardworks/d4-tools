/**
 * Path normalization for d4data `__fileName__` values.
 *
 * Real d4data emits `__fileName__` as a full path with extension, e.g.
 * `"base/meta/Affix/X2_Slow_Weapon_Damage_2HMace.aff"` or
 * `"base/meta/ParagonBoard/Paragon_Barb_00.pbd"`.
 *
 * The catalog's `bnetFileName` field (and every curation-file key) stores just
 * the basename without prefix or extension: `"X2_Slow_Weapon_Damage_2HMace"`,
 * `"Paragon_Barb_00"`. Every downstream consumer that joins on `bnetFileName`
 * expects the basename form.
 *
 * Use `toBnetFileName(raw.__fileName__)` whenever you need the curation-lookup
 * key or the value to write to the catalog. Use the raw `__fileName__` itself
 * for string-table lookups, which are keyed by the full path.
 */

const PATH_PREFIX = /^base\/meta\/[A-Za-z0-9]+\//;
const KNOWN_EXTENSIONS = [
  ".aff",
  ".asp",
  ".itm",
  ".pbd",
  ".gph",
  ".pow",
  ".skl",
  ".gam",
  ".glo",
  ".stl",
];

/**
 * Normalize a raw d4data `__fileName__` to its catalog-key basename.
 *
 * Examples:
 *   "base/meta/Affix/X2_Slow_Weapon_Damage_2HMace.aff" → "X2_Slow_Weapon_Damage_2HMace"
 *   "base/meta/ParagonBoard/Paragon_Barb_00.pbd"        → "Paragon_Barb_00"
 *   "X2_Slow_Weapon_Damage_2HMace"                      → "X2_Slow_Weapon_Damage_2HMace"
 *
 * Idempotent — applying it twice has the same effect as applying it once.
 */
export function toBnetFileName(rawFileName: string): string {
  // Strip the base/meta/<Section>/ prefix if present.
  let result = rawFileName.replace(PATH_PREFIX, "");

  // Strip any known extension.
  for (const ext of KNOWN_EXTENSIONS) {
    if (result.endsWith(ext)) {
      result = result.slice(0, -ext.length);
      break;
    }
  }

  return result;
}
