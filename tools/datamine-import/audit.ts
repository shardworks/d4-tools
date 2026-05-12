/**
 * Audit document generator.
 *
 * Produces a Markdown audit document summarizing the import run.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AffixEntry,
  AspectEntry,
  SkillEntry,
  ParagonBoardEntry,
} from "../../lib/catalog/index";
import type { UniqueEntry } from "../../lib/catalog/index";
import type { TransformerSummary } from "./sections/types";
import type { AffixTransformerSummary } from "./sections/affixes";
import type { ParagonGlyphPoolEntry } from "./sections/paragon";
import { GLYPH_CLASS_ORDER } from "./mappings";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditParams {
  build: string;
  accessedDate: string;
  affixes: AffixTransformerSummary;
  aspects: TransformerSummary<AspectEntry>;
  uniques: TransformerSummary<UniqueEntry>;
  skillsByClass: Record<string, TransformerSummary<SkillEntry>>;
  paragonBoardsByClass: Record<string, TransformerSummary<ParagonBoardEntry>>;
  glyphPool: TransformerSummary<ParagonGlyphPoolEntry>;
  paragonGlyphConflicts: Array<{ catalogId: string; reason: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function summaryRow(
  label: string,
  imported: number,
  excluded: number,
  needsCuration: number
): string {
  return `| ${label} | ${imported} | ${excluded} | ${needsCuration} |`;
}

function formulaProvenanceTable(
  items: Array<{ catalogId: string; bnetFileName: string; formulaSource: string; evaluatedBandCount: number }>
): string {
  if (items.length === 0) return "_None._\n";
  const header = "| Catalog ID | bnetFileName | Formula Source | Bands |\n|---|---|---|---|";
  const rows = items
    .map((p) => `| \`${p.catalogId}\` | \`${p.bnetFileName}\` | ${p.formulaSource} | ${p.evaluatedBandCount} |`)
    .join("\n");
  return `${header}\n${rows}\n`;
}

function needsCurationTable(
  items: Array<{ bnetFileName: string; reason: string }>
): string {
  if (items.length === 0) return "_None._\n";
  const rows = items
    .map((n) => `| \`${n.bnetFileName}\` | ${n.reason} |`)
    .join("\n");
  return `| bnetFileName | Reason |\n|---|---|\n${rows}\n`;
}

function entryTable<T extends { id: string; label: string; bnetFileName?: string; bnetId?: number }>(
  entries: T[],
  extraNote?: (e: T) => string
): string {
  if (entries.length === 0) return "_None._\n";
  const header = "| Catalog ID | Display Name | bnetFileName | bnetId | Notes |\n|---|---|---|---|---|";
  const rows = entries
    .map((e) => {
      const note = extraNote ? extraNote(e) : "";
      return `| \`${e.id}\` | ${e.label} | \`${e.bnetFileName ?? ""}\` | ${e.bnetId ?? ""} | ${note} |`;
    })
    .join("\n");
  return `${header}\n${rows}\n`;
}

/**
 * Render the class-affinity matrix for the shared glyph pool (D11).
 * Rows = catalog ids (sorted), columns = the eight classes, cells = ✓ or —.
 */
