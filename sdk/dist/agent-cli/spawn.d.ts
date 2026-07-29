import { type ChildProcess } from 'node:child_process';
import type { AgentInterruptionResult } from '../agent/driver.js';
import type { CliAgentLaunchContext, CliAgentSpec } from './specs.js';
export interface CliAgentExit {
    code: number | null;
    signal: NodeJS.Signals | null;
    stderrTail: string;
}
export interface CliAgentProcess {
    child: ChildProcess;
    workdir: string;
    completion: Promise<CliAgentExit>;
    interruptionMode: 'resume' | 'unsupported';
    interrupt(options: CliAgentInterruptOptions): Promise<CliAgentInterruptionResult>;
    stop(signal?: NodeJS.Signals): boolean;
}
export interface CliAgentInterruptOptions {
    prompt: string;
    /** Product-owned transport reset performed after exit and before resume. */
    beforeResume?(): void | Promise<void>;
}
export interface CliAgentInterruptionResult extends AgentInterruptionResult {
    process?: CliAgentProcess;
}
export interface SpawnCliAgentOptions {
    env?: NodeJS.ProcessEnv;
    onStdout?(text: string): void;
    onStderr?(text: string): void;
    onTranscript?(text: string): void;
    /** Retain the scratch directory after exit for debugging. */
    keepWorkdir?: boolean;
}
/** Launch an MCP-capable agent in an isolated scratch directory. */
export declare function spawnCliAgent(spec: CliAgentSpec, context: CliAgentLaunchContext, options?: SpawnCliAgentOptions): CliAgentProcess;
