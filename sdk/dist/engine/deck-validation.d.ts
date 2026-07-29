export interface DeckEntry {
    /** Stable card/unit/loadout definition id. */
    id: string;
    copies: number;
    tags?: readonly string[];
    factions?: readonly string[];
}
export type DeckConstraint = {
    id: string;
    kind: 'totalSize';
    min?: number;
    max?: number;
} | {
    id: string;
    kind: 'copiesLimit';
    max: number;
    /** When present, the limit applies only to entries carrying this tag. */
    tag?: string;
} | {
    id: string;
    kind: 'tagCount';
    tag: string;
    min?: number;
    max?: number;
} | {
    id: string;
    kind: 'factions';
    allowed?: readonly string[];
    maxDistinct?: number;
};
export type DeckViolationCode = 'duplicate_entry' | 'total_size_below_min' | 'total_size_above_max' | 'copies_limit_exceeded' | 'tag_count_below_min' | 'tag_count_above_max' | 'faction_not_allowed' | 'too_many_factions';
export interface DeckViolation {
    constraintId: string;
    constraintIndex: number;
    code: DeckViolationCode;
    entryId?: string;
    actual: number | string;
    expected: number | string | readonly string[];
}
export interface DeckValidationResult {
    valid: boolean;
    totalSize: number;
    violations: readonly DeckViolation[];
}
/**
 * Validate card decks, squads, or loadouts through the same declarative
 * size/copies/tag/faction constraint schema.
 */
export declare function validateDeck(entries: readonly DeckEntry[], constraints: readonly DeckConstraint[]): DeckValidationResult;
