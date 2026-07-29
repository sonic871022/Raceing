export interface AgentCliIO {
    stdout(text: string): void;
    stderr(text: string): void;
    env: NodeJS.ProcessEnv;
    cwd: string;
}
declare const HELP = "gaos-agent \u2014 run keyed or installed CLI agents against tick-based game environments\n\nCommands:\n  drivers\n      List built-in keyed providers and MCP-capable CLI agents.\n  status [cli-id]\n      Check whether CLI agents are installed and authenticated.\n  check <provider>\n      Validate the provider key from its standard environment variable.\n  spawn <cli-id> --mcp-url <url> --prompt <text> [--server-name game] [--tools observe,act]\n      Launch an installed CLI agent against an MCP endpoint in a scratch directory.\n  run <provider> --module <file> [--model <id>] [--seed <uint32>] [--prompt <system prompt>]\n      Load createEnvironment({ seed }) from an ESM module and run a keyed agent episode.\n\nKeys are read only from ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY, or\nOPENROUTER_API_KEY. They are never accepted as command arguments.\n\nCustom CLI recipes can be supplied through GAOS_AGENT_CLIS as documented by\ncustomCliAgentsFromJson in @yugao-gaos/turn-based-grid-sdk/agent-cli.\nOLLAMA_MODEL selects the model used by the built-in Ollama recipe (default: qwen3.5).\n";
/** Programmatic entry point used by the `gaos-agent` executable. */
export declare function runAgentCli(argv: readonly string[], io?: AgentCliIO): Promise<number>;
export { HELP as AGENT_CLI_HELP };
