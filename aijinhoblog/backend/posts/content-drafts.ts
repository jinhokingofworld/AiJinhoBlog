import { createHash } from "node:crypto";

import { fetchJsonWithRetry, RetryableRequestError } from "@/backend/ai/http";
import { createOwnerPost } from "@/backend/posts/service";
import { normalizeKnowledgeText } from "@/backend/ai/text";
import { assertPublicHttpUrl, fetchPublicHttpUrl, UnsafeUrlError } from "@/backend/security/url";
import type { PostInput } from "@/backend/core/validation";

type DraftOptions = {
  folderId?: string | null;
  tagNames?: string[];
  title?: string | null;
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  model?: string;
};

export class ContentDraftError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ContentDraftError";
    this.status = status;
  }
}

function readOpenAIKey() {
  const apiKey = process.env.OPENAI_API_KEY ?? "";

  if (!apiKey) {
    throw new ContentDraftError("OPENAI_API_KEY가 없어 콘텐츠 분석을 실행할 수 없습니다.", 503);
  }

  return apiKey;
}

function createFallbackTitle(prefix: string, source: string) {
  const hash = createHash("sha1").update(source).digest("hex").slice(0, 8);

  return `${prefix} ${hash}`;
}

function extractHtmlTitle(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";

  return normalizeKnowledgeText(title).slice(0, 120);
}

function htmlToPlainText(html: string) {
  return normalizeKnowledgeText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function toContentDraftUrlError(error: unknown) {
  if (error instanceof UnsafeUrlError) {
    return new ContentDraftError(error.message, error.status);
  }

  return error;
}

async function generateDraftContent({
  instruction,
  source,
}: {
  instruction: string;
  source: Array<
    | {
        text: string;
        type: "text";
      }
    | {
        image_url: {
          url: string;
        };
        type: "image_url";
      }
  >;
}) {
  const apiKey = readOpenAIKey();

  try {
    const result = await fetchJsonWithRetry<OpenAIChatResponse>(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "너는 개인 블로그 초안 작성 도우미다. 입력 자료를 바탕으로 한국어 블로그 초안을 작성한다. 과장하지 말고, 확인되지 않은 내용은 추측이라고 표시한다.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: instruction,
                },
                ...source,
              ],
            },
          ],
          model: process.env.OPENAI_RAG_MODEL ?? process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
          temperature: 0.2,
        }),
      },
      {
        timeoutMs: 30_000,
      },
    );
    const content = result.data?.choices?.[0]?.message?.content?.trim() ?? "";

    if (!content) {
      throw new ContentDraftError("콘텐츠 분석 응답이 비어 있습니다.", 502);
    }

    return content;
  } catch (error) {
    if (error instanceof ContentDraftError) {
      throw error;
    }

    if (error instanceof RetryableRequestError) {
      throw new ContentDraftError(error.message, error.status ?? 502);
    }

    throw new ContentDraftError(
      error instanceof Error ? error.message : "콘텐츠 분석에 실패했습니다.",
      502,
    );
  }
}

function createDraftInput({
  content,
  folderId,
  tagNames,
  title,
}: {
  content: string;
  folderId?: string | null;
  tagNames?: string[];
  title: string;
}): PostInput {
  return {
    content,
    excerpt: content.replace(/\s+/g, " ").slice(0, 180),
    folderId: folderId ?? null,
    status: "DRAFT",
    tagNames: tagNames ?? [],
    title: title.slice(0, 160),
    visibility: "PRIVATE",
  };
}

export async function createDraftFromLink({
  options = {},
  ownerId,
  url,
}: {
  options?: DraftOptions;
  ownerId: string;
  url: string;
}) {
  try {
    const parsedUrl = await assertPublicHttpUrl(url);
    const response = await fetchPublicHttpUrl(parsedUrl, {
      headers: {
        "User-Agent": "AiJinhoBlog MCP/1.0",
      },
    });

    if (!response.ok) {
      throw new ContentDraftError(
        `링크 본문을 가져오지 못했습니다. status=${response.status}`,
        502,
      );
    }

    const sourceUrl = parsedUrl.toString();
    const html = await response.text();
    const sourceText = htmlToPlainText(html).slice(0, 12_000);
    const title =
      options.title ?? extractHtmlTitle(html) ?? createFallbackTitle("링크 초안", sourceUrl);
    const draft = await generateDraftContent({
      instruction: `다음 링크 자료를 블로그 초안으로 정리해줘.\nURL: ${sourceUrl}\n\n요구사항:\n- 핵심 요약\n- 글감으로 쓸 관점\n- 출처 URL 표시`,
      source: [
        {
          text: sourceText || sourceUrl,
          type: "text",
        },
      ],
    });

    return createOwnerPost(
      ownerId,
      createDraftInput({
        content: `출처: ${sourceUrl}\n\n${draft}`,
        folderId: options.folderId,
        tagNames: options.tagNames,
        title,
      }),
    );
  } catch (error) {
    throw toContentDraftUrlError(error);
  }
}

export async function createDraftFromImage({
  imageUrl,
  options = {},
  ownerId,
  prompt,
}: {
  imageUrl: string;
  options?: DraftOptions;
  ownerId: string;
  prompt?: string | null;
}) {
  try {
    const parsedUrl = await assertPublicHttpUrl(imageUrl);
    const sourceUrl = parsedUrl.toString();

    const title = options.title ?? createFallbackTitle("이미지 초안", sourceUrl);
    const draft = await generateDraftContent({
      instruction: [
        "이미지를 분석해 블로그 초안으로 정리해줘.",
        prompt ? `사용자 요청: ${prompt}` : null,
        "요구사항:",
        "- 이미지에서 관찰되는 내용",
        "- 글감으로 발전시킬 수 있는 관점",
        "- 확인 불가능한 내용은 추측이라고 표시",
      ]
        .filter(Boolean)
        .join("\n"),
      source: [
        {
          image_url: {
            url: sourceUrl,
          },
          type: "image_url",
        },
      ],
    });

    return createOwnerPost(
      ownerId,
      createDraftInput({
        content: `이미지: ${sourceUrl}\n\n${draft}`,
        folderId: options.folderId,
        tagNames: options.tagNames,
        title,
      }),
    );
  } catch (error) {
    throw toContentDraftUrlError(error);
  }
}
