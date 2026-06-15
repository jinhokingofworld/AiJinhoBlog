import { createHash } from "node:crypto";

import { marked } from "marked";

export const DEFAULT_CHUNK_MAX_LENGTH = 1200;
export const DEFAULT_CHUNK_OVERLAP = 120;

export type IndexablePostText = {
  title: string;
  excerpt: string | null;
  content: string;
  status?: string;
  visibility?: string;
  folderId?: string | null;
};

type MarkdownToken = {
  type?: string;
  text?: string;
  raw?: string;
  tokens?: MarkdownToken[];
  items?: MarkdownToken[];
  header?: boolean | MarkdownToken | MarkdownToken[];
  rows?: MarkdownToken[][];
};

function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizePlainText(value: string) {
  return decodeBasicHtmlEntities(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtml(value: string) {
  return decodeBasicHtmlEntities(value)
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, "\n")
    .replace(/<\/(td|th)>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function toMarkdownTokenList(value: unknown): MarkdownToken[] {
  if (Array.isArray(value)) {
    return value.flatMap(toMarkdownTokenList);
  }

  if (value && typeof value === "object") {
    return [value as MarkdownToken];
  }

  return [];
}

function extractMarkdownTokenText(token: MarkdownToken): string[] {
  if (token.type === "space" || token.type === "hr") {
    return [];
  }

  if (token.type === "image") {
    return token.text ? [token.text] : [];
  }

  const nested = [
    ...toMarkdownTokenList(token.tokens),
    ...toMarkdownTokenList(token.items),
    ...toMarkdownTokenList(token.header),
    ...toMarkdownTokenList(token.rows),
  ];

  if (nested.length) {
    const text = nested.flatMap(extractMarkdownTokenText);

    if (
      ["codespan", "del", "em", "heading", "link", "paragraph", "strong", "text"].includes(
        token.type ?? "",
      )
    ) {
      return [
        text
          .join(" ")
          .replace(/[ \t]+/g, " ")
          .trim(),
      ].filter(Boolean);
    }

    return text;
  }

  if (typeof token.text === "string") {
    return [token.text];
  }

  return [];
}

function extractMarkdownText(value: string) {
  const tokens = marked.lexer(value, {
    breaks: true,
    gfm: true,
  }) as unknown as MarkdownToken[];

  return tokens.flatMap(extractMarkdownTokenText).join("\n");
}

export function normalizeKnowledgeText(value: string) {
  const withoutHtml = stripHtml(value);
  const markdownText = extractMarkdownText(withoutHtml);

  return normalizePlainText(markdownText || withoutHtml);
}

export function buildPostIndexText(post: IndexablePostText) {
  return normalizeKnowledgeText(
    [`제목: ${post.title}`, post.excerpt ? `요약: ${post.excerpt}` : null, `본문: ${post.content}`]
      .filter(Boolean)
      .join("\n\n"),
  );
}

function splitLongText(value: string, maxLength: number, overlap: number) {
  const chunks: string[] = [];
  let start = 0;

  while (start < value.length) {
    const end = Math.min(value.length, start + maxLength);
    const chunk = value.slice(start, end).trim();

    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= value.length) {
      break;
    }

    start = Math.max(0, end - overlap);
  }

  return chunks;
}

export function splitTextIntoChunks(
  value: string,
  options: {
    maxLength?: number;
    overlap?: number;
  } = {},
) {
  const maxLength = options.maxLength ?? DEFAULT_CHUNK_MAX_LENGTH;
  const overlap = Math.min(options.overlap ?? DEFAULT_CHUNK_OVERLAP, Math.max(0, maxLength - 1));
  const normalized = normalizeKnowledgeText(value);

  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of normalized.split(/\n{2,}/)) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;

    if (next.length <= maxLength) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (paragraph.length > maxLength) {
      chunks.push(...splitLongText(paragraph, maxLength, overlap));
      current = "";
    } else {
      current = paragraph;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export function createPostContentHash(post: IndexablePostText) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: post.title,
        excerpt: post.excerpt ?? "",
        content: post.content,
        status: post.status ?? "",
        visibility: post.visibility ?? "",
        folderId: post.folderId ?? "",
      }),
    )
    .digest("hex");
}
