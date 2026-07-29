import type { TickView } from '../engine/contracts.js';
import type { AgentEnvironment, AgentStep, AgentTranscript } from '../engine/agent-environment.js';
import type { AgentDecision, AgentDriver } from './driver.js';
export interface AgentDriverEpisodeResult<TLevel, TView extends TickView<unknown, unknown>> {
    finalStep: AgentStep<TView>;
    transcript: AgentTranscript<TLevel, TView>;
    decisions: AgentDecision[];
}
/** Run one complete deterministic environment episode through an AgentDriver. */
export declare function runAgentDriverEpisode<TLevel, TState, TView extends TickView<unknown, unknown>>(environment: AgentEnvironment<TLevel, TState, TView>, driver: AgentDriver<TView>, options?: {
    systemPrompt?: string;
    guidance?: readonly string[];
    signal?: AbortSignal;
    onDecision?: (decision: AgentDecision, step: AgentStep<TView>) => void | Promise<void>;
}): Promise<AgentDriverEpisodeResult<TLevel, TView>>;
