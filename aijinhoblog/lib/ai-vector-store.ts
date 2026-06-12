export type VectorMetadata = Record<string, string | number | boolean>;

export type VectorRecord = {
  id: string;
  embedding: number[];
  document: string;
  metadata: VectorMetadata;
};

export type VectorStore = {
  upsert(records: VectorRecord[]): Promise<void>;
  delete(ids: string[]): Promise<void>;
};

type ChromaCollection = {
  id?: string;
  name?: string;
};

async function readJsonResponse(response: Response) {
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof body === "object" && body && "message" in body
        ? String(body.message)
        : `ChromaDB 요청이 실패했습니다. status=${response.status}`;

    throw new Error(message);
  }

  return body;
}

function createChromaUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
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
    const response = await fetch(
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
    const collection = (await readJsonResponse(response)) as ChromaCollection;

    if (!collection.id) {
      throw new Error("ChromaDB collection id를 확인할 수 없습니다.");
    }

    return collection.id;
  }

  const store: VectorStore = {
    async upsert(records) {
      if (!records.length) {
        return;
      }

      const collectionId = await getCollectionId();
      const response = await fetch(
        createChromaUrl(
          chromaUrl,
          `/api/v2/tenants/${encodeURIComponent(tenant)}/databases/${encodeURIComponent(database)}/collections/${encodeURIComponent(collectionId)}/upsert`,
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

      await readJsonResponse(response);
    },

    async delete(ids) {
      if (!ids.length) {
        return;
      }

      const collectionId = await getCollectionId();
      const response = await fetch(
        createChromaUrl(
          chromaUrl,
          `/api/v2/tenants/${encodeURIComponent(tenant)}/databases/${encodeURIComponent(database)}/collections/${encodeURIComponent(collectionId)}/delete`,
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

      await readJsonResponse(response);
    },
  };

  return store;
}