function glyphAffinityMatrix(entries: ParagonGlyphPoolEntry[]): string {
  if (entries.length === 0) return "_None._\n";

  const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id));
  const classNames = GLYPH_CLASS_ORDER;

  const header = `| Catalog ID | Label | ${classNames.join(" | ")} |`;
  const separator = `|---|---|${classNames.map(() => "---").join("|")}|`;

  const rows = sorted.map((entry) => {
    const cells = classNames.map((cls) =>
      entry.classAffinity.includes(cls) ? "✓" : "—"
    );
    return `| \`${entry.id}\` | ${entry.label} | ${cells.join(" | ")} |`;
  });

  return [header, separator, ...rows].join("\n") + "\n";
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function generateAuditDoc(params: AuditParams): string {
  const {
    build,
    accessedDate,
    affixes,
    aspects,
    uniques,
    skillsByClass,
    paragonBoardsByClass,
    glyphPool,
    paragonGlyphConflicts,
  } = params;

  const timestamp = new Date().toISOString();

  // Aggregate skill totals
  const allSkillEntries = Object.values(skillsByClass).flatMap((s) => s.entries);
  const allSkillNeedsCuration = Object.values(skillsByClass).flatMap((s) => s.needsCuration);
  const allSkillExcluded = Object.values(skillsByClass).flatMap((s) => s.excluded);

  // Aggregate paragon board totals
  const allBoardEntries = Object.values(paragonBoardsByClass).flatMap((p) => p.entries);
  const allBoardNeedsCuration = Object.values(paragonBoardsByClass).flatMap((p) => p.needsCuration);
  const allBoardExcluded = Object.values(paragonBoardsByClass).flatMap((p) => p.excluded);

  const lines: string[] = [];

  lines.push(`# D4 Datamine Import — Build ${build}`);
  lines.push("");
  lines.push("**Source:** DiabloTools/d4data  ");
  lines.push(`**Build:** ${build}  `);
  lines.push(`**Accessed:** ${accessedDate}  `);
  lines.push(`**Generated:** ${timestamp}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Section | Imported | Excluded | Needs Curation |");
  lines.push("|---------|----------|----------|----------------|");
  lines.push(summaryRow("Affixes", affixes.entries.length, affixes.excluded.length, affixes.needsCuration.length));
  lines.push(summaryRow("Aspects", aspects.entries.length, aspects.excluded.length, aspects.needsCuration.length));
  lines.push(summaryRow("Uniques", uniques.entries.length, uniques.excluded.length, uniques.needsCuration.length));
  lines.push(summaryRow("Skills (all classes)", allSkillEntries.length, allSkillExcluded.length, allSkillNeedsCuration.length));
  lines.push(summaryRow("Paragon boards", allBoardEntries.length, allBoardExcluded.length, allBoardNeedsCuration.length));
  lines.push(summaryRow("Paragon glyphs (pool)", glyphPool.entries.length, glyphPool.excluded.length, glyphPool.needsCuration.length));
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Affixes");
  lines.push("");
  lines.push(entryTable(affixes.entries));
  if (affixes.needsCuration.length > 0) {
    lines.push("### Needs Curation");
    lines.push("");
    lines.push(needsCurationTable(affixes.needsCuration));
  }
  lines.push("");
  lines.push("### Formula Provenance (D22)");
  lines.push("");
  lines.push(`_${affixes.formulaProvenance.length} affixes with formula provenance recorded._`);
  lines.push("");
  lines.push(formulaProvenanceTable(affixes.formulaProvenance));
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Aspects");
  lines.push("");
  lines.push(entryTable(aspects.entries));
  if (aspects.needsCuration.length > 0) {
    lines.push("### Needs Curation");
    lines.push("");
    lines.push(needsCurationTable(aspects.needsCuration));
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Uniques");
  lines.push("");
  lines.push(entryTable(uniques.entries));
  if (uniques.needsCuration.length > 0) {
    lines.push("### Needs Curation");
    lines.push("");
    lines.push(needsCurationTable(uniques.needsCuration));
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Skills by Class");
  lines.push("");

  for (const [className, summary] of Object.entries(skillsByClass)) {
    lines.push(`### ${className}`);
    lines.push("");
    lines.push(entryTable(summary.entries));
    if (summary.needsCuration.length > 0) {
      lines.push("#### Needs Curation");
      lines.push("");
      lines.push(needsCurationTable(summary.needsCuration));
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Paragon Glyphs (shared pool)");
  lines.push("");
  lines.push(
    "Glyph entries are consolidated into a single shared pool. " +
    "Each entry lists its `classAffinity` and per-class `bnetSources`. " +
    "The affinity matrix below shows which classes can use each glyph."
  );
  lines.push("");
  lines.push("### Affinity Matrix");
  lines.push("");
  lines.push(glyphAffinityMatrix(glyphPool.entries));
  if (glyphPool.needsCuration.length > 0) {
    lines.push("### Needs Curation");
    lines.push("");
    lines.push(needsCurationTable(glyphPool.needsCuration));
  }
  if (paragonGlyphConflicts.length > 0) {
    lines.push("### Conflicts (exit code 1)");
    lines.push("");
    const rows = paragonGlyphConflicts
      .map((c) => `| \`${c.catalogId}\` | ${c.reason} |`)
      .join("\n");
    lines.push("| Catalog ID | Conflict Reason |\n|---|---|\n" + rows + "\n");
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Paragon by Class");
  lines.push("");

  for (const [className, boards] of Object.entries(paragonBoardsByClass)) {
    lines.push(`### ${className}`);
    lines.push("");
    lines.push("#### Boards");
    lines.push("");
    lines.push(entryTable(boards.entries));
    if (boards.needsCuration.length > 0) {
      lines.push("#### Boards — Needs Curation");
      lines.push("");
      lines.push(needsCurationTable(boards.needsCuration));
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Open Items");
  lines.push("");

  const hasAnyNeedsCuration =
    affixes.needsCuration.length > 0 ||
    aspects.needsCuration.length > 0 ||
    uniques.needsCuration.length > 0 ||
    allSkillNeedsCuration.length > 0 ||
    allBoardNeedsCuration.length > 0 ||
    glyphPool.needsCuration.length > 0 ||
    paragonGlyphConflicts.length > 0;

  if (!hasAnyNeedsCuration) {
    lines.push("*(No open items.)*");
  } else {
    lines.push("See needs-curation sections above for entries requiring editorial decisions.");
    lines.push("Update `tools/datamine-import/curation.json` with `include`, `exclude`, or `deprecated` actions.");
    if (paragonGlyphConflicts.length > 0) {
      lines.push("Resolve paragon glyph conflicts listed in the shared pool section above.");
    }
  }
  lines.push("");

  return lines.join("\n");
}

// ─── Writer ───────────────────────────────────────────────────────────────────

export function writeAuditDoc(
  doc: string,
  build: string,
  docsDir: string,
  dryRun: boolean
): void {
  if (dryRun) {
    console.log(`[dry-run] Would write docs/datamine-import-${build}.md`);
    return;
  }

  fs.mkdirSync(docsDir, { recursive: true });
  const filePath = path.join(docsDir, `datamine-import-${build}.md`);
  fs.writeFileSync(filePath, doc, "utf8");
  console.log(`Wrote audit doc: ${filePath}`);
}
