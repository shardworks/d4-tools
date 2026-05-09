/**
 * Percent detection and value-scaling logic (D27, D19).
 */

export interface PercentResult {
  isPercent: boolean;
  needsCuration: boolean;
  signals: string[];
}

/**
 * Detects whether an affix attribute represents a percentage value (D27).
 *
 * Signal 1: attribute name ends with `_Percent` → isPercent = true
 * Signal 2: szLabel contains `{VALUE:n|%}` → isPercent = true
 * Signal 3: szLabel contains `%` after the value placeholder → isPercent = true
 * Signal 4: none of the above → isPercent = false
 *
 * needsCuration = true when signals disagree.
 */
export function detectIsPercent(
  attributeName: string,
  szLabel: string
): PercentResult {
  const signals: string[] = [];

  // Signal 1: attribute name ends with _Percent
  const nameIsPercent = attributeName.endsWith("_Percent");
  if (nameIsPercent) {
    signals.push("attr_name_ends_with_Percent");
  }

  // Signal 2: szLabel contains |% annotation inside value token
  const labelHasPipePercent = /\{VALUE:\d+\|%\}/.test(szLabel);
  if (labelHasPipePercent) {
    signals.push("label_pipe_percent_annotation");
  }

  // Signal 3: szLabel contains % after a value placeholder
  // Look for % appearing after ]} (closing bracket of value token) or after VALUE tokens
  const labelHasPercentAfterValue =
    /\[\{VALUE:\d+[^}]*\}\]%/.test(szLabel) ||
    /\{VALUE:\d+[^}]*\}%/.test(szLabel) ||
    // Also handle cases like "+[{VALUE:1}]% Maximum Life"
    /%/.test(szLabel);
  if (labelHasPercentAfterValue && !labelHasPipePercent) {
    signals.push("label_percent_sign");
  }

  // Determine isPercent — any signal present means percent
  const isPercent = nameIsPercent || labelHasPipePercent || labelHasPercentAfterValue;

  // needsCuration when signals disagree
  // Specifically: name says _Percent but label has no % → disagreement
  // Or: label has % but name doesn't end with _Percent → acceptable, no curation needed
  const needsCuration =
    nameIsPercent && !labelHasPipePercent && !labelHasPercentAfterValue;

  return { isPercent, needsCuration, signals };
}

/**
 * Scale a raw datamine value to catalog units (D19).
 *
 * If isPercent AND the attribute name ends with _Percent, the datamine stores
 * the value as a decimal fraction (e.g. 0.08 = 8%). Multiply by 100.
 * Otherwise return as-is.
 */
export function scaleValue(
  value: number,
  isPercent: boolean,
  attributeName: string
): number {
  if (isPercent && attributeName.endsWith("_Percent")) {
    return value * 100;
  }
  return value;
}
