import { describe, expect, test } from "bun:test";
import { createReviewRecord, parseReviewInput } from "../minimal-backend/server/lib/core.js";

describe("chapter review core", () => {
  test("normalizes bounded review input", () => {
    expect(parseReviewInput({ chapterId: " ch-1 ", summary: "  clear ending  " })).toEqual({
      ok: true,
      value: { chapterId: "ch-1", summary: "clear ending" },
    });
  });

  test("rejects missing or oversized fields", () => {
    expect(parseReviewInput({ chapterId: "", summary: "ok" }).ok).toBe(false);
    expect(parseReviewInput({ chapterId: "ch-1", summary: "" }).ok).toBe(false);
    expect(parseReviewInput({ chapterId: "ch-1", summary: "x".repeat(4001) }).ok).toBe(false);
  });

  test("creates deterministic records when time is supplied", () => {
    expect(createReviewRecord({ chapterId: "ch-1", summary: "ok" }, "2026-09-08T00:00:00.000Z")).toEqual({
      ok: true,
      value: {
        chapterId: "ch-1",
        summary: "ok",
        createdAt: "2026-09-08T00:00:00.000Z",
      },
    });
  });
});
