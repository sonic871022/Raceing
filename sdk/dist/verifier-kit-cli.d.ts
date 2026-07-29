export interface VerifierKitCliIo {
    cwd?: string;
    stdout?: (text: string) => void;
    stderr?: (text: string) => void;
    fetch?: typeof globalThis.fetch;
}
/** Explicit filesystem/network CLI for RFC-016 pack, inspect, and cache steps. */
export declare function runVerifierKitCli(argv: readonly string[], io?: VerifierKitCliIo): Promise<number>;
