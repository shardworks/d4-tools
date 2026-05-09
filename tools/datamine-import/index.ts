/**
 * D4 Datamine Import Tool — entry point
 *
 * Usage:
 *   pnpm import:datamine --build <version> --datamine <path> [--accessed-date YYYY-MM-DD] [--dry-run]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { runImport } from "./orchestrator";

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  build: string | undefined;
  datamine: string | undefined;
  accessedDate: string;
  dryRun: boolean;
} {
  const args = argv.slice(2);
  let build: string | undefined;
  let datamine: string | undefined;
  let accessedDate: string = new Date().toISOString().slice(0, 10);
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--build" && args[i + 1]) {
      build = args[++i];
    } else if (args[i] === "--datamine" && args[i + 1]) {
      datamine = args[++i];
    } else if (args[i] === "--accessed-date" && args[i + 1]) {
      accessedDate = args[++i];
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  return { build, datamine, accessedDate, dryRun };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { build, datamine, accessedDate, dryRun } = parseArgs(process.argv);

  if (!build) {
    console.error("Error: missing --build <version> argument");
    process.exit(2);
  }

  if (!datamine) {
    console.error("Error: missing --datamine <path> argument");
    process.exit(2);
  }

  const datamineAbs = path.resolve(datamine);
  if (!fs.existsSync(datamineAbs)) {
    console.error(`Error: datamine path not found: ${datamineAbs}`);
    process.exit(2);
  }

  console.log(`D4 Datamine Import Tool — build ${build}`);
  if (dryRun) {
    console.log("[dry-run] No files will be written.");
  }

  const projectRoot = path.resolve(__dirname, "../..");
  const { exitCode } = await runImport({
    build,
    accessedDate,
    datamineRoot: datamineAbs,
    dryRun,
    catalogRoot: path.join(projectRoot, "lib/catalog"),
    docsDir: path.join(projectRoot, "docs"),
    curationFile: path.join(__dirname, "curation.json"),
  });

  process.exit(exitCode);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
