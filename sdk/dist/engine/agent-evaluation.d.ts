import type { SubmittedAction, TickView } from './contracts.js';
import type { AgentEnvironment, AgentStep, AgentTranscript } from './agent-environment.js';
export type AgentPolicy<TView extends TickView<unknown, unknown>> = (step: AgentStep<TView>) => SubmittedAction | Promise<SubmittedAction>;
export interface AgentEpisodeResult<TLevel, TView extends TickView<unknown, unknown>> {
    finalStep: AgentStep<TView>;
    transcript: AgentTranscript<TLevel, TView>;
}
/** Run one complete episode using a synchronous or asynchronous agent policy. */
export declare function runAgentEpisode<TLevel, TState, TView extends TickView<unknown, unknown>>(environment: AgentEnvironment<TLevel, TState, TView>, policy: AgentPolicy<TView>): Promise<AgentEpisodeResult<TLevel, TView>>;
export interface AgentBatchCase<TLevel> {
    id: string;
    level: TLevel;
    seed: number;
}
export interface AgentBatchEpisode<TLevel, TView extends TickView<unknown, unknown>> extends AgentEpisodeResult<TLevel, TView> {
    id: string;
}
export interface AgentBatchResult<TLevel, TView extends TickView<unknown, unknown>> {
    episodes: Array<AgentBatchEpisode<TLevel, TView>>;
    summary: {
        episodes: number;
        won: number;
        failed: number;
        truncated: number;
        meanReward: number;
        meanTicks: number;
    };
}
/** Sequential deterministic batch runner suitable for evaluation harnesses. */
export declare function evaluateAgentEpisodes<TLevel, TState, TView extends TickView<unknown, unknown>>(cases: readonly AgentBatchCase<TLevel>[], createEnvironment: (episode: AgentBatchCase<TLevel>) => AgentEnvironment<TLevel, TState, TView>, policy: (step: AgentStep<TView>, episode: AgentBatchCase<TLevel>) => SubmittedAction | Promise<SubmittedAction>): Promise<AgentBatchResult<TLevel, TView>>;
