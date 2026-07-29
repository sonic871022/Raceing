export interface VerifyCliIo {
    cwd?: string;
    stdout?: (text: string) => void;
    stderr?: (text: string) => void;
}
/**
 * Offline verification CLI. The adapter module exports
 * `resolveReplayReducer(context)` (or the same function as its default).
 * Signed evidence additionally exports `semanticAdapterForLevel(context)`.
 */
export declare function runVerifyCli(argv: readonly string[], io?: VerifyCliIo): Promise<number>;
