/**
 * One-shot remediation script: matches catalog entries that lack `bnetFileName`
 * against real DiabloTools/d4data files using label-based lookup.
 *
 * Reads:
 *   - lib/catalog/affixes.json
 *   - lib/catalog/aspects.json
 *   - lib/catalog/uniques.json
 *   - <datamine>/json/base/meta/Affix/*.aff.json
 *   - <datamine>/json/base/meta/Aspect/*.asp.json
 *   - <datamine>/json/base/meta/Item/*.itm.json
 *   - <datamine>/json/enUS_Text/meta/StringList/Affix_legendary_*.stl.json
 *   - <datamine>/json/enUS_Text/meta/StringList/Item_*.stl.json
 *
 * Writes (in place):
 *   - Same catalog files, with `bnetId` and `bnetFileName` populated for any
 *     entry where a confident label match was found in the datamine.
 *
 * Run: pnpm tsx tools/datamine-import/match-fabricated.ts /workspace/d4data
 */

import * as fs from "fs";
import * as path from "path";

const datamineRoot = process.argv[2];
if (!datamineRoot) {
  console.error("Usage: pnpm tsx tools/datamine-import/match-fabricated.ts <datamine-root>");
  process.exit(2);
}

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const STL_DIR = path.join(datamineRoot, "json/base/meta");

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
}

function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Aspect-specific normalization: strips "aspect", "of", "the", "'s" etc.
 * Used to match catalog "Aspect of the Elements" against datamine "of the Elements"
 * or "Flamethrower Aspect" against datamine "Flamethrower's".
 */
