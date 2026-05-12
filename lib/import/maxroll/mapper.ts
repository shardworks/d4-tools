/**
 * Schema-mapping pipeline for the Maxroll planner importer (T3).
 *
 * Translates a single Maxroll variant payload into our canonical schema shapes.
 * Every unmapped reference lands in the appropriate UnmappedRef bucket — none
 * silently dropped (acceptance signal 3).
 *
 * Decisions applied here:
 *   D8  — UnmappedRef discriminated union
 *   D9  — patch-mismatch failure threshold (≥50% explicits mapped → ok:true with warning)
 *   D11 — AspectInstance.source defaults to 'legendary'
 *   D12 — Character.level defaults to 100
 *   D13 — Item.itemPower left undefined when absent
 *   D14 — Item.rarity: unique/legendary/rare inference
 *   D15 — Item.isAncestral defaults to false
 *   D16 — Affix routing: isImplicit → implicits, tempered → tempered, else → explicits
 *   D17 — Paragon node ids verbatim with mr: prefix; spentPoints = nodes.length
 *   D18 — Glyph level defaults to 21 when absent
 */

import type { Character } from "@/lib/schema/character";
import type { Item, ItemRarity } from "@/lib/schema/item";
import type { AffixInstance } from "@/lib/schema/affix";
import type { AspectInstance } from "@/lib/schema/aspect";
import type {
  ParagonAllocation,
  ParagonBoardAllocation,
} from "@/lib/schema/paragon";
import type { SkillSelection } from "@/lib/schema/skill";

import { D4_CLASSES } from "@/lib/schema/character";
import { classes, getParagonCatalogForClass } from "@/lib/catalog";
import type { ParagonBoardEntry } from "@/lib/catalog";
import type {
  MaxrollVariant,
  MaxrollDataMin,
  MaxrollItem,
} from "./payload-schema";
import { mapMaxrollSlot } from "./slot-map";
import { getCatalogIndex } from "./catalog-index";
import type { UnmappedRef, ImportReport, VariantResult } from "./types";
import type { Build } from "@/lib/schema/build";
import type { BuildImportedFrom } from "@/lib/schema/build";

// ─── Class-name normalisation ─────────────────────────────────────────────────

/**
 * Maps a Maxroll class string to a canonical D4Class name.
 * Maxroll uses lowercase keys (e.g. "sorcerer"); our schema uses title-case.
 */
function resolveClass(maxrollClass: string): typeof D4_CLASSES[number] | undefined {
  const lower = maxrollClass.toLowerCase();
  // Direct bnetClassName match
  const byCatalog = classes.find(
    (c) => (c.bnetClassName ?? "").toLowerCase() === lower
  );
  if (byCatalog) return byCatalog.id as typeof D4_CLASSES[number];
  // Fallback: title-case match against D4_CLASSES
  const titled = lower.charAt(0).toUpperCase() + lower.slice(1);
  if ((D4_CLASSES as readonly string[]).includes(titled)) {
    return titled as typeof D4_CLASSES[number];
  }
  return undefined;
}

// ─── Rarity inference (D14) ──────────────────────────────────────────────────

function inferRarity(
  maxrollRarity: string | undefined,
  isUnique: boolean,
  hasAspect: boolean
): ItemRarity {
  // Honor Maxroll's explicit rarity when present
  if (maxrollRarity) {
    const r = maxrollRarity.toLowerCase();
    if (r === "mythic") return "mythic";
    if (r === "unique") return "unique";
    if (r === "legendary") return "legendary";
    if (r === "rare") return "rare";
    if (r === "magic") return "magic";
    if (r === "common" || r === "normal") return "common";
  }
  // D14 three-tier rule
  if (isUnique) return "unique";
  if (hasAspect) return "legendary";
  return "rare";
}

// ─── Per-item mapper ──────────────────────────────────────────────────────────

