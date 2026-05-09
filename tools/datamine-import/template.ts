/**
 * Display-string template parser for datamine szLabel strings.
 *
 * Transforms raw datamine label templates into catalog-compatible templates.
 */

/**
 * Parse a datamine szLabel into a catalog-compatible labelTemplate.
 *
 * @example
 *   parseTemplate("+[{VALUE:1}]% Maximum Life")
 *   // → { labelTemplate: "+{value}% Maximum Life", isMultiValue: false }
 *
 *   parseTemplate("[{VALUE:1}]%–[{VALUE:2}]% Max Life")
 *   // → { labelTemplate: "{value1}%–{value2}% Max Life", isMultiValue: true }
 */
export function parseTemplate(szLabel: string): {
  labelTemplate: string;
  isMultiValue: boolean;
} {
  // Count distinct VALUE:N tokens to determine if multi-value
  const valueTokenMatches = szLabel.match(/\{VALUE:\d+\}/g) ?? [];
  const distinctIndices = new Set(valueTokenMatches.map((t) => t.match(/\d+/)![0]));
  const isMultiValue = distinctIndices.size > 1;

  let labelTemplate = szLabel;

  // Strip |%  annotations (e.g. {VALUE:1|%} → {VALUE:1})
  labelTemplate = labelTemplate.replace(/\{VALUE:(\d+)\|[^}]*\}/g, "{VALUE:$1}");

  if (isMultiValue) {
    // Multi-value: replace {VALUE:1} → {value1}, {VALUE:2} → {value2}, etc.
    labelTemplate = labelTemplate.replace(/\{VALUE:(\d+)\}/g, (_, n) => `{value${n}}`);
  } else {
    // Single-value: replace any {VALUE:N} → {value}
    labelTemplate = labelTemplate.replace(/\{VALUE:\d+\}/g, "{value}");
  }

  // Strip surrounding [] brackets around value tokens only.
  // e.g. "[{value}]" → "{value}", "[{value1}]" → "{value1}"
  // This pass is intentionally narrow: it only matches the exact pattern
  // [{valueN}] so that legitimate bracketed content (e.g. [Fire Damage]) is
  // preserved. A broader strip-all-brackets pass was previously present here
  // and was removed because it silently mangled non-value bracket content.
  labelTemplate = labelTemplate.replace(/\[\{(value\d*)\}\]/g, "{$1}");

  return { labelTemplate, isMultiValue };
}
