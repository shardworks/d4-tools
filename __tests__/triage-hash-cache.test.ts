/**
 * Unit tests for lib/triage/hash-cache.ts
 *
 * Covers:
 *  - miss → compute invoked → cache populated
 *  - hit when (filename, mtimeMs, size) unchanged → compute NOT invoked
 *  - mtime change → miss → recompute
 *  - size change at same mtime → miss → recompute
 *  - thunk throws → cache unchanged → error propagates (D10)
 *  - forget(filename) removes a present entry; is a no-op on absent entries (D4)
 *  - pruneNotIn(set) removes entries absent from set; leaves matching entries intact (D5)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getCachedHash, forget, pruneNotIn } from "../lib/triage/hash-cache";

// Reset the cache before every test by pruning all entries.
// pruneNotIn(empty set) drops every key — using the public API (D8) keeps us
// from having to export a test-only reset function.
beforeEach(() => {
  pruneNotIn(new Set());
});

describe("getCachedHash", () => {
  it("miss: compute is invoked and result is returned", async () => {
    let calls = 0;
    const compute = async () => { calls++; return "hash-a"; };

    const result = await getCachedHash("file.png", 1000, 512, compute);

    expect(result).toBe("hash-a");
    expect(calls).toBe(1);
  });

  it("miss: cache is populated after first call", async () => {
    let calls = 0;
    const compute = async () => { calls++; return "hash-b"; };

    await getCachedHash("file.png", 1000, 512, compute);

    // Second call with same tuple → should hit the cache
    const result2 = await getCachedHash("file.png", 1000, 512, async () => {
      throw new Error("should not be called");
    });

    expect(result2).toBe("hash-b");
    expect(calls).toBe(1); // compute was called exactly once
  });

  it("hit: compute NOT invoked when (filename, mtimeMs, size) is unchanged", async () => {
    const compute = async () => "hash-c";
    await getCachedHash("photo.png", 2000, 1024, compute);

    let secondCalls = 0;
    const result = await getCachedHash("photo.png", 2000, 1024, async () => {
      secondCalls++;
      return "should-not-be-used";
    });

    expect(result).toBe("hash-c");
    expect(secondCalls).toBe(0);
  });

  it("mtime change → miss → recompute", async () => {
    await getCachedHash("img.png", 1000, 512, async () => "old-hash");

    let calls = 0;
    const result = await getCachedHash("img.png", 9999, 512, async () => {
      calls++;
      return "new-hash";
    });

    expect(result).toBe("new-hash");
    expect(calls).toBe(1);
  });

  it("size change at same mtime → miss → recompute", async () => {
    await getCachedHash("img.png", 5000, 100, async () => "old-hash");

    let calls = 0;
    const result = await getCachedHash("img.png", 5000, 999, async () => {
      calls++;
      return "resized-hash";
    });

    expect(result).toBe("resized-hash");
    expect(calls).toBe(1);
  });

  it("thunk throws → cache left unmodified → error propagates (D10)", async () => {
    const boom = new Error("disk read failed");
    await expect(
      getCachedHash("bad.png", 3000, 256, async () => { throw boom; })
    ).rejects.toThrow("disk read failed");

    // Cache was NOT populated; a subsequent call still invokes compute
    let calls = 0;
    await getCachedHash("bad.png", 3000, 256, async () => { calls++; return "recovered"; });
    expect(calls).toBe(1);
  });

  it("different filenames are independent cache entries", async () => {
    await getCachedHash("a.png", 100, 50, async () => "hash-a");
    await getCachedHash("b.png", 100, 50, async () => "hash-b");

    let aCalls = 0, bCalls = 0;
    const ra = await getCachedHash("a.png", 100, 50, async () => { aCalls++; return "?"; });
    const rb = await getCachedHash("b.png", 100, 50, async () => { bCalls++; return "?"; });

    expect(ra).toBe("hash-a");
    expect(rb).toBe("hash-b");
    expect(aCalls).toBe(0);
    expect(bCalls).toBe(0);
  });
});

describe("forget", () => {
  it("removes an existing entry so the next call is a miss", async () => {
    await getCachedHash("forget-me.png", 1000, 512, async () => "original");
    forget("forget-me.png");

    let calls = 0;
    const result = await getCachedHash("forget-me.png", 1000, 512, async () => {
      calls++;
      return "recomputed";
    });

    expect(result).toBe("recomputed");
    expect(calls).toBe(1);
  });

  it("is a no-op on absent entries (does not throw)", () => {
    expect(() => forget("never-cached.png")).not.toThrow();
  });
});

describe("pruneNotIn", () => {
  it("removes entries whose filenames are absent from the set", async () => {
    await getCachedHash("keep.png", 1, 1, async () => "hash-keep");
    await getCachedHash("drop.png", 2, 2, async () => "hash-drop");

    pruneNotIn(new Set(["keep.png"]));

    // keep.png still hits
    let keepCalls = 0;
    const kept = await getCachedHash("keep.png", 1, 1, async () => {
      keepCalls++;
      return "recomputed-keep";
    });
    expect(kept).toBe("hash-keep");
    expect(keepCalls).toBe(0);

    // drop.png is a miss
    let dropCalls = 0;
    await getCachedHash("drop.png", 2, 2, async () => { dropCalls++; return "recomputed-drop"; });
    expect(dropCalls).toBe(1);
  });

  it("leaves all entries intact when every filename is in the set", async () => {
    await getCachedHash("a.png", 1, 1, async () => "ha");
    await getCachedHash("b.png", 2, 2, async () => "hb");

    pruneNotIn(new Set(["a.png", "b.png", "extra-name.png"]));

    let calls = 0;
    await getCachedHash("a.png", 1, 1, async () => { calls++; return "?"; });
    await getCachedHash("b.png", 2, 2, async () => { calls++; return "?"; });
    expect(calls).toBe(0);
  });

  it("clears all entries when given an empty set", async () => {
    await getCachedHash("x.png", 1, 1, async () => "hx");
    await getCachedHash("y.png", 2, 2, async () => "hy");

    pruneNotIn(new Set());

    let calls = 0;
    await getCachedHash("x.png", 1, 1, async () => { calls++; return "rx"; });
    await getCachedHash("y.png", 2, 2, async () => { calls++; return "ry"; });
    expect(calls).toBe(2);
  });
});
