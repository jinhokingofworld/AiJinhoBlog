export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export class EmbeddingSkippedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingSkippedError";
  }
}

export class EmbeddingProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingProviderError";
  }
}

export type EmbeddingUsage = {
  inputTokens: number | null;
  totalTokens: number | null;
};

export type EmbeddingResult = {
  embeddings: number[][];
  model: string;
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

      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: texts,
          model,
        }),
      });
      const body = (await response.json().catch(() => null)) as OpenAIEmbeddingResponse | null;

      if (!response.ok) {
        throw new EmbeddingProviderError(
          body?.error?.message ?? `OpenAI embedding 요청이 실패했습니다. status=${response.status}`,
        );
      }

      const embeddings = body?.data?.map((item) => item.embedding).filter(Boolean) as number[][];

      if (!embeddings || embeddings.length !== texts.length) {
        throw new EmbeddingProviderError(
          "OpenAI embedding 응답 개수가 요청 chunk 개수와 다릅니다.",
        );
      }

      return {
        embeddings,
        model: body?.model ?? model,
        usage: {
          inputTokens: body?.usage?.prompt_tokens ?? null,
          totalTokens: body?.usage?.total_tokens ?? null,
        },
      };
    },
  };

  return client;
}
