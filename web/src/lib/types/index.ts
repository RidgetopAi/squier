// ============================================
// SQUIRE WEB - SHARED TYPES
// ============================================
// Synced with backend API types

// Memory Types
export interface Memory {
  id: string;
  content: string;
  source: MemorySource;
  salience: number;
  created_at: string;
  updated_at: string;
  embedding?: number[];
  emotions?: EmotionScores;
  entities?: Entity[];
}

export type MemorySource =
  | 'conversation'
  | 'observation'
  | 'document'
  | 'import'
  | 'system';

export interface EmotionScores {
  joy?: number;
  sadness?: number;
  anger?: number;
  fear?: number;
  surprise?: number;
  disgust?: number;
}

// Entity Types
export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  aliases?: string[];
  mention_count: number;
  first_seen: string;
  last_seen: string;
  metadata?: Record<string, unknown>;
}

export type EntityType =
  | 'person'
  | 'organization'
  | 'location'
  | 'project'
  | 'concept'
  | 'event';

// Belief Types
export interface Belief {
  id: string;
  statement: string;
  category: BeliefCategory;
  confidence: number;
  evidence_count: number;
  first_observed: string;
  last_reinforced: string;
  status: 'active' | 'deprecated' | 'conflicted';
}

export type BeliefCategory =
  | 'value'
  | 'preference'
  | 'habit'
  | 'opinion'
  | 'fact'
  | 'goal'
  | 'identity';

// Pattern Types
export interface Pattern {
  id: string;
  description: string;
  type: PatternType;
  frequency: number;
  confidence: number;
  first_detected: string;
  last_detected: string;
  examples?: string[];
}

export type PatternType =
  | 'behavioral'
  | 'temporal'
  | 'emotional'
  | 'social'
  | 'cognitive';

// Insight Types
export interface Insight {
  id: string;
  content: string;
  type: InsightType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'new' | 'reviewed' | 'actioned' | 'dismissed';
  source_memories: string[];
  created_at: string;
}

export type InsightType =
  | 'connection'
  | 'contradiction'
  | 'opportunity'
  | 'warning'
  | 'realization';

// Summary Types
export interface LivingSummary {
  category: SummaryCategory;
  content: string;
  updated_at: string;
  version: number;
}

export type SummaryCategory =
  | 'personality'
  | 'goals'
  | 'relationships'
  | 'interests'
  | 'work'
  | 'health'
  | 'daily';

// Context Package (returned by /api/context)
export interface ContextPackage {
  memories: Memory[];
  entities: Entity[];
  summaries: LivingSummary[];
  beliefs?: Belief[];
  patterns?: Pattern[];
  token_budget: number;
  tokens_used: number;
}

// Chat Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  context?: ContextPackage;
  memoryIds?: string[];
}

export interface Conversation {
  id: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

// Graph Types (for visualization)
export interface GraphNode {
  id: string;
  type: 'memory' | 'entity';
  label: string;
  data: Memory | Entity;
  salience?: number;
  color?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  weight: number;
}

export type EdgeType =
  | 'mentions'
  | 'similar'
  | 'temporal'
  | 'causal';

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// API Response Types
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Profile Types
export interface ContextProfile {
  id: string;
  name: string;
  description: string;
  token_budget: number;
  weights: {
    recency: number;
    salience: number;
    relevance: number;
  };
}
