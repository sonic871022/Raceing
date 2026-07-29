import type { Outcome, SubmittedAction, Reducer, TickView } from './contracts.js';
export declare const AGENT_TRANSCRIPT_VERSION: "1.3";
export type AgentEnvironmentErrorCode = 'not_started' | 'episode_done' | 'illegal_action';
export declare class AgentEnvironmentError extends Error {
    readonly code: AgentEnvironmentErrorCode;
    constructor(code: AgentEnvironmentErrorCode, message: string);
}
export type AgentTerminationReason = 'won' | 'failed' | 'ended' | 'decided' | 'tick_limit';
export interface AgentMetrics {
    /** Authoritative reducer ticks advanced in this episode. */
    ticks: number;
    totalReward: number;
    status: TickView['status'];
    stars: number | null;
    actionsUsed: number;
    outcome?: Outcome;
}
export interface AgentStepInfo extends AgentMetrics {
    seed: number;
    seat?: string;
    terminationReason: AgentTerminationReason | null;
}
/** One Gym-style interaction result with both schemas and concrete actions. */
export interface AgentStep<TView extends TickView<unknown, unknown>> {
    observation: TView;
    actionDefinitions: TView['actions'];
    legalActions: SubmittedAction[];
    systemActions: SubmittedAction[];
    reward: number;
    terminated: boolean;
    truncated: boolean;
    done: boolean;
    info: AgentStepInfo;
}
export interface AgentTranscriptAction<TView extends TickView<unknown, unknown> = TickView<unknown, unknown>> {
    n: number;
    action: SubmittedAction;
    reward: number;
    status: TickView['status'];
    actionsUsed: number;
    /** Observation returned to this agent after the action. */
    observation: TView;
}
export interface AgentTranscript<TLevel, TView extends TickView<unknown, unknown> = TickView<unknown, unknown>> {
    version: typeof AGENT_TRANSCRIPT_VERSION;
    level: TLevel;
    seed: number;
    seat?: string;
    /** Redacted initial observation for the configured seat. */
    initialObservation: TView;
    actions: Array<AgentTranscriptAction<TView>>;
    result: AgentStepInfo;
}
export interface AgentEnvironmentOptions<TLevel, TState, TView extends TickView<unknown, unknown>> {
    reducer: Reducer<TLevel, TState, TView>;
    level: TLevel;
    seed?: number;
    /** Agent seat. Uses reducer.viewFor when available. */
    seat?: string;
    /** Independent safety bound for an agent episode. Defaults to 10,000 ticks. */
    maxTicks?: number;
    enumerateActions?: (view: TView) => SubmittedAction[];
    isActionLegal?: (action: SubmittedAction, view: TView, concreteActions: readonly SubmittedAction[]) => boolean;
    reward?: (previous: TView, next: TView, action: SubmittedAction, tick: number, seat?: string) => number;
    /** Snapshot level data for deterministic transcripts. Defaults to structuredClone. */
    snapshotLevel?: (level: TLevel) => TLevel;
    /** Snapshot observations for deterministic transcripts. Defaults to structuredClone. */
    snapshotObservation?: (view: TView) => TView;
}
export interface AgentResetOptions<TLevel> {
    level?: TLevel;
    seed?: number;
}
/**
 * Provider-neutral, deterministic environment for agentic play.
 *
 * Products inject their reducer and content. The SDK owns episode lifecycle,
 * concrete action discovery, validation, reward accounting, and transcripts.
 */
export declare class AgentEnvironment<TLevel, TState, TView extends TickView<unknown, unknown>> {
    private readonly options;
    private level;
    private seed;
    private readonly maxTicks;
    private readonly enumerateActions;
    private readonly isActionLegal;
    private readonly rewardFor;
    private state;
    private ticks;
    private totalReward;
    private lastReward;
    private ended;
    private terminationReason;
    private records;
    private transcriptLevel;
    private initialObservation;
    private readonly snapshotLevel;
    private readonly snapshotObservation;
    constructor(options: AgentEnvironmentOptions<TLevel, TState, TView>);
    reset(options?: AgentResetOptions<TLevel>): AgentStep<TView>;
    observe(): AgentStep<TView>;
    step(action: SubmittedAction): AgentStep<TView>;
    private stepInternal;
    /** Reset and deterministically replay a canonical action list. */
    replay(actions: readonly SubmittedAction[], options?: AgentResetOptions<TLevel>): AgentStep<TView>;
    transcript(): AgentTranscript<TLevel, TView>;
    private currentView;
    private viewOf;
    private result;
}
