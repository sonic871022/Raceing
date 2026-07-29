import type { ActionDefinition, SubmittedAction } from '../engine/contracts.js';
export interface AgentDriverContext<TObservation = unknown> {
    observation: TObservation;
    legalActions: readonly SubmittedAction[];
    /** Always-available semantic controls, separate from gameplay legality. */
    systemActions?: readonly SubmittedAction[];
    actionDefinitions?: readonly ActionDefinition[];
    step: number;
    systemPrompt?: string;
    guidance?: readonly string[];
    signal?: AbortSignal;
}
export interface AgentTokenUsage {
    inputTokens?: number;
    outputTokens?: number;
}
export interface AgentDecision {
    action: SubmittedAction;
    reasoning?: string;
    message?: string;
    usage?: AgentTokenUsage;
    raw?: unknown;
}
export type AgentInterruptionMode = 'resume' | 'abort' | 'restart' | 'unsupported';
export interface AgentInterruptOptions {
    /** New user guidance that caused the interruption. */
    prompt?: string;
}
export interface AgentInterruptionResult {
    mode: AgentInterruptionMode;
    interrupted: boolean;
    /** True when the next decision retains the runner's prior conversation. */
    preservesContext: boolean;
}
export interface AgentDriver<TObservation = unknown> {
    readonly id: string;
    readonly label: string;
    reset?(): void | Promise<void>;
    /** Cancel the active decision. Implementations own provider-specific context preservation. */
    interrupt?(options?: AgentInterruptOptions): AgentInterruptionResult | Promise<AgentInterruptionResult>;
    act(context: AgentDriverContext<TObservation>): Promise<AgentDecision>;
}
export declare class AgentDriverRegistry<TObservation = unknown> {
    private readonly drivers;
    constructor(drivers?: readonly AgentDriver<TObservation>[]);
    register(driver: AgentDriver<TObservation>, options?: {
        replace?: boolean;
    }): this;
    unregister(id: string): boolean;
    get(id: string): AgentDriver<TObservation> | undefined;
    require(id: string): AgentDriver<TObservation>;
    list(): AgentDriver<TObservation>[];
}
export declare function isLegalAgentDecision(decision: AgentDecision, legalActions: readonly SubmittedAction[]): boolean;