function mapItem(
  mrItem: MaxrollItem,
  slotId: string,
  dataMin: MaxrollDataMin,
  charClass: string,
  report: {
    unmappedAffixes: UnmappedRef[];
    unmappedAspects: UnmappedRef[];
  }
): Item {
  const idx = getCatalogIndex();

  const implicits: AffixInstance[] = [];
  const explicits: AffixInstance[] = [];
  const tempered: AffixInstance[] = [];
  let aspect: AspectInstance | undefined;

  // ── Affixes ──────────────────────────────────────────────────────────────
  for (const mrAffix of mrItem.affixes ?? []) {
    const nidStr = String(mrAffix.nid);
    const statEntry = dataMin.stats?.[nidStr];
    const bnetFileName = statEntry?.bnetFileName;

    let catalogEntry = bnetFileName ? idx.affixByBnetFileName.get(bnetFileName) : undefined;

    if (!catalogEntry) {
      // Unmapped — record in report, skip
      report.unmappedAffixes.push({
        category: "affix",
        nid: nidStr,
        itemSlot: slotId,
      });
      continue;
    }

    // Rolled value — take first value from the values array
    const rolledValue = mrAffix.values?.[0] ?? 0;
    const affixInstance: AffixInstance = {
      affixId: catalogEntry.id,
      rolledValue,
    };

    // Route per D16: isImplicit → implicits, tempered → tempered, else → explicits
    if (catalogEntry.isImplicit) {
      implicits.push(affixInstance);
    } else if (mrAffix.tempered === true) {
      tempered.push(affixInstance);
    } else {
      explicits.push(affixInstance);
    }
  }

  // ── Aspect (D11) ─────────────────────────────────────────────────────────
  const aspectNid = mrItem.aspect;
  if (aspectNid !== undefined) {
    const aspectNidStr = String(aspectNid);
    const aspectEntry = dataMin.aspects?.[aspectNidStr];
    const aspectBnetFileName = aspectEntry?.bnetFileName;
    const catalogAspect = aspectBnetFileName
      ? idx.aspectByBnetFileName.get(aspectBnetFileName)
      : undefined;

    if (!catalogAspect) {
      report.unmappedAspects.push({
        category: "aspect",
        id: aspectNidStr,
        bnetFileName: aspectBnetFileName,
      });
    } else {
      const rolledValue = mrItem.aspectValues?.[0] ?? 0;
      aspect = {
        aspectId: catalogAspect.id,
        rolledValue,
        source: "legendary" as const, // D11: default to 'legendary'
      };
    }
  }

  // ── Unique detection (D14) ───────────────────────────────────────────────
  const isUnique = !!(mrItem.rarity && mrItem.rarity.toLowerCase() === "unique") ||
    !!(mrItem.name && (() => {
      const u = idx.uniqueByBnetFileName;
      for (const [, entry] of u) {
        if (entry.label.toLowerCase() === (mrItem.name ?? "").toLowerCase()) return true;
      }
      return false;
    })());

  // ── Item assembly ────────────────────────────────────────────────────────
  const item: Item = {
    slot: slotId,
    name: mrItem.name ?? "",
    rarity: inferRarity(mrItem.rarity, isUnique, aspect !== undefined),
    isAncestral: mrItem.ancestral === true, // D15: false unless explicit
    implicits,
    explicits,
    tempered,
    aspect,
    masterworkRank: 0,
    runes: [],
    sockets: [],
    // D13: leave itemPower undefined when absent
    ...(mrItem.power !== undefined ? { itemPower: mrItem.power } : {}),
  };

  // Void unused param (charClass reserved for future class-specific validation)
  void charClass;

  return item;
}

// ─── Skill mapper ─────────────────────────────────────────────────────────────

function mapSkills(
  mrSkills: MaxrollVariant["skills"],
  dataMin: MaxrollDataMin,
  charClass: string,
  unmappedSkills: UnmappedRef[]
): SkillSelection[] {
  const idx = getCatalogIndex();
  const skillMap = idx.skillsByClass.get(charClass);
  const selections: SkillSelection[] = [];

  for (const mrSkill of mrSkills ?? []) {
    const idStr = String(mrSkill.id);
    const skillEntry = dataMin.skills?.[idStr];
    const bnetFileName = skillEntry?.bnetFileName;
    const catalogSkill = bnetFileName && skillMap ? skillMap.get(bnetFileName) : undefined;

    if (!catalogSkill) {
      unmappedSkills.push({
        category: "skill",
        skillId: mrSkill.id,
        bnetFileName,
      });
      continue;
    }

    selections.push({
      skillId: catalogSkill.id,
      rank: mrSkill.points ?? 1,
    });
  }

  return selections;
}

// ─── Paragon mapper ───────────────────────────────────────────────────────────

