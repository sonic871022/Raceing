import type { JsonValue } from './protocol.js';
export type PresentationClientMessage<TView, TPatch> = {
    type: 'snapshot';
    transitionRevision: number;
    tick: number;
    view: TView;
    digest?: string;
} | {
    type: 'patch';
    baseTransitionRevision: number;
    transitionRevision: number;
    tick: number;
    patch: TPatch;
    digest?: string;
} | {
    type: 'acknowledgement';
    submissionId: string;
} | {
    type: 'rejection';
    submissionId: string;
    reason: string;
} | {
    type: 'digest-mismatch';
    expected: string;
    actual: string;
};
export interface PresentationClientState<TView> {
    status: 'empty' | 'ready' | 'repair-required';
    transitionRevision?: number;
    tick?: number;
    view?: TView;
    digest?: string;
    acknowledged: readonly string[];
    rejected: Readonly<Record<string, string>>;
}
export interface PresentationClientReducer<TView, TPatch> {
    applyPatch(view: TView, patch: TPatch): TView;
    digest?(view: TView): string;
}
/** Portable snapshot/patch/receipt state machine shared by engine clients. */
export declare class PresentationClient<TView, TPatch = JsonValue> {
    private readonly reducer;
    private value;
    constructor(reducer: PresentationClientReducer<TView, TPatch>);
    state(): PresentationClientState<TView>;
    receive(message: PresentationClientMessage<TView, TPatch>): PresentationClientState<TView>;
}
