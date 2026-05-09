/**
 * Shared types for transformer summaries.
 */

export interface TransformerSummary<T> {
  entries: T[];
  needsCuration: Array<{ bnetFileName: string; reason: string }>;
  deprecated: Array<{ bnetFileName: string; catalogId: string }>;
  excluded: string[];
}