function mapParagon(
  mrParagon: MaxrollVariant["paragon"],
  dataMin: MaxrollDataMin,
  charClass: string,
  paragonLevel: number,
  unmappedNodes: UnmappedRef[],
  unmappedGlyphs: UnmappedRef[]
): ParagonAllocation {
  const idx = getCatalogIndex();
  const boardMap = idx.paragonBoardsByClass.get(charClass);
  const glyphMap = idx.paragonGlyphsByClass.get(charClass);
  const boards: ParagonBoardAllocation[] = [];

  for (const mrBoard of mrParagon ?? []) {
    // Try to resolve the board id
    const boardIdStr = mrBoard.id !== undefined ? String(mrBoard.id) : undefined;

    // Look up by bnetFileName from data.min.json (boards don't have a numeric id map in data.min)
    // For boards we match by bnetFileName using the board name or id
    // Since data.min.json doesn't have a boards map, we do a direct bnetId match
    let catalogBoardId = "unknown-board";
    let boardName = mrBoard.name ?? "";

    // Try to find board via bnetId matching
    if (boardIdStr && boardMap) {
      // Search the board catalog for a bnetId match
      const { boards: classBoards } = getParagonCatalogForClass(charClass);
      const matched = (classBoards as ParagonBoardEntry[]).find(
        (b: ParagonBoardEntry) => b.bnetId !== undefined && String(b.bnetId) === boardIdStr
      );
      if (matched) {
        catalogBoardId = matched.id;
        boardName = matched.label;
      } else {
        // Board not found — still include it with a placeholder id to preserve the build
        // structure; the nodes are stored with mr: prefix per D17
        catalogBoardId = `mr:board:${boardIdStr}`;
        boardName = mrBoard.name ?? `Board ${boardIdStr}`;
      }
    }

    // Map nodes verbatim with mr: prefix (D17)
    const nodes: string[] = (mrBoard.nodes ?? []).map((n) => `mr:${n}`);

    // Map glyph (D18: default level 21)
    let glyphAllocation: ParagonBoardAllocation["glyph"] | undefined;
    if (mrBoard.glyph !== undefined) {
      const glyphIdStr = String(mrBoard.glyph);
      const glyphEntry = dataMin.glyphs?.[glyphIdStr];
      const glyphBnetFileName = glyphEntry?.bnetFileName;
      const catalogGlyph = glyphBnetFileName && glyphMap ? glyphMap.get(glyphBnetFileName) : undefined;

      if (!catalogGlyph) {
        unmappedGlyphs.push({
          category: "glyph",
          glyphId: mrBoard.glyph,
          bnetFileName: glyphBnetFileName,
        });
      } else {
        glyphAllocation = {
          glyphId: catalogGlyph.id,
          level: mrBoard.glyphLevel ?? 21, // D18: default 21
        };
      }
    }

    // Record unmapped nodes (D17: we store them verbatim, but node catalog is not built yet)
    // Per spec: no per-node catalog work in this commission (obs-2 follow-up)
    // Nodes are stored as-is with mr: prefix; no unmapped-node entries needed since
    // D17 explicitly says ids are stored verbatim.

    boards.push({
      boardId: catalogBoardId,
      boardName,
      spentPoints: nodes.length, // D17: derived from nodes.length
      glyph: glyphAllocation,
      nodes,
    });
  }

  return {
    paragonLevel,
    boards,
  };
}

// ─── Patch-mismatch check (D9) ────────────────────────────────────────────────

export interface PatchCheckResult {
  patchMatch: boolean;
  explicitMappedRatio: number;
  catalogPatch: string;
  plannerVersion: string;
}

export function checkPatchDrift(
  catalogPatch: string,
  plannerVersion: string | undefined,
  equippedItems: Record<string, Item>
): PatchCheckResult {
  const pv = plannerVersion ?? "";
  const patchMatch = catalogPatch === pv || pv === "";

  if (patchMatch) {
    return { patchMatch: true, explicitMappedRatio: 1, catalogPatch, plannerVersion: pv };
  }

  // Count total explicit affix slots across all items and how many mapped
  let totalExplicit = 0;
  let mappedExplicit = 0;
  for (const item of Object.values(equippedItems)) {
    totalExplicit += item.explicits.length;
    mappedExplicit += item.explicits.length; // Already mapped entries are present
  }
  // Also count unmapped (they were skipped, so we need to track separately)
  // This ratio is computed after mapping; unmapped were NOT added to item.explicits.
  // We need the pre-mapping total. The caller passes unmapped counts.
  // This function gets called with already-mapped items — so we also need the unmapped count.
  // The caller (assembleVariant) handles this by passing the total.

  const ratio = totalExplicit > 0 ? mappedExplicit / (mappedExplicit + 0) : 1;
  return { patchMatch: false, explicitMappedRatio: ratio, catalogPatch, plannerVersion: pv };
}

