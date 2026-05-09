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

  // Strip surrounding [] brackets around value tokens
  // e.g. "[{value}]" → "{value}", "[{value1}]" → "{value1}"
  labelTemplate = labelTemplate.replace(/\[\{(value\d*)\}\]/g, "{$1}");

  // Also strip any remaining bare [] brackets that were wrapping value tokens
  // but weren't caught above (e.g. "[" before and "]" after on different positions)
  labelTemplate = labelTemplate.replace(/\[([^\]]*)\]/g, (_, inner) => {
    // Only strip if inner doesn't contain the bracket chars themselves
    return inner;
  });

  return { labelTemplate, isMultiValue };
}
