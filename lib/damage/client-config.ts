/**
 * Browser-safe damage config.
 *
 * Exports the upstream baseline config as a plain constant — no fs, no Node.js
 * APIs. Client components import this to run the engine at render-time (D23).
 *
 * If a local override (data/damage-config.local.json) is relevant for
 * server-side computation, use loadDamageConfig() from "./config" instead
 * (server-only — uses fs.readFileSync).
 */

import type { DamageConfig } from "./config";
import upstreamConfig from "./config.json";

/**
 * The upstream baseline damage config, as bundled at build time.
 * Safe to import in "use client" components.
 */
export const baseConfig: DamageConfig = upstreamConfig as unknown as DamageConfig;
