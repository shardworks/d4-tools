/**
 * Env-var endpoint accessors for the two Maxroll upstream origins (D6).
 *
 * Mirrors the lib/triage/anthropic.ts pattern:
 *   MAXROLL_PLANNER_API_BASE — overrides the planner API origin (default: https://planners.maxroll.gg)
 *   MAXROLL_DATA_BASE        — overrides the assets origin (default: https://assets-ng.maxroll.gg)
 *
 * Neither variable appends a path; callers append canonical suffixes.
 * Native fetch only, no SDK dep. Fail-loud on non-2xx (D6 / D28).
 */

/** Returns the Maxroll planner API base URL (no trailing slash). */
export function getMaxrollPlannerApiBase(): string {
  const override = process.env.MAXROLL_PLANNER_API_BASE;
  if (override && override.length > 0) return override.replace(/\/$/, "");
  return "https://planners.maxroll.gg";
}

/** Returns the Maxroll assets/data base URL (no trailing slash). */
export function getMaxrollDataBase(): string {
  const override = process.env.MAXROLL_DATA_BASE;
  if (override && override.length > 0) return override.replace(/\/$/, "");
  return "https://assets-ng.maxroll.gg";
}

/**
 * Fetch a Maxroll URL and return JSON.
 * Throws a structured error on non-2xx responses, including the HTTP status.
 */
export async function fetchMaxrollJson<T>(
  url: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch
): Promise<T> {
  const res = await fetchFn(url, {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(
      `Maxroll fetch failed: HTTP ${res.status} ${res.statusText} at ${url}` +
        (body ? `\n${body.slice(0, 200)}` : "")
    );
    (err as Error & { status: number }).status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

/**
 * Fetch a Maxroll URL and return raw text (used for HTML build-guide extraction).
 * Throws a structured error on non-2xx.
 */
export async function fetchMaxrollText(
  url: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch
): Promise<string> {
  const res = await fetchFn(url);
  if (!res.ok) {
    const err = new Error(
      `Maxroll fetch failed: HTTP ${res.status} ${res.statusText} at ${url}`
    );
    (err as Error & { status: number }).status = res.status;
    throw err;
  }
  return res.text();
}
