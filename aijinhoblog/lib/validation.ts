const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

export const RESERVED_USERNAMES = new Set([
  "account",
  "admin",
  "api",
  "login",
  "new",
  "posts",
  "settings",
  "signup",
  "static",
]);

type Result<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: string;
    };

export type CredentialsInput = {
  email: string;
  password: string;
  name?: string;
  username?: string;
};

export type PostInput = {
  title: string;
  excerpt: string | null;
  content: string;
  tagNames: string[];
};

export type CommentInput = {
  content: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, field: string) {
  const value = source[field];
  return typeof value === "string" ? value.trim() : "";
}

export function isValidEmail(email: string) {
  return EMAIL_PATTERN.test(email);
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function validateUsername(username: string) {
  if (!USERNAME_PATTERN.test(username)) {
    return "username은 영문 소문자, 숫자, 하이픈만 사용해 3자 이상 30자 이하로 작성해야 합니다.";
  }

  if (RESERVED_USERNAMES.has(username)) {
    return "예약된 username입니다.";
  }

  return null;
}

export function normalizeTags(value: unknown) {
  const rawTags = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const item of rawTags) {
    if (typeof item !== "string") {
      continue;
    }

    const tag = item.trim().replace(/^#+/, "").toLowerCase();

    if (!tag || tag.length > 30 || seen.has(tag)) {
      continue;
    }

    seen.add(tag);
    tags.push(tag);

    if (tags.length >= 10) {
      break;
    }
  }

  return tags;
}

export function parseCredentials(
  payload: unknown,
  options: { requireName: boolean; requireUsername?: boolean },
): Result<CredentialsInput> {
  if (!isRecord(payload)) {
    return { ok: false, error: "요청 본문이 올바르지 않습니다." };
  }

  const email = readString(payload, "email").toLowerCase();
  const password = readString(payload, "password");
  const name = readString(payload, "name");
  const username = normalizeUsername(readString(payload, "username"));

  if (!isValidEmail(email)) {
    return { ok: false, error: "이메일 형식이 올바르지 않습니다." };
  }

  if (password.length < 8) {
    return { ok: false, error: "비밀번호는 8자 이상이어야 합니다." };
  }

  if (options.requireName && name.length < 2) {
    return { ok: false, error: "이름은 2자 이상이어야 합니다." };
  }

  if (options.requireUsername) {
    const usernameError = validateUsername(username);

    if (usernameError) {
      return { ok: false, error: usernameError };
    }
  }

  return {
    ok: true,
    value: {
      email,
      password,
      name: name || undefined,
      username: username || undefined,
    },
  };
}

export function parsePostPayload(payload: unknown): Result<PostInput> {
  if (!isRecord(payload)) {
    return { ok: false, error: "요청 본문이 올바르지 않습니다." };
  }

  const title = readString(payload, "title");
  const excerpt = readString(payload, "excerpt");
  const content = readString(payload, "content");
  const tagNames = normalizeTags(payload.tagNames ?? payload.tags);

  if (title.length < 2 || title.length > 160) {
    return { ok: false, error: "제목은 2자 이상 160자 이하로 작성해야 합니다." };
  }

  if (content.length < 10) {
    return { ok: false, error: "본문은 10자 이상 작성해야 합니다." };
  }

  if (excerpt.length > 280) {
    return { ok: false, error: "요약은 280자 이하로 작성해야 합니다." };
  }

  return {
    ok: true,
    value: {
      title,
      excerpt: excerpt || null,
      content,
      tagNames,
    },
  };
}

export function parseCommentPayload(payload: unknown): Result<CommentInput> {
  if (!isRecord(payload)) {
    return { ok: false, error: "요청 본문이 올바르지 않습니다." };
  }

  const content = readString(payload, "content");

  if (content.length < 2) {
    return { ok: false, error: "댓글은 2자 이상 작성해야 합니다." };
  }

  return {
    ok: true,
    value: {
      content,
    },
  };
}

export function parsePositiveInt(
  value: string | null,
  fallback: number,
  options: { min: number; max: number },
) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, options.min), options.max);
}
