import { describe, expect, it, vi } from "vitest";

import {
  deleteOwnerDropboxMarkdownKnowledge,
  syncDropboxMarkdownDocuments,
} from "@/backend/dropbox-indexing";

function createPrismaMock() {
  const documents = new Map<string, Record<string, unknown>>();
  const vectorIndexes = new Map<string, Record<string, unknown>>();
  const aiLogs: Record<string, unknown>[] = [];
  let documentSequence = 0;

  return {
    aiLogs,
    documents,
    prisma: {
      aiRequestLog: {
        create: vi.fn(({ data }) => {
          aiLogs.push(data);

          return Promise.resolve(data);
        }),
      },
      dropboxMarkdownDocument: {
        delete: vi.fn(({ where }) => {
          for (const [key, document] of documents.entries()) {
            if (document.id === where.id) {
              documents.delete(key);
              break;
            }
          }

          return Promise.resolve({ id: where.id });
        }),
        findMany: vi.fn(({ where }) =>
          Promise.resolve(
            [...documents.values()]
              .filter((document) => {
                if (document.ownerId !== where.ownerId) {
                  return false;
                }

                const notIn = where.pathLower?.notIn as string[] | undefined;

                return notIn ? !notIn.includes(String(document.pathLower)) : true;
              })
              .map((document) => ({
                id: document.id,
                ownerId: document.ownerId,
                pathDisplay: document.pathDisplay,
                pathLower: document.pathLower,
              })),
          ),
        ),
        upsert: vi.fn(({ create, update, where }) => {
          const key = where.ownerId_pathLower.pathLower;
          const existing = documents.get(key);
          const document = existing
            ? { ...existing, ...update }
            : {
                id: `doc-${(documentSequence += 1)}`,
                ...create,
              };

          documents.set(key, document);

          return Promise.resolve(document);
        }),
      },
      dropboxMarkdownVectorIndex: {
        findUnique: vi.fn(({ where }) =>
          Promise.resolve(vectorIndexes.get(where.documentId) ?? null),
        ),
        updateMany: vi.fn(({ data, where }) => {
          const existing = vectorIndexes.get(where.documentId);

          if (existing) {
            vectorIndexes.set(where.documentId, { ...existing, ...data });
          }

          return Promise.resolve({ count: existing ? 1 : 0 });
        }),
        upsert: vi.fn(({ create, update, where }) => {
          const existing = vectorIndexes.get(where.documentId);
          const next = existing ? { ...existing, ...update } : create;

          vectorIndexes.set(where.documentId, next);

          return Promise.resolve(next);
        }),
      },
    },
    vectorIndexes,
  };
}

