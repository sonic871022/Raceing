import { type AgentDecision, type AgentDriver, type AgentDriverContext, type AgentInterruptionResult } from './driver.js';
export type AgentFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export interface KeyCheck {
    ok: boolean;
    detail: string;
}
export interface KeyedAgentDriverOptions {
    apiKey: string;
    model?: string;
    baseUrl?: string;
    fetch?: AgentFetch;
    maxTokens?: number;
    headers?: Readonly<Record<string, string>>;
    systemPrompt?: string;
    /** Number of completed user/assistant exchanges retained. Defaults to 8. */
    maxHistoryTurns?: number;
    /** Maximum UTF-8 bytes for system prompt, retained history, and current context. Defaults to 256 KiB. */
    maxContextBytes?: number;
    /** Maximum provider response body size. Defaults to 1 MiB. */
    maxResponseBytes?: number;
    /** Retries for HTTP 429 and 5xx responses. Defaults to 2. */
    maxRetries?: number;
    /** Initial exponential backoff delay in milliseconds. Defaults to 250. */
    retryBaseDelayMs?: number;
    /** Maximum retry delay after backoff and Retry-After handling. Defaults to 30 seconds. */
    maxRetryDelayMs?: number;
    /** Random source in [0, 1] for retry jitter. Defaults to Math.random. */
    retryJitter?: () => number;
    /** Optional delay implementation for deterministic harnesses. */
    sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
    /** Complete provider-call deadline. Defaults to 30,000; zero disables it. */
    timeoutMs?: number;
}
export interface KeyedProvider {
    readonly id: string;
    readonly label: string;
    readonly apiKeyEnv: string;
    readonly login: string;
    readonly baseUrl: string;
    readonly defaultModel?: string;
    check(apiKey: string, options?: {
        fetch?: AgentFetch;
        signal?: AbortSignal;
        /** Defaults to 30,000; zero disables it. */
        timeoutMs?: number;
    }): Promise<KeyCheck>;
    createDriver<TObservation = unknown>(options: KeyedAgentDriverOptions): AgentDriver<TObservation>;
}
export declare class KeyedProviderRegistry {
    private readonly providers;
    private readonly aliases;
    constructor(providers?: readonly KeyedProvider[]);
    register(provider: KeyedProvider, options?: {
        replace?: boolean;
        aliases?: readonly string[];
    }): this;
    alias(alias: string, providerId: string): this;
    get(id: string): KeyedProvider | undefined;
    require(id: string): KeyedProvider;
    list(): KeyedProvider[];
}
/** Parse a model response into the provider-neutral action contract. */
export declare function parseAgentDecision(text: string): AgentDecision;
export declare function formatAgentContext<TObservation>(context: AgentDriverContext<TObservation>): string;
export declare class OpenAICompatibleAgentDriver<TObservation = unknown> implements AgentDriver<TObservation> {
    private readonly options;
    readonly id: string;
    readonly label: string;
    private readonly request;
    private readonly model;
    private readonly baseUrl;
    private readonly maxTokens;
    private readonly maxHistoryTurns;
    private readonly maxContextBytes;
    private readonly maxResponseBytes;
    private readonly retryOptions;
    private readonly timeoutMs;
    private readonly history;
    private activeRequest?;
    constructor(id: string, label: string, options: KeyedAgentDriverOptions & {
        defaultModel?: string;
        defaultBaseUrl: string;
    });
    reset(): void;
    interrupt(): AgentInterruptionResult;
    act(context: AgentDriverContext<TObservation>): Promise<AgentDecision>;
}
export declare class AnthropicAgentDriver<TObservation = unknown> implements AgentDriver<TObservation> {
    private readonly options;
    readonly id: string;
    readonly label: string;
    private readonly request;
    private readonly model;
    private readonly baseUrl;
    private readonly maxTokens;
    private readonly maxHistoryTurns;
    private readonly maxContextBytes;
    private readonly maxResponseBytes;
    private readonly retryOptions;
    private readonly timeoutMs;
    private readonly history;
    private activeRequest?;
    constructor(id: string, label: string, options: KeyedAgentDriverOptions & {
        defaultModel?: string;
        defaultBaseUrl: string;
    });
    reset(): void;
    interrupt(): AgentInterruptionResult;
    act(context: AgentDriverContext<TObservation>): Promise<AgentDecision>;
}
export declare const KEYED_PROVIDERS: readonly [KeyedProvider, KeyedProvider, KeyedProvider, KeyedProvider];
export declare function createDefaultKeyedProviderRegistry(): KeyedProviderRegistry;
export declare function createKeyedAgentDriver<TObservation = unknown>(providerId: string, options: KeyedAgentDriverOptions, registry?: KeyedProviderRegistry): AgentDriver<TObservation>;
