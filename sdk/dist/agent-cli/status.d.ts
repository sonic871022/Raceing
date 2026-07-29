import type { CliAgentSpec } from './specs.js';
export interface CliAgentStatus {
    id: string;
    label: string;
    bin: string;
    installed: boolean;
    auth: 'ok' | 'none' | 'unknown';
    detail: string;
    login: string;
}
export declare function resolveCliExecutable(bin: string, path?: string): string | undefined;
export declare function inspectCliAgent(spec: CliAgentSpec, options?: {
    path?: string;
    timeoutMs?: number;
}): Promise<CliAgentStatus>;
