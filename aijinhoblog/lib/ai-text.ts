import { createHash } from "node:crypto";

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

function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function normalizeKnowledgeText(value: string) {
  return decodeBasicHtmlEntities(value)
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`{1,3}/g, "")
    .replace(/[*_~>#-]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