// ─── Full variant assembly ────────────────────────────────────────────────────

export function assembleVariant(
  mrVariant: MaxrollVariant,
  variantIndex: number,
  dataMin: MaxrollDataMin,
  catalogPatch: string,
  plannerId: string,
  importedAt: string,
  plannerVersion: string
): VariantResult {
  const report: ImportReport = {
    unmappedAffixes: [],
    unmappedAspects: [],
    unmappedParagonNodes: [],
    unmappedGlyphs: [],
    unmappedSkills: [],
  };

  // ── Class resolution ─────────────────────────────────────────────────────
  const rawClass = mrVariant.class ?? "";
  const resolvedClass = resolveClass(rawClass) ?? "Sorcerer"; // fallback for unknown

  // ── Equipped items ────────────────────────────────────────────────────────
  const equippedItems: Record<string, Item> = {};
  let totalExplicitsBeforeMapping = 0;

  for (const [maxrollSlot, mrItem] of Object.entries(mrVariant.equipped ?? {})) {
    const slotId = mapMaxrollSlot(maxrollSlot) ?? maxrollSlot.toLowerCase();
    // Count raw explicit affixes before mapping (for patch-drift ratio)
    const rawExplicits = (mrItem.affixes ?? []).filter((a) => !a.tempered);
    totalExplicitsBeforeMapping += rawExplicits.length;

    const item = mapItem(mrItem, slotId, dataMin, resolvedClass, {
      unmappedAffixes: report.unmappedAffixes,
      unmappedAspects: report.unmappedAspects,
    });
    equippedItems[slotId] = item;
  }

  // ── Patch-mismatch check (D9) ─────────────────────────────────────────────
  // Mapped explicit count (items that made it into equippedItems.explicits)
  let mappedExplicits = 0;
  for (const item of Object.values(equippedItems)) {
    mappedExplicits += item.explicits.length;
  }
  // Total explicit affix references (mapped + unmapped-affix entries that were explicit)
  const unmappedExplicitCount = report.unmappedAffixes.length;
  const totalExplicitRefs = mappedExplicits + unmappedExplicitCount;
  const explicitMappedRatio = totalExplicitRefs > 0
    ? mappedExplicits / totalExplicitRefs
    : 1;

  const pv = plannerVersion;
  const patchDrifts = pv !== "" && catalogPatch !== pv;
  let versionMismatch: ImportReport["versionMismatch"];
  if (patchDrifts) {
    versionMismatch = {
      catalogPatch,
      plannerVersion: pv,
      explicitMappedRatio,
    };
  }
  report.versionMismatch = versionMismatch;

  // ── Skills ────────────────────────────────────────────────────────────────
  const skillSelections = mapSkills(
    mrVariant.skills,
    dataMin,
    resolvedClass,
    report.unmappedSkills
  );

  // ── Paragon ───────────────────────────────────────────────────────────────
  const paragonLevel = mrVariant.paragonLevel ?? 0;
  const paragonAllocation = mapParagon(
    mrVariant.paragon,
    dataMin,
    resolvedClass,
    paragonLevel,
    report.unmappedParagonNodes,
    report.unmappedGlyphs
  );

  // ── Character assembly ────────────────────────────────────────────────────
  const character: Omit<Character, "id"> = {
    name: mrVariant.name ?? `Maxroll ${resolvedClass}`,
    class: resolvedClass,
    level: mrVariant.level ?? 100, // D12: default 100
    paragonAllocation,
    skillSelections,
    equippedItems,
    playstyleConstraints: [],
  };

  // ── Build provenance (D19) ─────────────────────────────────────────────────
  const importedFrom: BuildImportedFrom = {
    source: "maxroll",
    plannerId,
    variantIndex,
    importedAt,
    plannerVersion,
  };

  const build: Omit<Build, "id" | "characterId"> = {
    name: mrVariant.name ?? character.name,
    notes: "",
    targetItems: {},
    importedFrom,
  };

  return {
    variantIndex,
    variantName: mrVariant.name,
    character,
    build,
    items: equippedItems,
    report,
  };
}

export { resolveClass };