describe("syncDropboxMarkdownDocuments", () => {
  it("stores markdown documents and upserts Dropbox vector records", async () => {
    const { aiLogs, documents, prisma } = createPrismaMock();
    const dropboxClient = {
      listMarkdownFiles: vi.fn().mockResolvedValue([
        {
          id: "id:note",
          name: "note.md",
          pathDisplay: "/notes/note.md",
          pathLower: "/notes/note.md",
          rev: "rev-1",
          serverModified: "2026-06-13T00:00:00Z",
          size: 30,
        },
      ]),
      readMarkdownFile: vi.fn().mockResolvedValue({
        content: "# 제목\n\n본문 **내용**입니다.",
        file: {
          id: "id:note",
          name: "note.md",
          pathDisplay: "/notes/note.md",
          pathLower: "/notes/note.md",
          rev: "rev-1",
          serverModified: "2026-06-13T00:00:00Z",
          size: 30,
        },
      }),
    };
    const embeddingClient = {
      embedDocuments: vi.fn(async (inputs: string[]) => ({
        durationMs: 1,
        embeddings: inputs.map(() => [0.1, 0.2, 0.3]),
        model: "test-embedding",
        usage: {
          inputTokens: 10,
          totalTokens: 10,
        },
      })),
    };
    const upsertedVectors: Record<string, unknown>[] = [];
    const vectorStore = {
      delete: vi.fn(),
      upsert: vi.fn(async (records: Record<string, unknown>[]) => {
        upsertedVectors.push(...records);

        return {
          durationMs: 1,
          retryAttempts: 1,
        };
      }),
    };

    const result = await syncDropboxMarkdownDocuments(
      "user-1",
      {},
      {
        dropboxClient,
        embeddingClient,
        prisma: prisma as never,
        vectorStore,
      },
    );

    expect(result.indexed).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(documents.get("/notes/note.md")).toMatchObject({
      name: "note.md",
      ownerId: "user-1",
      pathDisplay: "/notes/note.md",
      plainText: "제목\n본문 내용 입니다.",
    });
    expect(upsertedVectors).toHaveLength(1);
    expect(upsertedVectors[0]).toMatchObject({
      metadata: expect.objectContaining({
        ownerId: "user-1",
        sourcePath: "/notes/note.md",
        sourceTitle: "note.md",
        sourceType: "DROPBOX_MD",
      }),
    });
    expect(aiLogs.map((log) => log.purpose)).toEqual([
      "DROPBOX_MD_EMBEDDING",
      "DROPBOX_MD_VECTOR_UPSERT",
    ]);
  });

  it("deletes stale Dropbox vectors and documents", async () => {
    const { documents, prisma, vectorIndexes } = createPrismaMock();

    documents.set("/old.md", {
      id: "doc-old",
      ownerId: "user-1",
      pathDisplay: "/old.md",
      pathLower: "/old.md",
    });
    vectorIndexes.set("doc-old", {
      chunkIds: ["dropbox-md:old:chunk:0"],
      contentHash: "old-hash",
    });

    const deletedVectors: string[] = [];
    const result = await syncDropboxMarkdownDocuments(
      "user-1",
      {},
      {
        dropboxClient: {
          listMarkdownFiles: vi.fn().mockResolvedValue([]),
          readMarkdownFile: vi.fn(),
        },
        embeddingClient: {
          embedDocuments: vi.fn(),
        },
        prisma: prisma as never,
        vectorStore: {
          delete: vi.fn(async (ids: string[]) => {
            deletedVectors.push(...ids);

            return {
              durationMs: 1,
              retryAttempts: 1,
            };
          }),
          upsert: vi.fn(),
        },
      },
    );

    expect(result.deleted).toHaveLength(1);
    expect(deletedVectors).toEqual(["dropbox-md:old:chunk:0"]);
    expect(documents.has("/old.md")).toBe(false);
  });

  it("deletes all Dropbox knowledge for an owner on disconnect", async () => {
    const { documents, prisma, vectorIndexes } = createPrismaMock();

    documents.set("/note.md", {
      id: "doc-note",
      ownerId: "user-1",
      pathDisplay: "/note.md",
      pathLower: "/note.md",
    });
    documents.set("/other.md", {
      id: "doc-other",
      ownerId: "user-2",
      pathDisplay: "/other.md",
      pathLower: "/other.md",
    });
    vectorIndexes.set("doc-note", {
      chunkIds: ["dropbox-md:note:chunk:0"],
      contentHash: "hash",
    });

    const deletedVectors: string[] = [];
    const result = await deleteOwnerDropboxMarkdownKnowledge("user-1", {
      prisma: prisma as never,
      vectorStore: {
        delete: vi.fn(async (ids: string[]) => {
          deletedVectors.push(...ids);

          return {
            durationMs: 1,
            retryAttempts: 1,
          };
        }),
        upsert: vi.fn(),
      },
    });

    expect(result.deleted).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(deletedVectors).toEqual(["dropbox-md:note:chunk:0"]);
    expect(documents.has("/note.md")).toBe(false);
    expect(documents.has("/other.md")).toBe(true);
  });
});
