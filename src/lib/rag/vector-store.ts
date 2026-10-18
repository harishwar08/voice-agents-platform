import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Document, DocumentMetadata } from "./text-splitter";
import { defaultEmbeddings, HuggingFaceSentenceEmbeddings } from "./embeddings";
import { localRagStore } from "./local-cache";

export interface SearchResult {
  id: string;
  documentId: string;
  content: string;
  metadata: DocumentMetadata;
  similarity: number;
}

export interface VectorRetriever {
  getRelevantDocuments(query: string): Promise<Document[]>;
}

export class SupabaseVectorStore {
  private client: SupabaseClient;
  private embeddings: HuggingFaceSentenceEmbeddings;

  constructor(client?: SupabaseClient, embeddings?: HuggingFaceSentenceEmbeddings) {
    if (client) {
      this.client = client;
    } else {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      this.client = createClient(url, key);
    }
    this.embeddings = embeddings || defaultEmbeddings;
  }

  /**
   * Cosine similarity between two normalized vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Add documents and their computed embeddings to Supabase (or local fallback)
   */
  async addDocuments(
    documents: Document[],
    businessId: string,
    aiEmployeeId: string,
    documentId: string
  ): Promise<string[]> {
    if (!documents || documents.length === 0) return [];

    const texts = documents.map((doc) => doc.pageContent);
    const embeddings = await this.embeddings.embedDocuments(texts);

    // Prepare rows for Supabase without hardcoding invalid non-UUID IDs
    const dbRows = documents.map((doc, idx) => ({
      document_id: documentId,
      business_id: businessId,
      ai_employee_id: aiEmployeeId,
      chunk_index: doc.metadata?.chunkIndex ?? idx,
      content: doc.pageContent,
      embedding: embeddings[idx],
      metadata: doc.metadata || {},
      created_at: new Date().toISOString(),
    }));

    // Try batch insert into Supabase knowledge_chunks
    try {
      const { data, error } = await this.client
        .from("knowledge_chunks")
        .insert(dbRows as any)
        .select("id");

      if (!error && data && data.length > 0) {
        console.log(`Successfully stored ${data.length} chunks in Supabase knowledge_chunks`);
        return data.map((r) => r.id);
      }
      if (error) {
        console.warn("Supabase knowledge_chunks insert error, saving to local RAG cache:", error.message);
      }
    } catch (err: any) {
      console.warn("Supabase knowledge_chunks insert exception:", err.message);
    }

    // Save to local RAG cache fallback
    const localRows = dbRows.map((r) => ({
      ...r,
      id: "chk-" + Math.random().toString(36).substring(2, 10),
    }));
    localRagStore.addChunks(localRows as any);
    return localRows.map((r) => r.id);
  }

