export interface ShortTermMemory {
  /**
   * Retrieve temporary context stored during the current run execution steps.
   */
  get(key: string): Promise<any>;

  /**
   * Set temporary context key value.
   */
  set(key: string, value: any): Promise<void>;

  /**
   * Clear all working memory variables.
   */
  clear(): Promise<void>;

  /**
   * Retrieve the complete working memory state object.
   */
  getAll(): Promise<Record<string, any>>;
}

export interface LongTermMemory {
  /**
   * Fetch context variables preserved across executions for specific entities.
   */
  get(scopeId: string, key: string): Promise<any>;

  /**
   * Set long term context variable.
   */
  set(scopeId: string, key: string, value: any, ttlMs?: number): Promise<void>;

  /**
   * Delete long term context variable.
   */
  delete(scopeId: string, key: string): Promise<void>;
}

export interface SemanticMemoryResult {
  text: string;
  metadata: Record<string, any>;
  similarity: number;
}

export interface SemanticMemory {
  /**
   * Store structured text chunk and matching vectors for semantic retrieval.
   */
  store(text: string, embedding: number[], metadata?: Record<string, any>): Promise<void>;

  /**
   * Perform vector search queries using cosine similarities.
   */
  search(embedding: number[], limit?: number): Promise<SemanticMemoryResult[]>;
}

export interface SessionMemory {
  /**
   * Fetch thread message history for a user conversation session.
   */
  getHistory(sessionId: string): Promise<any[]>;

  /**
   * Record a new message delta inside a thread session.
   */
  addMessage(sessionId: string, message: any): Promise<void>;

  /**
   * Clean and clear session thread logs.
   */
  clear(sessionId: string): Promise<void>;
}

export const SHORT_TERM_MEMORY = "SHORT_TERM_MEMORY";
export const LONG_TERM_MEMORY = "LONG_TERM_MEMORY";
export const SEMANTIC_MEMORY = "SEMANTIC_MEMORY";
export const SESSION_MEMORY = "SESSION_MEMORY";
