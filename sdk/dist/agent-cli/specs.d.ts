export declare const DEFAULT_CLAUDE_CLI_MODEL = "claude-opus-4-8";
/** Ollama's documented local agent model recommendation. Override with OLLAMA_MODEL. */
export declare const DEFAULT_OLLAMA_CLI_MODEL = "qwen3.5";
export interface CliAgentLaunchContext {
    mcpUrl: string;
    prompt: string;
    /** Stable conversation id used to resume an interrupted CLI invocation. */
    sessionId?: string;
    /** Resume `sessionId` instead of creating a new conversation. */
    resume?: boolean;
    /** MCP server name used in CLI configuration. Defaults to `game`. */
    serverName?: string;
    /** Tools permitted for CLIs that support an allowlist. */
    toolNames?: readonly string[];
}
export interface CliAgentLaunch {
    argv: string[];
    files: Record<string, string>;
}
export interface CliAgentSpec {
    id: string;
    label: string;
    /** Executable resolved on PATH. */
    bin: string;
    launch(context: CliAgentLaunchContext): CliAgentLaunch;
    parseLine?(line: string): string[];
    login: string;
    /** Whether this recipe can continue a previous conversation by session id. */
    supportsResume?: boolean;
    status?: {
        argv: string[];
        ok(code: number, output: string): boolean;
        summary?(output: string): string;
    };
}
export interface CustomCliAgentDefinition {
    label?: string;
    bin: string;
    args: string[];
    files?: Record<string, string>;
    login?: string;
}
export declare class CliAgentRegistry {
    private readonly agents;
    constructor(agents?: readonly CliAgentSpec[]);
    register(agent: CliAgentSpec, options?: {
        replace?: boolean;
    }): this;
    get(id: string): CliAgentSpec | undefined;
    require(id: string): CliAgentSpec;
    list(): CliAgentSpec[];
}
export declare function parseStreamJson(line: string): string[];
export declare function parseCodexJson(line: string): string[];
export declare function parseGenericLine(line: string): string[];
/** Built-in MCP launch recipes. Product prompts and MCP implementations stay outside this package. */
export declare function createBuiltinCliAgents(options?: {
    claudeModel?: string;
    ollamaModel?: string;
}): CliAgentSpec[];
/** Parse declarative custom agents from JSON, without evaluating user code. */
export declare function customCliAgentsFromJson(raw: string): CliAgentSpec[];
export declare function createDefaultCliAgentRegistry(options?: {
    claudeModel?: string;
    ollamaModel?: string;
    customAgentsJson?: string;
}): CliAgentRegistry;
