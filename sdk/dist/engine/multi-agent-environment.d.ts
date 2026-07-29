import type { Outcome, SubmittedAction, Reducer, TickView } from './contracts.js';
export declare const MULTI_AGENT_TRANSCRIPT_VERSION: "1.1";
export type MultiAgentEnvironmentErrorCode = 'not_started' | 'episode_done' | 'illegal_action' | 'invalid_participation';
export declare class MultiAgentEnvironmentError extends Error {
    readonly code: MultiAgentEnvironmentErrorCode;
    constructor(code: MultiAgentEnvironmentErrorCode, message: string);
}
export interface MultiAgentSeatStep<TView extends TickView<unknown, unknown>> {
    seat: string;
    observation: TView;
    legalActions: readonly SubmittedAction[];
    systemActions: readonly SubmittedAction[];
    participating: boolean;
    reward: number;
    totalReward: number;
}
export interface MultiAgentStep<TView extends TickView<unknown, unknown>> {
    seats: Readonly<Record<string, MultiAgentSeatStep<TView>>>;
    participatingSeats: readonly string[];
    tick: number;
    status: TickView['status'];
    outcome?: Outcome;
    terminated: boolean;
    truncated: boolean;
    done: boolean;
}
export interface MultiAgentTranscriptTick<TView extends TickView<unknown, unknown>> {
    n: number;
    actions: readonly SubmittedAction[];
    rewards: Readonly<Record<string, number>>;
    observations: Readonly<Record<string, TView>>;
}
export interface MultiAgentTranscript<TLevel, TView extends TickView<unknown, unknown>> {
    version: typeof MULTI_AGENT_TRANSCRIPT_VERSION;
    level: TLevel;
    seed: number;
    seats: readonly string[];
    initialObservations: Readonly<Record<string, TView>>;
    ticks: readonly MultiAgentTranscriptTick<TView>[];
    result: {
        ticks: number;
        status: TickView['status'];
        outcome?: Outcome;
        totalRewards: Readonly<Record<string, number>>;
        terminated: boolean;
        truncated: boolean;
    };
}
export interface MultiAgentEnvironmentOptions<TLevel, TState, TView extends TickView<unknown, unknown>> {
    reducer: Reducer<TLevel, TState, TView>;
    level: TLevel;
    seats: readonly string[];
    seed?: number;
    maxTicks?: number;
    enumerateActions?: (view: TView) => SubmittedAction[];
    waitAction?: (seat: string, view: TView) => SubmittedAction;
    isActionLegal?: (action: SubmittedAction, seat: string, view: TView, concrete: readonly SubmittedAction[]) => boolean;
    reward?: (previous: TView, next: TView, actions: readonly SubmittedAction[], tick: number, seat: string) => number;
    snapshotLevel?: (level: TLevel) => TLevel;
    snapshotObservation?: (view: TView) => TView;
}
/**
 * Deterministic shared-state environment for multiple seat-scoped policies.
 * Simultaneous participation resolves one canonical input batch per tick.
 */
export declare class MultiAgentEnvironment<TLevel, TState, TView extends TickView<unknown, unknown>> {
    private readonly options;
    private readonly seats;
    private readonly seed;
    private readonly maxTicks;
    private readonly actionsFor;
    private readonly snapshotLevel;
    private readonly snapshotObservation;
    private state;
    private ticks;
    private ended;
    private truncated;
    private totalRewards;
    private lastRewards;
    private initialObservations;
    private records;
    private transcriptLevel;
    constructor(options: MultiAgentEnvironmentOptions<TLevel, TState, TView>);
    reset(): MultiAgentStep<TView>;
    observe(): MultiAgentStep<TView>;
    step(intents: Readonly<Record<string, SubmittedAction | undefined>>): MultiAgentStep<TView>;
    /** Reset and replay canonical per-tick action batches from a transcript. */
    replay(ticks: readonly (readonly SubmittedAction[])[]): MultiAgentStep<TView>;
    transcript(): MultiAgentTranscript<TLevel, TView>;
    private views;
    private participatingSeats;
    private defaultReward;
    private tick;
}
export type MultiAgentPolicy<TView extends TickView<unknown, unknown>> = (step: MultiAgentSeatStep<TView>, shared: MultiAgentStep<TView>) => SubmittedAction | undefined | Promise<SubmittedAction | undefined>;
export interface MultiAgentEpisodeResult<TLevel, TView extends TickView<unknown, unknown>> {
    finalStep: MultiAgentStep<TView>;
    transcript: MultiAgentTranscript<TLevel, TView>;
}
/** Run seat policies concurrently while committing their inputs canonically. */
export declare function runMultiAgentEpisode<TLevel, TState, TView extends TickView<unknown, unknown>>(environment: MultiAgentEnvironment<TLevel, TState, TView>, policies: Readonly<Record<string, MultiAgentPolicy<TView>>>): Promise<MultiAgentEpisodeResult<TLevel, TView>>;
