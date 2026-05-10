/**
 * Anthropic Vision API stub server for e2e tests (D9, D10).
 *
 * Design:
 *   - In-process Node HTTP server on a caller-chosen port.
 *   - Tests call mockServer.expect("fixture-name") (in-process method) to
 *     register the next CacheEntry fixture before triggering a Parse action.
 *   - POST /__fixture/:name HTTP endpoint is also exposed for cross-process use.
 *   - POST /v1/messages endpoint returns the registered fixture in Anthropic
 *     API response format; falls back to a 500 if no fixture is registered.
 *   - mockServer.expectError() queues a 500 error for the next request.
 *
 * Conversion rules (CacheEntry → AnthropicResponse):
 *   kind:"item"             → tool_use block with items[]
 *   kind:"no-item-detected" → tool_use block with items:[]
 *   kind:"uncertain"        → text block only (no tool_use)
 */

import * as http from "http";
import * as fs from "fs/promises";
import * as path from "path";

export interface CacheEntry {
  kind: "item" | "no-item-detected" | "uncertain";
  items?: unknown[];
  model?: string;
  timestamp?: string;
  raw?: unknown;
}

type QueuedResponse =
  | { type: "fixture"; name: string }
  | { type: "error"; status: number; body: string };

const FIXTURES_DIR = path.join(__dirname, "screenshots");

export class AnthropicMockServer {
  private server: http.Server;
  private queue: QueuedResponse[] = [];
  readonly port: number;

  constructor(port: number) {
    this.port = port;
    this.server = http.createServer((req, res) => {
      this.handle(req, res).catch((err) => {
        console.error("[mock-server] Unhandled error:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    });
  }

  /** Register the next response by fixture name (in-process API). */
  expect(fixtureName: string): void {
    this.queue.push({ type: "fixture", name: fixtureName });
  }

  /** Queue a simulated server error (HTTP 500) for the next Anthropic call. */
  expectError(status = 500, body = '{"type":"error","error":{"type":"overloaded_error","message":"Simulated e2e error"}}'): void {
    this.queue.push({ type: "error", status, body });
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Full endpoint URL matching ANTHROPIC_API_URL value set on the app server. */
  get apiUrl(): string {
    return `${this.url}/v1/messages`;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, "127.0.0.1", () => resolve());
      this.server.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    // --- Registration endpoint: POST /__fixture/:name ---
    const fixtureMatch = url.match(/^\/__fixture\/(.+)$/);
    if (method === "POST" && fixtureMatch) {
      const name = decodeURIComponent(fixtureMatch[1]);
      this.expect(name);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ registered: name }));
      return;
    }

    // --- Anthropic messages endpoint ---
    if (method === "POST" && url.startsWith("/v1/messages")) {
      // Drain request body (required by Node.js HTTP server)
      await drainBody(req);

      const queued = this.queue.shift();
      if (!queued) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No fixture registered for this request" }));
        return;
      }

      if (queued.type === "error") {
        res.writeHead(queued.status, { "Content-Type": "application/json" });
        res.end(queued.body);
        return;
      }

      // Load fixture file and convert to Anthropic response format
      const fixturePath = path.join(FIXTURES_DIR, `${queued.name}-recorded.json`);
      let entry: CacheEntry;
      try {
        const raw = await fs.readFile(fixturePath, "utf-8");
        entry = JSON.parse(raw) as CacheEntry;
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Failed to load fixture '${queued.name}': ${err}` }));
        return;
      }

      const anthropicResponse = cacheEntryToAnthropicResponse(entry);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(anthropicResponse));
      return;
    }

    // --- Health check ---
    if (method === "GET" && url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", queued: this.queue.length }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Not found: ${method} ${url}` }));
  }
}

// ─── CacheEntry → Anthropic response conversion ───────────────────────────────

function cacheEntryToAnthropicResponse(entry: CacheEntry): unknown {
  const model = entry.model ?? "claude-sonnet-4-5-20250929";

  if (entry.kind === "uncertain") {
    return {
      content: [{ type: "text", text: "I cannot reliably parse this screenshot." }],
      stop_reason: "end_turn",
      model,
    };
  }

  const items = entry.kind === "item" ? (entry.items ?? []) : [];

  return {
    content: [
      {
        type: "tool_use",
        id: "toolu_e2e_stub_001",
        name: "record_extracted_items",
        input: { items },
      },
    ],
    stop_reason: "tool_use",
    model,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function drainBody(req: http.IncomingMessage): Promise<void> {
  return new Promise((resolve) => {
    req.on("data", () => {});
    req.on("end", resolve);
    req.on("error", resolve);
  });
}
