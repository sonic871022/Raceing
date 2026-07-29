import type { TickView } from './contracts.js';
import type { AgentEnvironment } from './agent-environment.js';
export type AgentToolName = 'observe' | 'act' | 'reset' | 'transcript';
export interface AgentToolDefinition {
    name: AgentToolName;
    description: string;
    inputSchema: Record<string, unknown>;
}
/** Provider-neutral definitions that can be registered with MCP or tool APIs. */
export declare const AGENT_TOOL_DEFINITIONS: readonly AgentToolDefinition[];
export interface AgentToolAdapter {
    definitions: readonly AgentToolDefinition[];
    call(name: AgentToolName, input?: unknown): unknown;
}
/** Bind the standard agent tools to one environment without an MCP dependency. */
export declare function createAgentToolAdapter<TLevel, TState, TView extends TickView<unknown, unknown>>(environment: AgentEnvironment<TLevel, TState, TView>): AgentToolAdapter;
