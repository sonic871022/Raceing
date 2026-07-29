import type { SubmittedAction } from './contracts.js';
export interface GameDescriptor {
    id: string;
    version: string;
    dynamics: 'sequential' | 'simultaneous' | 'mixed';
    chance: 'none' | 'explicit' | 'sampled';
    information: 'perfect' | 'imperfect';
    utility: 'zero-sum' | 'constant-sum' | 'general-sum' | 'identical';
    rewards: 'terminal' | 'incremental';
    minPlayers: number;
    maxPlayers: number;
    minUtility?: number;
    maxUtility?: number;
    maxEpisodeLength?: number;
}
export interface ChanceOutcome {
    action: SubmittedAction;
    probability: number;
}
export interface GameHistory<TState = unknown> {
    readonly initialState: TState;
    readonly states: readonly TState[];
    readonly actions: readonly SubmittedAction[];
}
export interface GameObserver<TState, TObservation, TInformationState = never> {
    observe(state: TState, seat: string): TObservation;
    informationState?(history: GameHistory<TState>, seat: string): TInformationState;
    publicObservation?(state: TState): unknown;
    privateObservation?(state: TState, seat: string): unknown;
}
export interface PolicyChoice {
    action: SubmittedAction;
    probability: number;
}
export interface Policy<TObservation> {
    distribution(observation: TObservation, legalActions: readonly SubmittedAction[]): Promise<readonly PolicyChoice[]>;
}
/** Validate the portable discovery contract before scheduling a run. */
export declare function assertGameDescriptor(descriptor: GameDescriptor): asserts descriptor is GameDescriptor;
/**
 * Validate a finite canonical distribution. Callers retain the returned array
 * as the canonical chance/policy order.
 */
export declare function validateActionDistribution(distribution: readonly PolicyChoice[], options?: {
    legalActions?: readonly SubmittedAction[];
    tolerance?: number;
    requireCanonicalOrder?: boolean;
}): readonly PolicyChoice[];
export declare function validateChanceOutcomes(outcomes: readonly ChanceOutcome[], tolerance?: number): readonly ChanceOutcome[];
/** Deterministically select from a validated distribution using a [0, 1) draw. */
export declare function sampleActionDistribution(distribution: readonly PolicyChoice[], draw: number): SubmittedAction;
export interface WinRateEstimate {
    wins: number;
    episodes: number;
    rate: number;
    confidence95: readonly [number, number];
}
/** Wilson 95% interval; defined for an empty sample as [0, 1]. */
export declare function winRate(wins: number, episodes: number): WinRateEstimate;
export declare function policyEntropy(distribution: readonly PolicyChoice[]): number;
export interface HeadToHeadResult {
    rowPolicy: string;
    columnPolicy: string;
    rowUtility: number;
    episodes: number;
}
export interface HeadToHeadPayoffMatrix {
    policies: readonly string[];
    utilities: Readonly<Record<string, Readonly<Record<string, number>>>>;
    episodes: Readonly<Record<string, Readonly<Record<string, number>>>>;
}
/** Aggregate ordered policy matchups without assuming zero-sum utilities. */
export declare function headToHeadPayoffMatrix(results: readonly HeadToHeadResult[]): HeadToHeadPayoffMatrix;
export interface ActionEfficiency {
    attempted: number;
    accepted: number;
    invalid: number;
    productive: number;
    acceptanceRate: number;
    invalidActionRate: number;
    productiveActionRate: number;
}
export declare function actionEfficiency(counts: {
    attempted: number;
    accepted: number;
    invalid: number;
    productive: number;
}): ActionEfficiency;
export interface Rating {
    id: string;
    value: number;
}
export interface RatingMatch {
    left: string;
    right: string;
    /** 1 = left win, 0.5 = draw, 0 = right win. */
    leftScore: number;
}
/** Deterministic two-player Elo adapter; benchmark products choose K and meaning. */
export declare function updateEloRatings(ratings: readonly Rating[], matches: readonly RatingMatch[], k?: number): readonly Rating[];
export type FormalMetric = 'best-response' | 'exploitability' | 'equilibrium';
/**
 * Reject formal metrics unless their required game preconditions are explicit.
 * GAOS does not infer a game-theoretic meaning from incomplete descriptors.
 */
export declare function assertFormalMetricPreconditions(metric: FormalMetric, descriptor: GameDescriptor): void;
export type GameTransform = 'simultaneous-to-sequential' | 'repeated-game' | 'start-from-state' | 'cooperative-centralized-view' | 'utility-normalization';
export interface TransformDescriptor {
    schema: 'gaos.game-transform.v1';
    transform: GameTransform;
    input: GameDescriptor;
    output: GameDescriptor;
    deterministic: true;
    evidenceIdentity: string;
}
export declare function assertTransformDescriptor(descriptor: TransformDescriptor): void;
