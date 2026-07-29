import { type Reducer, type SessionView } from './contracts.js';
import type { LocationRef } from './locations.js';
import type { JsonValue } from '../protocol.js';
export type TranscriptVisibility = 'full' | `seat:${string}`;
export interface TranscriptHeader<TLevel> {
    sessionId: string;
    level: TLevel;
    seed: number;
    /** Wire action index to canonical action index. */
    perm: number[];
    status: 'won' | 'failed' | 'ended';
    stars: number | null;
    actionsUsed: number;
    /** Absent means `full` for v0.12/v0.13 transcript compatibility. */
    visibility?: TranscriptVisibility;
}
export interface TranscriptAction {
    n: number;
    wireId: string;
    canonicalId: string;
    payload?: JsonValue;
    x?: number;
    y?: number;
    index?: number;
    boardId?: string;
    zoneId?: string;
    seat?: string;
    targets?: readonly LocationRef[];
    /** High-frequency tick. Empty ticks between records are omitted. */
    tick?: number;
}
export interface RecheckResult {
    ok: boolean;
    problems: string[];
    /** Non-fatal audit limitations and security hygiene warnings. */
    diagnostics: string[];
    replayed: {
        status: string;
        stars: number | null;
        actionsUsed: number;
    };
}
export interface RecheckOptions<TState> {
    /** Product-owned scheduled work for omitted all-wait ticks. */
    applyEmptyTick?: (state: TState, tick: number) => TState;
}
/** Re-simulate a transcript and compare its deterministic recorded outcome. */
export declare function recheckTranscript<TLevel, TState, TView extends SessionView>(reducer: Reducer<TLevel, TState, TView>, header: TranscriptHeader<TLevel>, actions: TranscriptAction[], options?: RecheckOptions<TState>): RecheckResult;
/** Deterministically derive one level seed from a multi-level run seed. */
export declare function runLevelSeed(sessionSeed: number, levelIndex: number): number;
/** @deprecated Renamed to `TranscriptHeader`; this alias will be removed in v1.0. */
export type GridTranscriptHeader<TLevel> = TranscriptHeader<TLevel>;
/** @deprecated Renamed to `TranscriptAction`; this alias will be removed in v1.0. */
export type GridTranscriptAction = TranscriptAction;
/** @deprecated Renamed to `RecheckResult`; this alias will be removed in v1.0. */
export type GridRecheckResult = RecheckResult;
/** @deprecated Renamed to `recheckTranscript`; this alias will be removed in v1.0. */
export declare const recheckGridTranscript: typeof recheckTranscript;
