export interface BenchmarkCliIo {
    cwd?: string;
    stdout?: (text: string) => void;
    stderr?: (text: string) => void;
}
/** Filesystem CLI for deterministic benchmark run/resume/pack/verify. */
export declare function runBenchmarkCli(argv: readonly string[], io?: BenchmarkCliIo): Promise<number>;
