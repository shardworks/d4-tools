/**
 * Direct Anthropic Vision API client for loot screenshot parsing.
 *
 * - No SDK dependency — native fetch only (D28 testing constraint friendly).
 * - Model hardcoded to claude-sonnet-4-5-20250929 (D8).
 * - Tool-use with forced tool_choice for structured output (D7).
 * - Always emits aspect.source = 'legendary' (D11).
 * - ANTHROPIC_API_KEY is read here only — never in client code.
 * - Input is an array of { bytes, mediaType } image entries (D15). The single-
 *   image form has been removed — there is no backward-compat overload. Every
 *   caller passes an array (length 1 in the common single-tooltip path) so that
 *   multi-tooltip batching works uniformly (D6).
 */

import type { CacheEntry, LlmExtractedItem, SupportedImageMediaType } from "./types";

/** Anthropic model snapshot — hardcoded, no env-var override (D8). */
const ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

/**
 * JSON Schema for the record_extracted_items tool input.
 * Mirrors LlmExtractedItem shape.
 */
const EXTRACTED_ITEMS_TOOL = {
  name: "record_extracted_items",
  description:
    "Record all items visible in the screenshot. Call once with all visible items. If no item tooltip is visible, call with an empty items array.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "All item tooltips visible in the screenshot",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Item name as shown in the tooltip (e.g. 'Harlequin Crest')",
            },
            itemType: {
              type: "string",
              description:
                "Item type as shown (e.g. 'Helm', 'Ring', 'Two-Handed Sword', 'Axe', 'Chest Armor')",
            },
            rarity: {
              type: "string",
              description: "Item rarity: Common, Magic, Rare, Legendary, Unique, or Mythic",
            },
            itemPower: {
              type: "number",
              description: "Item Power numeric value if shown",
            },
            isAncestral: {
              type: "boolean",
              description: "True if the item is marked Ancestral",
            },
            implicits: {
              type: "array",
              description: "Implicit (intrinsic/fixed) affixes on the item",
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: "Affix stat name exactly as shown" },
                  rolledValue: { type: "number", description: "Numeric rolled value" },
                },
                required: ["label", "rolledValue"],
              },
            },
            explicits: {
              type: "array",
              description: "Explicit (rolled) affixes on the item",
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: "Affix stat name exactly as shown" },
                  rolledValue: { type: "number", description: "Numeric rolled value" },
                },
                required: ["label", "rolledValue"],
              },
            },
            tempered: {
              type: "array",
              description: "Tempered affixes (from tempering/imprinting) on the item",
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: "Affix stat name exactly as shown" },
                  rolledValue: { type: "number", description: "Numeric rolled value" },
                },
                required: ["label", "rolledValue"],
              },
            },
            aspect: {
              type: "object",
              description: "Legendary or codex aspect if present",
              properties: {
                label: { type: "string", description: "Aspect name exactly as shown" },
                rolledValue: { type: "number", description: "Aspect numeric value" },
              },
              required: ["label", "rolledValue"],
            },
          },
          required: ["name", "itemType", "rarity"],
        },
      },
    },
    required: ["items"],
  },
} as const;

interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

interface AnthropicResponse {
  content: Array<{ type: string } & Partial<AnthropicToolUseBlock>>;
  stop_reason: string;
  model: string;
}

/** One image input to the Anthropic Vision API. */
export interface ImageInput {
  bytes: Buffer;
  mediaType: SupportedImageMediaType;
}

/**
 * Calls the Anthropic Vision API to extract item data from one or more
 * screenshot images.
 *
 * Input is an array of { bytes, mediaType } entries (D15). One image block
 * per entry is emitted in the user message content array; the text prompt
 * follows all image blocks (D6). For the common single-tooltip case, pass an
 * array of length 1.
 *
 * Returns a CacheEntry (item | no-item-detected | uncertain).
 * Errors are surfaced as thrown exceptions — they are NOT cached (D13).
 */
export async function extractItemsFromImage(
  images: ImageInput[]
): Promise<CacheEntry> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is required for screenshot parsing."
    );
  }

  // Build one image content block per input entry (D6)
  const imageBlocks = images.map(({ bytes, mediaType }) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: mediaType,
      data: bytes.toString("base64"),
    },
  }));

  const requestBody = {
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    tools: [EXTRACTED_ITEMS_TOOL],
    tool_choice: { type: "tool", name: "record_extracted_items" },
    messages: [
      {
        role: "user",
        content: [
          ...imageBlocks,
          {
            type: "text",
            text: "Please analyze this Diablo 4 screenshot and extract all item tooltip information you can see. Record every item visible using the record_extracted_items tool. Include all affixes, their exact labels and numeric values as displayed. If no item tooltip is visible, call the tool with an empty items array.",
          },
        ],
      },
    ],
  };

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "(no body)");
    throw new Error(
      `Anthropic API error ${response.status}: ${errorText}`
    );
  }

  const data = (await response.json()) as AnthropicResponse;

  // Find the tool_use block
  const toolUseBlock = data.content.find(
    (block): block is AnthropicToolUseBlock => block.type === "tool_use"
  );

  if (!toolUseBlock) {
    // No tool use — treat as uncertain (LLM didn't follow instructions)
    return {
      kind: "uncertain",
      raw: data,
      model: data.model ?? ANTHROPIC_MODEL,
      timestamp: new Date().toISOString(),
    };
  }

  const toolInput = toolUseBlock.input as { items?: unknown[] };
  const items = toolInput?.items;

  if (!Array.isArray(items) || items.length === 0) {
    return {
      kind: "no-item-detected",
      model: data.model ?? ANTHROPIC_MODEL,
      timestamp: new Date().toISOString(),
    };
  }

  // Parse and lightly normalize each extracted item
  const extractedItems: LlmExtractedItem[] = items.map((rawItem: unknown) => {
    const item = rawItem as Record<string, unknown>;
    return {
      name: String(item.name ?? ""),
      itemType: String(item.itemType ?? ""),
      rarity: String(item.rarity ?? "common").toLowerCase(),
      itemPower: typeof item.itemPower === "number" ? item.itemPower : undefined,
      isAncestral: Boolean(item.isAncestral),
      implicits: normalizeAffixes(item.implicits),
      explicits: normalizeAffixes(item.explicits),
      tempered: normalizeAffixes(item.tempered),
      aspect: normalizeAspect(item.aspect),
    };
  });

  return {
    kind: "item",
    items: extractedItems,
    model: data.model ?? ANTHROPIC_MODEL,
    timestamp: new Date().toISOString(),
  };
}

function normalizeAffixes(raw: unknown): Array<{ label: string; rolledValue: number }> {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a: unknown) => {
    if (typeof a !== "object" || a === null) return [];
    const affix = a as Record<string, unknown>;
    if (typeof affix.label !== "string" || typeof affix.rolledValue !== "number") return [];
    return [{ label: affix.label, rolledValue: affix.rolledValue }];
  });
}

function normalizeAspect(raw: unknown): { label: string; rolledValue: number } | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const a = raw as Record<string, unknown>;
  if (typeof a.label !== "string" || typeof a.rolledValue !== "number") return undefined;
  return { label: a.label, rolledValue: a.rolledValue };
}
