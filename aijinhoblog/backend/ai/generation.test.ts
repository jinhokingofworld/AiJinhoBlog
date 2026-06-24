import { describe, expect, it } from "vitest";

import { RAG_SYSTEM_PROMPT } from "@/backend/ai/generation";

describe("RAG generation prompt", () => {
  it("requires plain text answers without Markdown formatting", () => {
    expect(RAG_SYSTEM_PROMPT).toContain("Plain Text");
    expect(RAG_SYSTEM_PROMPT).toContain("Markdown 문법을 사용하지 않는다");
    expect(RAG_SYSTEM_PROMPT).toContain("HTML 태그도 쓰지 않는다");
  });
});
