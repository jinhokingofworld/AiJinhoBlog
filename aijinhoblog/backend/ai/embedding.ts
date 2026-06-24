import {
  RetryableRequestError,
  type RetryFetchResult,
  fetchJsonWithRetry,
} from "@/backend/ai/http";
import "@/backend/core/env";

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

// OpenAI embedding 호출 래퍼입니다.
// RAG와 벡터 인덱싱은 모두 "텍스트 -> 숫자 배열" 변환이 필요하고, 이 파일이 그 외부 API 경계입니다.
export class EmbeddingSkippedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingSkippedError";
  }
}

export class EmbeddingProviderError extends Error {
  durationMs?: number;
  retryAttempts?: number;
  status?: number;

  constructor(
    message: string,
    options: {
      durationMs?: number;
      retryAttempts?: number;
      status?: number;
    } = {},
  ) {
    super(message);
    this.name = "EmbeddingProviderError";
    this.durationMs = options.durationMs;
    this.retryAttempts = options.retryAttempts;
    this.status = options.status;
  }
}

export type EmbeddingUsage = {
  inputTokens: number | null;
  totalTokens: number | null;
};

export type EmbeddingResult = {
  embeddings: number[][];
  durationMs?: number;
  model: string;
  retryAttempts?: number;
  usage: EmbeddingUsage;
};

export type EmbeddingClient = {
  embedDocuments(texts: string[]): Promise<EmbeddingResult>;
};

type OpenAIEmbeddingResponse = {
  data?: Array<{
    embedding?: number[];
  }>;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

function getOpenAIKey(apiKey?: string) {
  return apiKey ?? process.env.OPENAI_API_KEY ?? "";
}

export function createOpenAIEmbeddingClient(options: { apiKey?: string; model?: string } = {}) {
  const apiKey = getOpenAIKey(options.apiKey);
  const model = options.model ?? process.env.OPENAI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;

  const client: EmbeddingClient = {
    async embedDocuments(texts) {
      // 실전 구현 포인트: OPENAI_API_KEY가 없으면 전체 앱을 죽이지 않고 SKIPPED 에러로 흐름을 분기합니다.
      // 호출부는 이 에러를 받아 "AI 기능만 건너뜀" 상태로 DB에 기록합니다.
      if (!apiKey) {
        throw new EmbeddingSkippedError("OPENAI_API_KEY가 없어 embedding 생성을 건너뜁니다.");
      }

      if (!texts.length) {
        return {
          embeddings: [],
          model,
          usage: {
            inputTokens: 0,
            totalTokens: 0,
          },
        };
      }

      let result: RetryFetchResult<OpenAIEmbeddingResponse>;

      try {
        // OpenAI Embeddings API 호출 지점입니다.
        // fetchJsonWithRetry가 timeout/retry를 담당하고, 실패는 EmbeddingProviderError로 감싸 상위 계층이 같은 방식으로 처리합니다.
        result = await fetchJsonWithRetry<OpenAIEmbeddingResponse>(
          "https://api.openai.com/v1/embeddings",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              input: texts,
              model,
            }),
          },
          {
            timeoutMs: 20_000,
          },
        );
      } catch (error) {
        if (error instanceof RetryableRequestError) {
          throw new EmbeddingProviderError(error.message, {
            durationMs: error.durationMs,
            retryAttempts: error.attempts,
            status: error.status,
          });
        }

        throw new EmbeddingProviderError(
          error instanceof Error ? error.message : "OpenAI embedding 요청이 실패했습니다.",
        );
      }

      const body = result.data;

      const embeddings = body?.data?.map((item) => item.embedding).filter(Boolean) as number[][];

      if (!embeddings || embeddings.length !== texts.length) {
        throw new EmbeddingProviderError(
          "OpenAI embedding 응답 개수가 요청 chunk 개수와 다릅니다.",
        );
      }

      return {
        embeddings,
        durationMs: result.durationMs,
        model: body?.model ?? model,
        retryAttempts: result.attempts,
        usage: {
          inputTokens: body?.usage?.prompt_tokens ?? null,
          totalTokens: body?.usage?.total_tokens ?? null,
        },
      };
    },
  };

  return client;
}