function normalizeAspectName(s: string): string {
  return s
    .toLowerCase()
    .replace(/['']s\b/g, "") // strip possessive 's
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(aspect|of|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface DatamineEntry {
  fileName: string; // basename without extension
  snoId: number;
  label: string;
}

// ─── Build aspect label → file map from Affix/legendary_*.aff.json + stl ────

function buildAspectLabelMap(): Map<string, DatamineEntry[]> {
  const map = new Map<string, DatamineEntry[]>();
  const affixDir = path.join(datamineRoot, "json/base/meta/Affix");
  const stlDir = path.join(datamineRoot, "json/enUS_Text/meta/StringList");
  if (!fs.existsSync(affixDir) || !fs.existsSync(stlDir)) {
    console.error(`Missing dir: ${affixDir} or ${stlDir}`);
    return map;
  }

  const stlFiles = fs.readdirSync(stlDir).filter((f) => f.startsWith("Affix_legendary_") && f.endsWith(".stl.json"));
  for (const stlFile of stlFiles) {
    const stlPath = path.join(stlDir, stlFile);
    const stl = loadJson<{ arStrings: { szLabel: string; szText: string }[] }>(stlPath);
    const nameEntry = stl.arStrings.find((e) => e.szLabel === "Name");
    if (!nameEntry || !nameEntry.szText) continue;
    // Filter out placeholders
    if (/DO NOT SHIP|\(PH\)|placeholder/i.test(nameEntry.szText)) continue;

    // Derive basename: stlFile = "Affix_legendary_paladin_001.stl.json"
    //                  → basename "legendary_paladin_001"
    const baseName = stlFile.replace(/^Affix_/, "").replace(/\.stl\.json$/, "");
    const affixPath = path.join(affixDir, `${baseName}.aff.json`);
    if (!fs.existsSync(affixPath)) continue;

    const affix = loadJson<{ __snoID__: number; __fileName__: string }>(affixPath);
    // Index by both strict and aspect-normalized forms so catalog labels can
    // match even when "Aspect" / "of" / "'s" decorations differ between sides.
    const strictNorm = normalizeLabel(nameEntry.szText);
    const aspectNorm = normalizeAspectName(nameEntry.szText);
    for (const norm of [strictNorm, aspectNorm].filter(Boolean)) {
      const arr = map.get(norm) ?? [];
      arr.push({ fileName: baseName, snoId: affix.__snoID__, label: nameEntry.szText });
      map.set(norm, arr);
    }
  }
  return map;
}

// ─── Build unique label → file map from Item/*.itm.json + Item_*.stl.json ───

function buildUniqueLabelMap(): Map<string, DatamineEntry[]> {
  const map = new Map<string, DatamineEntry[]>();
  const itemDir = path.join(datamineRoot, "json/base/meta/Item");
  const stlDir = path.join(datamineRoot, "json/enUS_Text/meta/StringList");
  if (!fs.existsSync(itemDir) || !fs.existsSync(stlDir)) return map;

  const stlFiles = fs.readdirSync(stlDir).filter((f) => f.startsWith("Item_") && f.endsWith(".stl.json"));
  for (const stlFile of stlFiles) {
    const stlPath = path.join(stlDir, stlFile);
    let stl: { arStrings: { szLabel: string; szText: string }[] };
    try {
      stl = loadJson(stlPath);
    } catch {
      continue;
    }
    const nameEntry = stl.arStrings.find((e) => e.szLabel === "Name");
    if (!nameEntry || !nameEntry.szText) continue;
    if (/DO NOT SHIP|\(PH\)|placeholder/i.test(nameEntry.szText)) continue;

    const baseName = stlFile.replace(/^Item_/, "").replace(/\.stl\.json$/, "");
    const itemPath = path.join(itemDir, `${baseName}.itm.json`);
    if (!fs.existsSync(itemPath)) continue;

    let item: { __snoID__: number };
    try {
      item = loadJson(itemPath);
    } catch {
      continue;
    }
    const norm = normalizeLabel(nameEntry.szText);
    const arr = map.get(norm) ?? [];
    arr.push({ fileName: baseName, snoId: item.__snoID__, label: nameEntry.szText });
    map.set(norm, arr);
  }
  return map;
}

// ─── Build affix label → file map from AttributeDescriptions ────────────────
// Affixes match against attribute descriptions. We need a different strategy:
// for each catalog affix without bnetFileName, look at its `attribute.eAttribute`
// (where present) and use that to find Affix files whose first attribute matches.

interface RawAffixForMatching {
  __fileName__: string;
  __snoID__: number;
  eAffixType: number;
  ptItemAffixAttributes: Array<{
    tAttribute: { __eAttribute_name__?: string };
  }>;
}

function buildAffixByAttributeMap(): Map<string, DatamineEntry[]> {
  const map = new Map<string, DatamineEntry[]>();
  const affixDir = path.join(datamineRoot, "json/base/meta/Affix");
  if (!fs.existsSync(affixDir)) return map;

  const files = fs.readdirSync(affixDir).filter((f) => f.endsWith(".aff.json"));
  for (const file of files) {
    let affix: RawAffixForMatching;
    try {
      affix = loadJson(path.join(affixDir, file));
    } catch {
      continue;
    }
    if (affix.eAffixType !== 2) continue; // regular player-rollable only
    const baseName = file.replace(/\.aff\.json$/, "");
    if (/_OLD$|_WIP$|_dev$|_test$|_legacy$|UBERUNIQUE|DONOTSHIP/.test(baseName)) continue;

    const attrName = affix.ptItemAffixAttributes?.[0]?.tAttribute?.__eAttribute_name__;
    if (!attrName) continue;

    const arr = map.get(attrName) ?? [];
    arr.push({ fileName: baseName, snoId: affix.__snoID__, label: attrName });
    map.set(attrName, arr);
  }
  return map;
}

// ─── Match catalog entries ──────────────────────────────────────────────────

interface CatalogAspect {
  id: string;
  label: string;
  bnetId?: number;
  bnetFileName?: string;
  classRestrictions: string[];
}

interface CatalogAffix {
  id: string;
  label: string;
  bnetId?: number;
  bnetFileName?: string;
  attribute?: { eAttribute: string; nParam?: number };
  classRestrictions: string[];
  slotRestrictions: string[];
}

interface CatalogUnique {
  id: string;
  label: string;
  bnetId?: number;
  bnetFileName?: string;
}

function chooseAspectMatch(candidates: DatamineEntry[], catalogAspect: CatalogAspect): DatamineEntry | null {
  if (candidates.length === 0) return null;
  // Prefer: matching class hint in fileName
  const cls = catalogAspect.classRestrictions[0]?.toLowerCase();
  const classKey = cls === "barbarian" ? "barb" : cls === "necromancer" ? "necro" : cls === "sorcerer" ? "sorc" : cls === "spiritborn" ? "sb" : cls === "warlock" ? "warlock" : cls === "paladin" ? "paladin" : cls === "rogue" ? "rogue" : cls === "druid" ? "druid" : null;
  if (classKey) {
    const classMatch = candidates.find((c) => c.fileName.toLowerCase().includes(classKey));
    if (classMatch) return classMatch;
  }
  // Otherwise prefer non-x2 (canonical, not seasonal-variant)
  const canonical = candidates.find((c) => !c.fileName.includes("_x2"));
  return canonical ?? candidates[0];
}

function chooseAffixMatch(candidates: DatamineEntry[], catalogAffix: CatalogAffix): DatamineEntry | null {
  if (candidates.length === 0) return null;
  // Prefer non-S04_/talisman/charm versions
  const canonical = candidates.find((c) => !/^S\d+_|^Talisman_|^Charm_|_MagicOnly$/.test(c.fileName));
  return canonical ?? candidates[0];
}

function chooseUniqueMatch(candidates: DatamineEntry[]): DatamineEntry | null {
  if (candidates.length === 0) return null;
  // Prefer non-seasonal, non-legacy
  const canonical = candidates.find((c) => !/^S\d+_|_OLD$|_legacy$/.test(c.fileName));
  return canonical ?? candidates[0];
}

// ─── Main ───────────────────────────────────────────────────────────────────

const aspectMap = buildAspectLabelMap();
console.log(`Built aspect label map: ${aspectMap.size} unique labels across ${[...aspectMap.values()].reduce((n, v) => n + v.length, 0)} entries`);

const uniqueMap = buildUniqueLabelMap();
console.log(`Built unique label map: ${uniqueMap.size} unique labels across ${[...uniqueMap.values()].reduce((n, v) => n + v.length, 0)} entries`);

const affixAttrMap = buildAffixByAttributeMap();
console.log(`Built affix-by-attribute map: ${affixAttrMap.size} unique attributes across ${[...affixAttrMap.values()].reduce((n, v) => n + v.length, 0)} entries`);

// Patch aspects
type AspectsFile = { aspects: CatalogAspect[]; verifiedAgainst: object };
const aspectsPath = path.join(PROJECT_ROOT, "lib/catalog/aspects.json");
const aspectsFile = loadJson<AspectsFile>(aspectsPath);
let aspectsMatched = 0;
const aspectsUnmatched: string[] = [];
for (const aspect of aspectsFile.aspects) {
  if (aspect.bnetFileName) continue;
  // Try strict normalization first (literal label match), then aspect-form
  // normalization (drop "Aspect" / "of" / "the" / "'s") for community-name
  // → datamine-name matches.
  const strictCandidates = aspectMap.get(normalizeLabel(aspect.label)) ?? [];
  const aspectCandidates = aspectMap.get(normalizeAspectName(aspect.label)) ?? [];
  const seen = new Set<string>();
  const candidates = [...strictCandidates, ...aspectCandidates].filter((c) => {
    if (seen.has(c.fileName)) return false;
    seen.add(c.fileName);
    return true;
  });
  const match = chooseAspectMatch(candidates, aspect);
  if (match) {
    aspect.bnetFileName = match.fileName;
    aspect.bnetId = match.snoId;
    aspectsMatched++;
  } else {
    aspectsUnmatched.push(`${aspect.id} (label="${aspect.label}")`);
  }
}
fs.writeFileSync(aspectsPath, JSON.stringify(aspectsFile, null, 2) + "\n");
console.log(`\nAspects: matched ${aspectsMatched}, unmatched ${aspectsUnmatched.length}`);
if (aspectsUnmatched.length > 0) console.log(`  Unmatched: ${aspectsUnmatched.join(", ")}`);

// Patch uniques
type UniquesFile = { uniques: CatalogUnique[]; verifiedAgainst: object };
const uniquesPath = path.join(PROJECT_ROOT, "lib/catalog/uniques.json");
const uniquesFile = loadJson<UniquesFile>(uniquesPath);
let uniquesMatched = 0;
const uniquesUnmatched: string[] = [];
for (const u of uniquesFile.uniques) {
  if (u.bnetFileName) continue;
  const norm = normalizeLabel(u.label);
  const candidates = uniqueMap.get(norm) ?? [];
  const match = chooseUniqueMatch(candidates);
  if (match) {
    u.bnetFileName = match.fileName;
    u.bnetId = match.snoId;
    uniquesMatched++;
  } else {
    uniquesUnmatched.push(`${u.id} (label="${u.label}")`);
  }
}
fs.writeFileSync(uniquesPath, JSON.stringify(uniquesFile, null, 2) + "\n");
console.log(`\nUniques: matched ${uniquesMatched}, unmatched ${uniquesUnmatched.length}`);
if (uniquesUnmatched.length > 0) console.log(`  Unmatched: ${uniquesUnmatched.join(", ")}`);

// Patch affixes — match by attribute.eAttribute
type AffixesFile = { affixes: CatalogAffix[]; verifiedAgainst: object };
const affixesPath = path.join(PROJECT_ROOT, "lib/catalog/affixes.json");
const affixesFile = loadJson<AffixesFile>(affixesPath);
let affixesMatched = 0;
const affixesUnmatched: string[] = [];
for (const a of affixesFile.affixes) {
  if (a.bnetFileName) continue;
  if (!a.attribute?.eAttribute) {
    affixesUnmatched.push(`${a.id} (no attribute.eAttribute to search by)`);
    continue;
  }
  // Catalog stores "Attr_Foo_Percent"; datamine stores "Foo_Percent". Try both.
  const stripped = a.attribute.eAttribute.replace(/^Attr_/, "");
  const candidates = [
    ...(affixAttrMap.get(a.attribute.eAttribute) ?? []),
    ...(affixAttrMap.get(stripped) ?? []),
  ];
  const match = chooseAffixMatch(candidates, a);
  if (match) {
    a.bnetFileName = match.fileName;
    a.bnetId = match.snoId;
    affixesMatched++;
  } else {
    affixesUnmatched.push(`${a.id} (attribute=${a.attribute.eAttribute})`);
  }
}
fs.writeFileSync(affixesPath, JSON.stringify(affixesFile, null, 2) + "\n");
console.log(`\nAffixes: matched ${affixesMatched}, unmatched ${affixesUnmatched.length}`);
if (affixesUnmatched.length > 0) console.log(`  Unmatched: ${affixesUnmatched.join(", ")}`);

console.log("\nDone.");
