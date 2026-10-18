import {
  CharacterTextSplitter as LangChainCharacterTextSplitter,
  RecursiveCharacterTextSplitter as LangChainRecursiveCharacterTextSplitter,
} from "@langchain/textsplitters";
import { Document as LangChainDocument } from "@langchain/core/documents";

export interface DocumentMetadata {
  documentId?: string;
  businessId?: string;
  aiEmployeeId?: string;
  sourceType?: string;
  sourceName?: string;
  chunkIndex?: number;
  totalChunks?: number;
  [key: string]: any;
}

export type Document = LangChainDocument<DocumentMetadata>;
export const Document = LangChainDocument;

export interface TextSplitterParams {
  chunkSize?: number;
  chunkOverlap?: number;
  separator?: string;
  keepSeparator?: boolean;
}

/**
 * LangChain CharacterTextSplitter wrapper with convenience methods
 */
export class CharacterTextSplitter extends LangChainCharacterTextSplitter {
  constructor(fields?: TextSplitterParams) {
    super({
      chunkSize: fields?.chunkSize ?? 500,
      chunkOverlap: fields?.chunkOverlap ?? 50,
      separator: fields?.separator ?? "\n\n",
      keepSeparator: fields?.keepSeparator ?? false,
    });
  }

  /**
   * Helper to split texts into Document instances with metadata attached
   */
  async createDocumentsFromTexts(
    texts: string[],
    metadatas?: DocumentMetadata[]
  ): Promise<LangChainDocument<DocumentMetadata>[]> {
    const documents: LangChainDocument<DocumentMetadata>[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const baseMeta = metadatas && metadatas[i] ? metadatas[i] : {};
      const chunks = await this.splitText(text);

      for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        documents.push(
          new LangChainDocument({
            pageContent: chunks[chunkIdx],
            metadata: {
              ...baseMeta,
              chunkIndex: chunkIdx,
              totalChunks: chunks.length,
            },
          })
        );
      }
    }

    return documents;
  }
}

export class RecursiveCharacterTextSplitter extends LangChainRecursiveCharacterTextSplitter {
  constructor(fields?: { chunkSize?: number; chunkOverlap?: number; separators?: string[] }) {
    super({
      chunkSize: fields?.chunkSize ?? 500,
      chunkOverlap: fields?.chunkOverlap ?? 50,
      separators: fields?.separators,
    });
  }
}
