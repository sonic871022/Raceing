import type { TickView } from './contracts.js';
export interface TargetSpec<TCandidate, TView extends TickView<unknown, unknown> = TickView<unknown, unknown>> {
    count: number | {
        min: number;
        max: number;
    };
    candidates(view: TView): readonly TCandidate[];
    /**
     * When true, a candidate index may appear at most once and choices are
     * combinations in authored candidate order. Otherwise ordered selections
     * with replacement are enumerated.
     */
    distinct?: boolean;
}
export interface TargetEnumerationOptions {
    /** Hard combinatorial guard. Defaults to 10,000 choices. */
    maxChoices?: number;
}
export interface TargetChoiceEnumeration<TCandidate> {
    choices: readonly (readonly TCandidate[])[];
    truncated: boolean;
}
/**
 * Enumerate target choices in deterministic candidate order with an explicit
 * truncation result. The first choice beyond `maxChoices` sets `truncated`.
 */
export declare function enumerateTargetChoices<TCandidate, TView extends TickView<unknown, unknown>>(spec: TargetSpec<TCandidate, TView>, view: TView, options?: TargetEnumerationOptions): TargetChoiceEnumeration<TCandidate>;