  /**
   * Similarity search against Supabase pgvector or local store fallback
   */
  async similaritySearch(
    query: string,
    k = 6,
    filter?: { aiEmployeeId?: string; businessId?: string; threshold?: number }
  ): Promise<SearchResult[]> {
    const queryEmbedding = await this.embeddings.embedQuery(query);
    const threshold = filter?.threshold ?? 0.05;

    // Helper to score chunks using hybrid search (vector similarity + keyword & entity matching)
    const stopWords = new Set([
      "what", "is", "the", "are", "me", "you", "of", "in", "for", "a", "an", "on", "at", "to",
      "can", "tell", "please", "give", "about", "your", "our", "and", "do", "how", "much",
      "i", "want", "know", "show", "any", "some", "detail", "details"
    ]);

    const lowerQuery = query.toLowerCase();
    const queryTerms = lowerQuery
      .split(/[\s,?.!/\\;:\(\)]+/)
      .filter((w) => w.length > 1 && !stopWords.has(w));

    const isAskingForPrice = /(price|prices|cost|costs|rate|rates|pricing|how much|fee|quote|charge|catalog|catalogue|discount|offer)/i.test(lowerQuery);

    function calculateHybridScore(content: string, vectorSim: number): number {
      const lowerContent = content.toLowerCase();
      let matchCount = 0;
      for (const term of queryTerms) {
        if (lowerContent.includes(term)) {
          matchCount++;
        }
      }

      const termRatio = queryTerms.length > 0 ? matchCount / queryTerms.length : 0;
      let score = vectorSim * 0.4 + termRatio * 0.4;

      // Boost if user asks about price/catalog and chunk contains actual pricing data
      if (isAskingForPrice) {
        if (/(?:₹|rs\.?|inr|\bprice\b|\b\d{1,3},\d{2,3}\b)/i.test(content)) {
          score += 0.25;
        }
      }

      // Strong boost for exact multi-character query term hits (e.g. specific product names like 'iphone', 'voltas', 'lg', 'refrigerator')
      for (const term of queryTerms) {
        if (term.length >= 3 && lowerContent.includes(term)) {
          score += 0.15;
        }
      }

      return score;
    }

    // 1. Try Supabase RPC match_knowledge_chunks first with over-sampling for re-ranking
    const candidatePoolCount = Math.max(k * 3, 20);
    let candidateChunks: Array<{ id: string; documentId: string; content: string; metadata: any; similarity: number }> = [];

    try {
      const { data, error } = await this.client.rpc("match_knowledge_chunks", {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: candidatePoolCount,
        filter_employee_id: filter?.aiEmployeeId ?? null,
        filter_business_id: filter?.businessId ?? null,
      });

      if (!error && Array.isArray(data) && data.length > 0) {
        candidateChunks = data.map((item: any) => ({
          id: item.id,
          documentId: item.document_id,
          content: item.content,
          metadata: item.metadata || {},
          similarity: Number(item.similarity.toFixed(4)),
        }));
      }

      // If no chunks found for this specific employee, try at the business level
      if (candidateChunks.length === 0 && filter?.businessId && filter?.aiEmployeeId) {
        const { data: bizData, error: bizError } = await this.client.rpc("match_knowledge_chunks", {
          query_embedding: queryEmbedding,
          match_threshold: threshold,
          match_count: candidatePoolCount,
          filter_employee_id: null,
          filter_business_id: filter.businessId,
        });

        if (!bizError && Array.isArray(bizData) && bizData.length > 0) {
          candidateChunks = bizData.map((item: any) => ({
            id: item.id,
            documentId: item.document_id,
            content: item.content,
            metadata: item.metadata || {},
            similarity: Number(item.similarity.toFixed(4)),
          }));
        }
      }
    } catch {
      // RPC might not exist or parameter type mismatch
    }

    // 2. Try Supabase table query directly if RPC yielded nothing
    if (candidateChunks.length === 0) {
      try {
        let queryBuilder = this.client
          .from("knowledge_chunks")
          .select("id, document_id, content, metadata, embedding, ai_employee_id, business_id");

        if (filter?.businessId && filter?.aiEmployeeId) {
          queryBuilder = queryBuilder.or(`ai_employee_id.eq.${filter.aiEmployeeId},business_id.eq.${filter.businessId}`);
        } else if (filter?.aiEmployeeId) {
          queryBuilder = queryBuilder.eq("ai_employee_id", filter.aiEmployeeId);
        } else if (filter?.businessId) {
          queryBuilder = queryBuilder.eq("business_id", filter.businessId);
        }

        const { data: chunks, error: fetchErr } = await queryBuilder.limit(200);

        if (!fetchErr && chunks && chunks.length > 0) {
          candidateChunks = chunks.map((chunk: any) => {
            let chunkVec: number[] = [];
            if (Array.isArray(chunk.embedding)) {
              chunkVec = chunk.embedding;
            } else if (typeof chunk.embedding === "string") {
              try {
                chunkVec = JSON.parse(chunk.embedding);
              } catch {
                chunkVec = chunk.embedding
                  .replace(/^\[|\]$/g, "")
                  .split(",")
                  .map((v: string) => parseFloat(v.trim()));
              }
            }

            const sim = chunkVec.length > 0 ? this.cosineSimilarity(queryEmbedding, chunkVec) : 0;
            return {
              id: chunk.id,
              documentId: chunk.document_id,
              content: chunk.content,
              metadata: chunk.metadata || {},
              similarity: Number(sim.toFixed(4)),
            };
          });
        }
      } catch {
        // ignore
      }
    }

    // 3. Score and re-rank candidates with hybrid algorithm
    if (candidateChunks.length > 0) {
      const scoredResults = candidateChunks.map((chunk) => ({
        ...chunk,
        hybridScore: calculateHybridScore(chunk.content, chunk.similarity),
      }));

      scoredResults.sort((a, b) => b.hybridScore - a.hybridScore);

      // Return top k results
      return scoredResults.slice(0, k).map((item) => ({
        id: item.id,
        documentId: item.documentId,
        content: item.content,
        metadata: item.metadata,
        similarity: Math.min(0.99, Number(item.hybridScore.toFixed(4))),
      }));
    }

    // 4. Fallback: Search knowledge_chunks by keyword matching if vector similarity yielded 0
    try {
      let chunkQuery = this.client
        .from("knowledge_chunks")
        .select("id, document_id, content, metadata");

      if (filter?.businessId && filter?.aiEmployeeId) {
        chunkQuery = chunkQuery.or(`ai_employee_id.eq.${filter.aiEmployeeId},business_id.eq.${filter.businessId}`);
      } else if (filter?.aiEmployeeId) {
        chunkQuery = chunkQuery.eq("ai_employee_id", filter.aiEmployeeId);
      } else if (filter?.businessId) {
        chunkQuery = chunkQuery.eq("business_id", filter.businessId);
      }

      const { data: allDbChunks } = await chunkQuery.limit(50);
      if (allDbChunks && allDbChunks.length > 0) {
        const textScored = allDbChunks.map((chunk: any) => ({
          id: chunk.id,
          documentId: chunk.document_id,
          content: chunk.content,
          metadata: chunk.metadata || {},
          similarity: calculateHybridScore(chunk.content, 0.6),
        }));

        textScored.sort((a, b) => b.similarity - a.similarity);
        const topMatches = textScored.filter((c) => c.similarity > 0.15).slice(0, k);
        if (topMatches.length > 0) {
          return topMatches.map((item) => ({
            id: item.id,
            documentId: item.documentId,
            content: item.content,
            metadata: item.metadata,
            similarity: Math.min(0.95, Number(item.similarity.toFixed(4))),
          }));
        }
      }
    } catch {
      // ignore
    }

    // 5. Fallback: Local persistent RAG cache
    const localChunks = localRagStore.getChunks(filter?.aiEmployeeId);
    if (localChunks.length > 0) {
      const scored = localChunks
        .map((chunk) => {
          const chunkVec = (chunk.embedding as number[]) || [];
          const sim = chunkVec.length > 0 ? this.cosineSimilarity(queryEmbedding, chunkVec) : 0;
          return {
            id: chunk.id,
            documentId: chunk.document_id,
            content: chunk.content,
            metadata: chunk.metadata || {},
            similarity: Number(sim.toFixed(4)),
            hybridScore: calculateHybridScore(chunk.content, sim),
          };
        })
        .sort((a, b) => b.hybridScore - a.hybridScore)
        .slice(0, k);

      return scored.map((item) => ({
        id: item.id,
        documentId: item.documentId,
        content: item.content,
        metadata: item.metadata,
        similarity: Math.min(0.99, Number(item.hybridScore.toFixed(4))),
      }));
    }

    return [];
  }

  /**
   * LangChain-compatible retriever interface
   * Mirrors: retriever = db.as_retriever()
   */
  asRetriever(options?: {
    k?: number;
    filter?: { aiEmployeeId?: string; businessId?: string; threshold?: number };
  }): VectorRetriever {
    const k = options?.k ?? 4;
    const filter = options?.filter;

    return {
      getRelevantDocuments: async (query: string): Promise<Document[]> => {
        const results = await this.similaritySearch(query, k, filter);
        return results.map(
          (res) =>
            new Document({
              pageContent: res.content,
              metadata: {
                ...res.metadata,
                id: res.id,
                documentId: res.documentId,
                similarity: res.similarity,
              },
            })
        );
      },
    };
  }
}
