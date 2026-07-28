export const DEFAULT_CLAUDE_CLI_MODEL = 'claude-opus-4-8';
/** Ollama's documented local agent model recommendation. Override with OLLAMA_MODEL. */
export const DEFAULT_OLLAMA_CLI_MODEL = 'qwen3.5';

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

export class CliAgentRegistry {
  private readonly agents = new Map<string, CliAgentSpec>();

  constructor(agents: readonly CliAgentSpec[] = []) {
    for (const agent of agents) this.register(agent);
  }

  register(agent: CliAgentSpec, options: { replace?: boolean } = {}): this {
    if (!agent.id.trim()) throw new TypeError('CLI agent id must not be empty');
    if (this.agents.has(agent.id) && !options.replace) {
      throw new Error(`CLI agent is already registered: ${agent.id}`);
    }
    this.agents.set(agent.id, agent);
    return this;
  }

  get(id: string): CliAgentSpec | undefined {
    return this.agents.get(id);
  }

  require(id: string): CliAgentSpec {
    const agent = this.get(id);
    if (!agent) throw new Error(`unknown CLI agent: ${id}`);
    return agent;
  }

  list(): CliAgentSpec[] {
    return [...this.agents.values()];
  }
}

function contextValues(context: CliAgentLaunchContext): {
  serverName: string;
  toolNames: readonly string[];
  allowedTools: string;
} {
  const serverName = context.serverName ?? 'game';
  if (!/^[a-zA-Z0-9_-]+$/.test(serverName)) {
    throw new TypeError('serverName may contain only letters, digits, underscores, and hyphens');
  }
  const toolNames = context.toolNames ?? ['observe', 'act', 'reset', 'transcript'];
  for (const tool of toolNames) {
    if (!/^[a-zA-Z0-9_-]+$/.test(tool)) {
      throw new TypeError('tool names may contain only letters, digits, underscores, and hyphens');
    }
  }
  return {
    serverName,
    toolNames,
    allowedTools: toolNames.map((tool) => `mcp__${serverName}__${tool}`).join(','),
  };
}

export function parseStreamJson(line: string): string[] {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return [];
  }
  const message = event.message as { content?: Array<Record<string, unknown>> } | undefined;
  if (event.type !== 'assistant' || !Array.isArray(message?.content)) return [];
  const thinking = message.content
    .filter((block) => block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking.trim())
    .map((block) => (block.thinking as string).trim());
  if (thinking.length) return thinking;
  return message.content
    .filter((block) => block.type === 'text' && typeof block.text === 'string' && block.text.trim())
    .map((block) => (block.text as string).trim());
}

export function parseCodexJson(line: string): string[] {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return [];
  }
  const item = (event.item ?? event.msg) as Record<string, unknown> | undefined;
  if (!item) return [];
  const kind = item.item_type ?? item.type;
  if (kind !== 'agent_message' && kind !== 'agent_reasoning' && kind !== 'reasoning') return [];
  const value = item.text ?? item.message;
  return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

export function parseGenericLine(line: string): string[] {
  const value = line.trim();
  if (!value) return [];
  try {
    const event = JSON.parse(value) as Record<string, unknown>;
    const part = event.part as Record<string, unknown> | undefined;
    const text = event.text ?? event.message ?? part?.text;
    return typeof text === 'string' && text.trim() ? [text.trim()] : [];
  } catch {
    return [value];
  }
}

function claudeLaunchArgs(
  context: CliAgentLaunchContext,
  options: { model?: string } = {},
): string[] {
  const values = contextValues(context);
  return [
    '-p', context.prompt,
    ...(context.resume && context.sessionId
      ? ['--resume', context.sessionId]
      : context.sessionId ? ['--session-id', context.sessionId] : []),
    ...(options.model ? ['--model', options.model] : []),
    '--mcp-config', JSON.stringify({
      mcpServers: { [values.serverName]: { type: 'http', url: context.mcpUrl } },
    }),
    '--strict-mcp-config',
    '--allowedTools', values.allowedTools,
    '--permission-mode', 'bypassPermissions',
    '--output-format', 'stream-json',
    '--verbose',
  ];
}

