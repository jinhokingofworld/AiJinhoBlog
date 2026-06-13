import {
  RetryableRequestError,
  type RetryFetchResult,
  fetchJsonWithRetry,
} from "@/backend/ai-http";

export const DEFAULT_RAG_MODEL = "gpt-4o-mini";

export class GenerationSkippedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationSkippedError";
  }
}

export class GenerationProviderError extends Error {
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
    this.name = "GenerationProviderError";
    this.durationMs = options.durationMs;
    this.retryAttempts = options.retryAttempts;
    this.status = options.status;
  }
}

export type GenerationUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type GenerationResult = {
  durationMs?: number;
  model: string;
  retryAttempts?: number;
  text: string;
  usage: GenerationUsage;
};

export type GenerationClient = {
  generateAnswer(input: { context: string; question: string }): Promise<GenerationResult>;
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  model?: string;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  };
};

function getOpenAIKey(apiKey?: string) {
  return apiKey ?? process.env.OPENAI_API_KEY ?? "";
}

export function createOpenAIGenerationClient(options: { apiKey?: string; model?: string } = {}) {
  const apiKey = getOpenAIKey(options.apiKey);
  const model =
    options.model ??
    process.env.OPENAI_RAG_MODEL ??
    process.env.OPENAI_CHAT_MODEL ??
    DEFAULT_RAG_MODEL;

  const client: GenerationClient = {
    async generateAnswer({ context, question }) {
      if (!apiKey) {
        throw new GenerationSkippedError("OPENAI_API_KEY가 없어 답변 생성을 건너뜁니다.");
      }

      let result: RetryFetchResult<OpenAIChatResponse>;

      try {
        result = await fetchJsonWithRetry<OpenAIChatResponse>(
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
                    "너는 개인 블로그와 Markdown 문서 기반 기억 검색 도우미다. 제공된 근거 안에서만 답하고, 근거가 부족하면 부족하다고 말한다. 답변은 한국어로 간결하게 작성한다.",
                },
                {
                  role: "user",
                  content: `질문:\n${question}\n\n근거:\n${context}`,
                },
              ],
              model,
              temperature: 0.2,
            }),
          },
          {
            timeoutMs: 30_000,
          },
        );
      } catch (error) {
        if (error instanceof RetryableRequestError) {
          throw new GenerationProviderError(error.message, {
            durationMs: error.durationMs,
            retryAttempts: error.attempts,
            status: error.status,
          });
        }

        throw new GenerationProviderError(
          error instanceof Error ? error.message : "OpenAI 답변 생성 요청이 실패했습니다.",
        );
      }

      const text = result.data?.choices?.[0]?.message?.content?.trim() ?? "";

      if (!text) {
        throw new GenerationProviderError("OpenAI 답변 생성 응답이 비어 있습니다.", {
          durationMs: result.durationMs,
          retryAttempts: result.attempts,
          status: result.status,
        });
      }

      return {
        durationMs: result.durationMs,
        model: result.data?.model ?? model,
        retryAttempts: result.attempts,
        text,
        usage: {
          inputTokens: result.data?.usage?.prompt_tokens ?? null,
          outputTokens: result.data?.usage?.completion_tokens ?? null,
          totalTokens: result.data?.usage?.total_tokens ?? null,
        },
      };
    },
  };

  return client;
}
