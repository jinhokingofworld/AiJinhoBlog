import {
  RetryableRequestError,
  type RetryFetchResult,
  fetchJsonWithRetry,
} from "@/backend/ai-http";

export type VectorMetadata = Record<string, string | number | boolean>;

export type VectorRecord = {
  id: string;
  embedding: number[];
  document: string;
  metadata: VectorMetadata;
};

export type VectorOperationResult = {
  durationMs?: number;
  retryAttempts?: number;
};

export type VectorQueryWhere = Record<string, string | number | boolean>;

export type VectorQueryMatch = {
  distance: number | null;
  document: string;
  id: string;
  metadata: Record<string, unknown>;
};

export type VectorStore = {
  upsert(records: VectorRecord[]): Promise<VectorOperationResult | void>;
  delete(ids: string[]): Promise<VectorOperationResult | void>;
};

export type QueryableVectorStore = VectorStore & {
  query(options: {
    embedding: number[];
    limit: number;
    where?: VectorQueryWhere;
  }): Promise<VectorQueryMatch[]>;
};

type ChromaCollection = {
  id?: string;
  name?: string;
};

export type ChromaOperation = "collection" | "delete" | "query" | "upsert";

export class ChromaVectorStoreError extends Error {
  durationMs?: number;
  operation: ChromaOperation;
  retryAttempts?: number;
  status?: number;

  constructor(
    message: string,
    options: {
      durationMs?: number;
      operation: ChromaOperation;
      retryAttempts?: number;
      status?: number;
    },
  ) {
    super(message);
    this.name = "ChromaVectorStoreError";
    this.durationMs = options.durationMs;
    this.operation = options.operation;
    this.retryAttempts = options.retryAttempts;
    this.status = options.status;
  }
}

function createChromaUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function toOperationResult(result: RetryFetchResult<unknown>): VectorOperationResult {
  return {
    durationMs: result.durationMs,
    retryAttempts: result.attempts,
  };
}

function readQueryValue<T>(value: T[][] | undefined, index: number): T[] {
  return value?.[index] ?? [];
}

async function requestChroma<T>(
  operation: ChromaOperation,
  url: string,
  init: RequestInit,
): Promise<RetryFetchResult<T>> {
  try {
    return await fetchJsonWithRetry<T>(url, init, {
      timeoutMs: 10_000,
    });
  } catch (error) {
    if (error instanceof RetryableRequestError) {
      throw new ChromaVectorStoreError(error.message, {
        durationMs: error.durationMs,
        operation,
        retryAttempts: error.attempts,
        status: error.status,
      });
    }

    throw new ChromaVectorStoreError(
      error instanceof Error ? error.message : "ChromaDB 요청이 실패했습니다.",
      {
        operation,
      },
    );
  }
}

export function createChromaVectorStore(
  options: {
    collectionName?: string;
    database?: string;
    tenant?: string;
    url?: string;
  } = {},
) {
  const chromaUrl = options.url ?? process.env.CHROMA_URL ?? "http://localhost:8000";
  const collectionName = options.collectionName ?? process.env.CHROMA_COLLECTION ?? "blog_posts";
  const tenant = options.tenant ?? process.env.CHROMA_TENANT ?? "default_tenant";
  const database = options.database ?? process.env.CHROMA_DATABASE ?? "default_database";

  async function getCollectionId() {
    const result = await requestChroma<ChromaCollection>(
      "collection",
      createChromaUrl(
        chromaUrl,
        `/api/v2/tenants/${encodeURIComponent(tenant)}/databases/${encodeURIComponent(database)}/collections`,
      ),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: collectionName,
          get_or_create: true,
        }),
      },
    );
    const collection = result.data;

    if (!collection?.id) {
      throw new ChromaVectorStoreError("ChromaDB collection id를 확인할 수 없습니다.", {
        durationMs: result.durationMs,
        operation: "collection",
        retryAttempts: result.attempts,
        status: result.status,
      });
    }

    return {
      collectionId: collection.id,
      result: toOperationResult(result),
    };
  }

  const store: QueryableVectorStore = {
    async upsert(records) {
      if (!records.length) {
        return;
      }

      const collection = await getCollectionId();
      const result = await requestChroma(
        "upsert",
        createChromaUrl(
          chromaUrl,
          `/api/v2/tenants/${encodeURIComponent(tenant)}/databases/${encodeURIComponent(database)}/collections/${encodeURIComponent(collection.collectionId)}/upsert`,
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ids: records.map((record) => record.id),
            embeddings: records.map((record) => record.embedding),
            documents: records.map((record) => record.document),
            metadatas: records.map((record) => record.metadata),
          }),
        },
      );

      return {
        durationMs: (collection.result.durationMs ?? 0) + result.durationMs,
        retryAttempts: (collection.result.retryAttempts ?? 0) + result.attempts,
      };
    },

    async delete(ids) {
      if (!ids.length) {
        return;
      }

      const collection = await getCollectionId();
      const result = await requestChroma(
        "delete",
        createChromaUrl(
          chromaUrl,
          `/api/v2/tenants/${encodeURIComponent(tenant)}/databases/${encodeURIComponent(database)}/collections/${encodeURIComponent(collection.collectionId)}/delete`,
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ids,
          }),
        },
      );

      return {
        durationMs: (collection.result.durationMs ?? 0) + result.durationMs,
        retryAttempts: (collection.result.retryAttempts ?? 0) + result.attempts,
      };
    },

    async query({ embedding, limit, where }) {
      if (!embedding.length || limit <= 0) {
        return [];
      }

      const collection = await getCollectionId();
      const result = await requestChroma<{
        distances?: Array<Array<number | null>>;
        documents?: Array<Array<string | null>>;
        ids?: string[][];
        metadatas?: Array<Array<Record<string, unknown> | null>>;
      }>(
        "query",
        createChromaUrl(
          chromaUrl,
          `/api/v2/tenants/${encodeURIComponent(tenant)}/databases/${encodeURIComponent(database)}/collections/${encodeURIComponent(collection.collectionId)}/query`,
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            include: ["documents", "metadatas", "distances"],
            n_results: limit,
            query_embeddings: [embedding],
            ...(where ? { where } : {}),
          }),
        },
      );
      const data = result.data;
      const ids = readQueryValue(data?.ids, 0);
      const documents = readQueryValue(data?.documents, 0);
      const metadatas = readQueryValue(data?.metadatas, 0);
      const distances = readQueryValue(data?.distances, 0);

      return ids.map((id, index) => ({
        id,
        document: documents[index] ?? "",
        metadata: metadatas[index] ?? {},
        distance: distances[index] ?? null,
      }));
    },
  };

  return store;
}
