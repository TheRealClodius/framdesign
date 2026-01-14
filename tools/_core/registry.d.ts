/**
 * Type declarations for tool registry
 */

export interface ToolMetadata {
  toolId: string;
  version: string;
  category: string;
  sideEffects: boolean;
  idempotent: boolean;
  requiresConfirmation: boolean;
  allowedModes: string[];
  latencyBudgetMs: number;
}

export interface ToolResponse {
  ok: boolean;
  data?: any;
  error?: {
    type: string;
    message: string;
    retryable: boolean;
    details?: any;
  };
  intents?: any[];
  meta?: {
    toolId: string;
    toolVersion?: string;
    registryVersion?: string;
    duration: number;
    responseSchemaVersion?: string;
  };
}

export interface ExecutionContext {
  clientId: string;
  ws?: any;
  geminiSession?: any;
  args: Record<string, any>;
  session?: any;
  capabilities?: {
    messaging?: boolean;
    voice?: boolean;
    audit?: boolean;
  };
}

export class ToolRegistry {
  load(): Promise<void>;
  lock(): void;
  getVersion(): string | null;
  getGitCommit(): string | null;
  getProviderSchemas(provider?: 'openai' | 'geminiNative'): any[];
  getSummaries(): string;
  getDocumentation(toolId: string): string | null;
  getToolMetadata(toolId: string): ToolMetadata | null;
  executeTool(toolId: string, executionContext: ExecutionContext): Promise<ToolResponse>;
  snapshot(): any;
  reload(): Promise<void>;
}

export const toolRegistry: ToolRegistry;
