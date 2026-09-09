const MAX_CHAPTER_ID = 128;
const MAX_SUMMARY = 4000;

export function parseReviewInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "input must be an object" };
  }
  const chapterId = typeof input.chapterId === "string" ? input.chapterId.trim() : "";
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  if (!chapterId || chapterId.length > MAX_CHAPTER_ID) {
    return { ok: false, reason: "chapterId is required and bounded" };
  }
  if (!summary || summary.length > MAX_SUMMARY) {
    return { ok: false, reason: "summary is required and bounded" };
  }
  return { ok: true, value: { chapterId, summary } };
}

export function createReviewRecord(input, now = new Date().toISOString()) {
  const parsed = parseReviewInput(input);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    value: {
      chapterId: parsed.value.chapterId,
      summary: parsed.value.summary,
      createdAt: now,
    },
  };
}