/** Built-in MCP launch recipes. Product prompts and MCP implementations stay outside this package. */
export function createBuiltinCliAgents(options: {
  claudeModel?: string;
  ollamaModel?: string;
} = {}): CliAgentSpec[] {
  return [
    {
      id: 'claude',
      label: 'Claude Code',
      bin: 'claude',
      supportsResume: true,
      launch: (context) => ({
        argv: claudeLaunchArgs(context, { model: options.claudeModel ?? DEFAULT_CLAUDE_CLI_MODEL }),
        files: {},
      }),
      parseLine: parseStreamJson,
      login: 'In a terminal run: claude auth login (or open claude and type /login)',
      status: {
        argv: ['auth', 'status'],
        ok: (code, output) => code === 0 && /"loggedIn":\s*true/.test(output),
        summary: (output) => {
          const email = /"email":\s*"([^"]+)"/.exec(output)?.[1];
          const plan = /"subscriptionType":\s*"([^"]+)"/.exec(output)?.[1];
          return email ? `signed in as ${email}${plan ? ` (${plan})` : ''}` : 'not signed in';
        },
      },
    },
    {
      id: 'ollama',
      label: 'Ollama + Claude Code',
      bin: 'ollama',
      supportsResume: true,
      launch: (context) => ({
        argv: [
          'launch',
          'claude',
          '--model', options.ollamaModel ?? DEFAULT_OLLAMA_CLI_MODEL,
          '--yes',
          '--',
          ...claudeLaunchArgs(context),
        ],
        files: {},
      }),
      parseLine: parseStreamJson,
      login: 'Install Ollama and Claude Code. Ollama runs the selected local model; no model API key is required.',
      status: {
        argv: ['ls'],
        ok: (code) => code === 0,
        summary: () => 'Ollama is installed and its local service is reachable',
      },
    },
    {
      id: 'codex',
      label: 'Codex CLI',
      bin: 'codex',
      launch: (context) => {
        const { serverName } = contextValues(context);
        return {
          argv: [
            'exec',
            '--ignore-user-config',
            '--disable', 'plugins',
            '--disable', 'apps',
            '--disable', 'shell_tool',
            '--json',
            '--skip-git-repo-check',
            '--sandbox', 'read-only',
            '-c', 'web_search="disabled"',
            '-c', `mcp_servers.${serverName}.url="${context.mcpUrl}"`,
            '-c', `mcp_servers.${serverName}.default_tools_approval_mode="approve"`,
            context.prompt,
          ],
          files: {},
        };
      },
      parseLine: parseCodexJson,
      login: 'In a terminal run: codex login',
      status: {
        argv: ['login', 'status'],
        ok: (code, output) => code === 0 && /logged in/i.test(output),
      },
    },
    {
      id: 'cursor',
      label: 'Cursor CLI',
      bin: 'cursor-agent',
      launch: (context) => {
        const { serverName } = contextValues(context);
        return {
          argv: ['-p', context.prompt, '--output-format', 'stream-json', '--approve-mcps', '--force'],
          files: {
            '.cursor/mcp.json': JSON.stringify({
              mcpServers: { [serverName]: { url: context.mcpUrl } },
            }),
          },
        };
      },
      parseLine: parseStreamJson,
      login: 'In a terminal run: cursor-agent login',
      status: { argv: ['status'], ok: (code, output) => code === 0 && /logged in/i.test(output) },
    },
    {
      id: 'grok',
      label: 'Grok CLI',
      bin: 'grok',
      launch: (context) => {
        const { serverName } = contextValues(context);
        return {
          argv: [
            '-p', context.prompt,
            '--always-approve',
            '--disable-web-search',
            '--no-auto-update',
            '--output-format', 'streaming-json',
          ],
          files: { '.grok/config.toml': `[mcp_servers.${serverName}]\nurl = "${context.mcpUrl}"\n` },
        };
      },
      parseLine: parseGenericLine,
      login: 'Install with: npm install -g @xai-official/grok — then run: grok login',
    },
    {
      id: 'opencode',
      label: 'OpenCode CLI',
      bin: 'opencode',
      launch: (context) => {
        const { serverName } = contextValues(context);
        return {
          argv: ['run', '--format', 'json', context.prompt],
          files: {
            'opencode.json': JSON.stringify({
              $schema: 'https://opencode.ai/config.json',
              mcp: { [serverName]: { type: 'remote', url: context.mcpUrl, enabled: true } },
              permission: { edit: 'deny', bash: 'deny', webfetch: 'deny' },
            }),
          },
        };
      },
      parseLine: parseGenericLine,
      login: 'In a terminal run: opencode auth login',
      status: {
        argv: ['auth', 'list'],
        ok: (code, output) => code === 0 && /[1-9]\d* credentials?/.test(output),
      },
    },
  ];
}

function fill(template: string, context: CliAgentLaunchContext): string {
  const { serverName, allowedTools } = contextValues(context);
  return template
    .replaceAll('{mcpUrl}', context.mcpUrl)
    .replaceAll('{prompt}', context.prompt)
    .replaceAll('{serverName}', serverName)
    .replaceAll('{allowedTools}', allowedTools);
}

/** Parse declarative custom agents from JSON, without evaluating user code. */
export function customCliAgentsFromJson(raw: string): CliAgentSpec[] {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('custom CLI agent JSON must be an object keyed by agent id');
  }
  const agents: CliAgentSpec[] = [];
  for (const [id, value] of Object.entries(parsed)) {
    const definition = value as Partial<CustomCliAgentDefinition>;
    if (typeof definition.bin !== 'string' || !Array.isArray(definition.args)
      || !definition.args.every((arg) => typeof arg === 'string')) {
      throw new TypeError(`custom CLI agent ${id} requires bin and string args`);
    }
    if (definition.files && Object.values(definition.files).some((content) => typeof content !== 'string')) {
      throw new TypeError(`custom CLI agent ${id} files must contain strings`);
    }
    agents.push({
      id,
      label: definition.label ?? id,
      bin: definition.bin,
      launch: (context) => ({
        argv: definition.args!.map((arg) => fill(arg, context)),
        files: Object.fromEntries(
          Object.entries(definition.files ?? {}).map(([path, content]) => [path, fill(content, context)]),
        ),
      }),
      parseLine: parseGenericLine,
      login: definition.login ?? `Authenticate ${definition.bin} using its own CLI`,
    });
  }
  return agents;
}

export function createDefaultCliAgentRegistry(options: {
  claudeModel?: string;
  ollamaModel?: string;
  customAgentsJson?: string;
} = {}): CliAgentRegistry {
  const registry = new CliAgentRegistry(createBuiltinCliAgents({
    claudeModel: options.claudeModel,
    ollamaModel: options.ollamaModel,
  }));
  if (options.customAgentsJson) {
    for (const agent of customCliAgentsFromJson(options.customAgentsJson)) registry.register(agent);
  }
  return registry;
}
