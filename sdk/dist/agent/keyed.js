import { locationKey } from '../engine/locations.js';
import { isLegalAgentDecision, } from './driver.js';
export class KeyedProviderRegistry {
    providers = new Map();
    aliases = new Map();
    constructor(providers = []) {
        for (const provider of providers)
            this.register(provider);
    }
    register(provider, options = {}) {
        if (!provider.id.trim())
            throw new TypeError('keyed provider id must not be empty');
        if (this.providers.has(provider.id) && !options.replace) {
            throw new Error(`keyed provider is already registered: ${provider.id}`);
        }
        this.providers.set(provider.id, provider);
        for (const alias of options.aliases ?? [])
            this.alias(alias, provider.id);
        return this;
    }
    alias(alias, providerId) {
        if (!this.providers.has(providerId))
            throw new Error(`unknown keyed provider: ${providerId}`);
        this.aliases.set(alias, providerId);
        return this;
    }
    get(id) {
        const normalized = id.startsWith('key:') ? id.slice(4) : id;
        return this.providers.get(this.aliases.get(normalized) ?? normalized);
    }
    require(id) {
        const provider = this.get(id);
        if (!provider)
            throw new Error(`unknown keyed provider: ${id}`);
        return provider;
    }
    list() {
        return [...this.providers.values()];
    }
}
const DEFAULT_SYSTEM_PROMPT = [
    'You are controlling a deterministic tick-based game environment.',
    'Choose exactly one entry from legalActions or systemActions.',
    'Return only JSON with this shape:',
    '{"reasoning":"brief explanation","action":{"id":"action id","x":0,"y":0,"index":0,"boardId":"board","seat":"seat","targets":[{"container":"board","coord":[1,2]}]},"message":"optional"}',
    'Omit x, y, index, boardId, zoneId, seat, or targets when the selected legal action does not contain it.',
].join('\n');
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function balancedJsonObject(text) {
    let start = -1;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (start < 0) {
            if (char === '{') {
                start = index;
                depth = 1;
            }
            continue;
        }
        if (quoted) {
            if (escaped)
                escaped = false;
            else if (char === '\\')
                escaped = true;
            else if (char === '"')
                quoted = false;
            continue;
        }
        if (char === '"')
            quoted = true;
        else if (char === '{')
            depth++;
        else if (char === '}' && --depth === 0)
            return text.slice(start, index + 1);
    }
    return undefined;
}
function optionalInteger(value, name) {
    if (value === undefined)
        return undefined;
    if (!Number.isInteger(value))
        throw new TypeError(`agent decision ${name} must be an integer`);
    return value;
}
function optionalString(value, name) {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`agent decision ${name} must be a non-empty string`);
    }
    return value;
}
function optionalTargets(value) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value))
        throw new TypeError('agent decision targets must be an array');
    return value.map((candidate, index) => {
        const target = record(candidate);
        if (!target)
            throw new TypeError(`agent decision targets[${index}] must be an object`);
        const location = {
            container: target.container,
            coord: target.coord,
        };
        try {
            locationKey(location);
        }
        catch (error) {
            throw new TypeError(`agent decision targets[${index}] is invalid`, { cause: error });
        }
        return location;
    });
}
/** Parse a model response into the provider-neutral action contract. */
export function parseAgentDecision(text) {
    const json = balancedJsonObject(text);
    if (!json)
        throw new TypeError('agent response did not contain a JSON object');
    const root = record(JSON.parse(json));
    if (!root)
        throw new TypeError('agent response must be a JSON object');
    const nested = record(root.action);
    const candidate = nested ?? root;
    const id = typeof candidate.id === 'string'
        ? candidate.id
        : typeof candidate.action === 'string'
            ? candidate.action
            : undefined;
    if (!id?.trim())
        throw new TypeError('agent decision action.id must be a non-empty string');
    const action = {
        id,
        ...(candidate.x !== undefined ? { x: optionalInteger(candidate.x, 'x') } : {}),
        ...(candidate.y !== undefined ? { y: optionalInteger(candidate.y, 'y') } : {}),
        ...(candidate.index !== undefined ? { index: optionalInteger(candidate.index, 'index') } : {}),
        ...(candidate.boardId !== undefined ? { boardId: optionalString(candidate.boardId, 'boardId') } : {}),
        ...(candidate.zoneId !== undefined ? { zoneId: optionalString(candidate.zoneId, 'zoneId') } : {}),
        ...(candidate.seat !== undefined ? { seat: optionalString(candidate.seat, 'seat') } : {}),
        ...(candidate.targets !== undefined ? { targets: optionalTargets(candidate.targets) } : {}),
    };
    return {
        action,
        ...(typeof root.reasoning === 'string' ? { reasoning: root.reasoning } : {}),
        ...(typeof root.message === 'string' ? { message: root.message } : {}),
    };
}
export function formatAgentContext(context) {
    return JSON.stringify({
        step: context.step,
        observation: context.observation,
        actionDefinitions: context.actionDefinitions,
        legalActions: context.legalActions,
        systemActions: context.systemActions,
        guidance: context.guidance,
    });
}
function systemPrompt(options, context) {
    return [options.systemPrompt, context.systemPrompt, DEFAULT_SYSTEM_PROMPT]
        .filter((part) => typeof part === 'string' && part.trim().length > 0)
        .join('\n\n');
}
function secretSafeError(message, apiKey) {
    return new Error(apiKey ? message.split(apiKey).join('[redacted]') : message);
}
async function limitedResponseText(response, maxBytes) {
    if (!response.body)
        return '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
            await reader.cancel();
            throw new Error(`agent provider response exceeds ${maxBytes} bytes`);
        }
        text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
}
async function responseError(response, apiKey, maxBytes) {
    const body = (await limitedResponseText(response, maxBytes)).replace(/\s+/g, ' ').slice(0, 500);
    return secretSafeError(`agent provider returned HTTP ${response.status}${body ? `: ${body}` : ''}`, apiKey);
}
function defaultSleep(delayMs, signal) {
    if (delayMs === 0)
        return Promise.resolve();
    if (signal.aborted)
        return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason);
        };
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, delayMs);
        signal.addEventListener('abort', onAbort, { once: true });
    });
}
function assertNonNegativeInteger(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${name} must be a non-negative safe integer`);
    }
}
function providerSignal(timeoutMs, signals) {
    assertNonNegativeInteger(timeoutMs, 'timeoutMs');
    const timeout = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
    const present = [...signals, timeout].filter((signal) => signal !== undefined);
    if (present.length === 0)
        return undefined;
    return present.length === 1 ? present[0] : AbortSignal.any(present);
}
async function requestWithRetries(request, url, init, signal, options) {
    const jitter = () => {
        const value = options.retryJitter();
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
            throw new RangeError('retryJitter must return a finite number between 0 and 1');
        }
        return value;
    };
    for (let attempt = 0;; attempt++) {
        let response;
        try {
            response = await request(url, { ...init, signal });
        }
        catch (error) {
            if (signal.aborted || attempt >= options.maxRetries)
                throw error;
            const random = jitter();
            const delay = Math.min(options.maxRetryDelayMs, options.retryBaseDelayMs * (2 ** attempt) * (0.5 + random));
            await options.sleep(delay, signal);
            continue;
        }
        const transient = response.status === 429 || response.status >= 500;
        if (!transient || attempt >= options.maxRetries)
            return response;
        const retryAfter = response.headers.get('retry-after');
        let retryAfterMs = 0;
        if (retryAfter) {
            const seconds = Number(retryAfter);
            if (Number.isFinite(seconds))
                retryAfterMs = Math.max(0, seconds * 1000);
            else {
                const date = Date.parse(retryAfter);
                if (Number.isFinite(date))
                    retryAfterMs = Math.max(0, date - Date.now());
            }
        }
        await response.body?.cancel();
        const random = jitter();
        const backoff = options.retryBaseDelayMs * (2 ** attempt) * (0.5 + random);
        await options.sleep(Math.min(options.maxRetryDelayMs, Math.max(backoff, retryAfterMs)), signal);
    }
}
const utf8Bytes = (value) => new TextEncoder().encode(value).byteLength;
function boundedMessages(system, history, current, maxBytes) {
    const fixedBytes = utf8Bytes(system) + utf8Bytes(current);
    if (fixedBytes > maxBytes) {
        throw new RangeError(`agent context exceeds ${maxBytes} UTF-8 bytes without history`);
    }
    let start = 0;
    let historyBytes = history.reduce((total, message) => total + utf8Bytes(message.content), 0);
    while (fixedBytes + historyBytes > maxBytes && start < history.length) {
        const remove = Math.min(2, history.length - start);
        for (let index = 0; index < remove; index++) {
            historyBytes -= utf8Bytes(history[start + index].content);
        }
        start += remove;
    }
    return [
        { role: 'system', content: system },
        ...history.slice(start),
        { role: 'user', content: current },
    ];
}
function assertLegal(decision, context) {
    if (!isLegalAgentDecision(decision, [...context.legalActions, ...(context.systemActions ?? [])])) {
        throw new TypeError(`agent selected an illegal action: ${JSON.stringify(decision.action)}`);
    }
    return decision;
}
function usage(inputTokens, outputTokens) {
    const result = {};
    if (typeof inputTokens === 'number')
        result.inputTokens = inputTokens;
    if (typeof outputTokens === 'number')
        result.outputTokens = outputTokens;
    return Object.keys(result).length ? result : undefined;
}
export class OpenAICompatibleAgentDriver {
    options;
    id;
    label;
    request;
    model;
    baseUrl;
    maxTokens;
    maxHistoryTurns;
    maxContextBytes;
    maxResponseBytes;
    retryOptions;
    timeoutMs;
    history = [];
    activeRequest;
    constructor(id, label, options) {
        this.options = options;
        this.id = id;
        this.label = label;
        this.request = options.fetch ?? fetch;
        this.model = options.model ?? options.defaultModel ?? '';
        this.baseUrl = (options.baseUrl ?? options.defaultBaseUrl).replace(/\/$/, '');
        this.maxTokens = options.maxTokens ?? 800;
        this.maxHistoryTurns = options.maxHistoryTurns ?? 8;
        this.maxContextBytes = options.maxContextBytes ?? 256 * 1024;
        this.maxResponseBytes = options.maxResponseBytes ?? 1024 * 1024;
        this.timeoutMs = options.timeoutMs ?? 30_000;
        this.retryOptions = {
            maxRetries: options.maxRetries ?? 2,
            retryBaseDelayMs: options.retryBaseDelayMs ?? 250,
            maxRetryDelayMs: options.maxRetryDelayMs ?? 30_000,
            retryJitter: options.retryJitter ?? Math.random,
            sleep: options.sleep ?? defaultSleep,
        };
        assertNonNegativeInteger(this.maxHistoryTurns, 'maxHistoryTurns');
        if (!Number.isSafeInteger(this.maxContextBytes) || this.maxContextBytes < 1) {
            throw new RangeError('maxContextBytes must be a positive safe integer');
        }
        if (!Number.isSafeInteger(this.maxResponseBytes) || this.maxResponseBytes < 1) {
            throw new RangeError('maxResponseBytes must be a positive safe integer');
        }
        assertNonNegativeInteger(this.timeoutMs, 'timeoutMs');
        assertNonNegativeInteger(this.retryOptions.maxRetries, 'maxRetries');
        if (!Number.isFinite(this.retryOptions.retryBaseDelayMs) || this.retryOptions.retryBaseDelayMs < 0) {
            throw new RangeError('retryBaseDelayMs must be a non-negative finite number');
        }
        if (!Number.isFinite(this.retryOptions.maxRetryDelayMs) || this.retryOptions.maxRetryDelayMs < 0) {
            throw new RangeError('maxRetryDelayMs must be a non-negative finite number');
        }
        if (!options.apiKey)
            throw new TypeError('apiKey must not be empty');
        if (!this.model)
            throw new TypeError(`model is required for keyed provider ${id}`);
    }
    reset() {
        this.history.length = 0;
        this.activeRequest?.abort(new Error('agent reset'));
        this.activeRequest = undefined;
    }
    interrupt() {
        const interrupted = this.activeRequest !== undefined;
        this.activeRequest?.abort(new Error('agent interrupted'));
        return { mode: 'abort', interrupted, preservesContext: true };
    }
    async act(context) {
        if (this.activeRequest)
            throw new Error('agent request already in progress');
        const controller = new AbortController();
        this.activeRequest = controller;
        const userMessage = formatAgentContext(context);
        try {
            const signal = providerSignal(this.timeoutMs, [context.signal, controller.signal]);
            const prompt = systemPrompt(this.options, context);
            const messages = boundedMessages(prompt, this.history, userMessage, this.maxContextBytes);
            const response = await requestWithRetries(this.request, `${this.baseUrl}/chat/completions`, {
                method: 'POST',
                signal,
                headers: {
                    authorization: `Bearer ${this.options.apiKey}`,
                    'content-type': 'application/json',
                    ...this.options.headers,
                },
                body: JSON.stringify({
                    model: this.model,
                    max_tokens: this.maxTokens,
                    messages,
                }),
            }, signal, this.retryOptions);
            if (!response.ok)
                throw await responseError(response, this.options.apiKey, this.maxResponseBytes);
            const raw = JSON.parse(await limitedResponseText(response, this.maxResponseBytes));
            const payload = record(raw);
            const choices = Array.isArray(payload?.choices) ? payload.choices : [];
            const first = record(choices[0]);
            const message = record(first?.message);
            if (typeof message?.content !== 'string')
                throw new TypeError('agent provider returned no message content');
            const parsed = parseAgentDecision(message.content);
            const tokens = record(payload?.usage);
            const decision = assertLegal({
                ...parsed,
                raw,
                usage: usage(tokens?.prompt_tokens, tokens?.completion_tokens),
            }, context);
            this.history.push({ role: 'user', content: userMessage }, { role: 'assistant', content: message.content });
            this.history.splice(0, Math.max(0, this.history.length - this.maxHistoryTurns * 2));
            while (this.history.length > 2
                && this.history.reduce((total, item) => total + utf8Bytes(item.content), 0) > this.maxContextBytes) {
                this.history.splice(0, 2);
            }
            return decision;
        }
        finally {
            if (this.activeRequest === controller)
                this.activeRequest = undefined;
        }
    }
}
export class AnthropicAgentDriver {
    options;
    id;
    label;
    request;
    model;
    baseUrl;
    maxTokens;
    maxHistoryTurns;
    maxContextBytes;
    maxResponseBytes;
    retryOptions;
    timeoutMs;
    history = [];
    activeRequest;
    constructor(id, label, options) {
        this.options = options;
        this.id = id;
        this.label = label;
        this.request = options.fetch ?? fetch;
        this.model = options.model ?? options.defaultModel ?? '';
        this.baseUrl = (options.baseUrl ?? options.defaultBaseUrl).replace(/\/$/, '');
        this.maxTokens = options.maxTokens ?? 800;
        this.maxHistoryTurns = options.maxHistoryTurns ?? 8;
        this.maxContextBytes = options.maxContextBytes ?? 256 * 1024;
        this.maxResponseBytes = options.maxResponseBytes ?? 1024 * 1024;
        this.timeoutMs = options.timeoutMs ?? 30_000;
        this.retryOptions = {
            maxRetries: options.maxRetries ?? 2,
            retryBaseDelayMs: options.retryBaseDelayMs ?? 250,
            maxRetryDelayMs: options.maxRetryDelayMs ?? 30_000,
            retryJitter: options.retryJitter ?? Math.random,
            sleep: options.sleep ?? defaultSleep,
        };
        assertNonNegativeInteger(this.maxHistoryTurns, 'maxHistoryTurns');
        if (!Number.isSafeInteger(this.maxContextBytes) || this.maxContextBytes < 1) {
            throw new RangeError('maxContextBytes must be a positive safe integer');
        }
        if (!Number.isSafeInteger(this.maxResponseBytes) || this.maxResponseBytes < 1) {
            throw new RangeError('maxResponseBytes must be a positive safe integer');
        }
        assertNonNegativeInteger(this.timeoutMs, 'timeoutMs');
        assertNonNegativeInteger(this.retryOptions.maxRetries, 'maxRetries');
        if (!Number.isFinite(this.retryOptions.retryBaseDelayMs) || this.retryOptions.retryBaseDelayMs < 0) {
            throw new RangeError('retryBaseDelayMs must be a non-negative finite number');
        }
        if (!Number.isFinite(this.retryOptions.maxRetryDelayMs) || this.retryOptions.maxRetryDelayMs < 0) {
            throw new RangeError('maxRetryDelayMs must be a non-negative finite number');
        }
        if (!options.apiKey)
            throw new TypeError('apiKey must not be empty');
        if (!this.model)
            throw new TypeError(`model is required for keyed provider ${id}`);
    }
    reset() {
        this.history.length = 0;
        this.activeRequest?.abort(new Error('agent reset'));
        this.activeRequest = undefined;
    }
    interrupt() {
        const interrupted = this.activeRequest !== undefined;
        this.activeRequest?.abort(new Error('agent interrupted'));
        return { mode: 'abort', interrupted, preservesContext: true };
    }
    async act(context) {
        if (this.activeRequest)
            throw new Error('agent request already in progress');
        const controller = new AbortController();
        this.activeRequest = controller;
        const userMessage = formatAgentContext(context);
        try {
            const signal = providerSignal(this.timeoutMs, [context.signal, controller.signal]);
            const prompt = systemPrompt(this.options, context);
            const messages = boundedMessages(prompt, this.history, userMessage, this.maxContextBytes);
            const response = await requestWithRetries(this.request, `${this.baseUrl}/messages`, {
                method: 'POST',
                signal,
                headers: {
                    'x-api-key': this.options.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                    ...this.options.headers,
                },
                body: JSON.stringify({
                    model: this.model,
                    max_tokens: this.maxTokens,
                    system: prompt,
                    messages: messages.slice(1),
                }),
            }, signal, this.retryOptions);
            if (!response.ok)
                throw await responseError(response, this.options.apiKey, this.maxResponseBytes);
            const raw = JSON.parse(await limitedResponseText(response, this.maxResponseBytes));
            const payload = record(raw);
            const content = Array.isArray(payload?.content) ? payload.content : [];
            const text = content
                .map(record)
                .filter((part) => part !== undefined)
                .filter((part) => part.type === 'text' && typeof part.text === 'string')
                .map((part) => part.text)
                .join('\n');
            if (!text)
                throw new TypeError('agent provider returned no message content');
            const parsed = parseAgentDecision(text);
            const tokens = record(payload?.usage);
            const decision = assertLegal({
                ...parsed,
                raw,
                usage: usage(tokens?.input_tokens, tokens?.output_tokens),
            }, context);
            this.history.push({ role: 'user', content: userMessage }, { role: 'assistant', content: text });
            this.history.splice(0, Math.max(0, this.history.length - this.maxHistoryTurns * 2));
            while (this.history.length > 2
                && this.history.reduce((total, item) => total + utf8Bytes(item.content), 0) > this.maxContextBytes) {
                this.history.splice(0, 2);
            }
            return decision;
        }
        finally {
            if (this.activeRequest === controller)
                this.activeRequest = undefined;
        }
    }
}
function openAIProvider(options) {
    return {
        ...options,
        async check(apiKey, checkOptions = {}) {
            if (!apiKey)
                return { ok: false, detail: `missing ${options.apiKeyEnv}` };
            try {
                const response = await (checkOptions.fetch ?? fetch)(`${options.baseUrl}/models`, {
                    signal: providerSignal(checkOptions.timeoutMs ?? 30_000, [checkOptions.signal]),
                    headers: { authorization: `Bearer ${apiKey}` },
                });
                return response.ok
                    ? { ok: true, detail: 'API key accepted' }
                    : { ok: false, detail: `API returned HTTP ${response.status}` };
            }
            catch (error) {
                return { ok: false, detail: secretSafeError(String(error), apiKey).message };
            }
        },
        createDriver(driverOptions) {
            return new OpenAICompatibleAgentDriver(options.id, options.label, {
                ...driverOptions,
                defaultBaseUrl: options.baseUrl,
                defaultModel: options.defaultModel,
            });
        },
    };
}
const anthropicProvider = {
    id: 'anthropic',
    label: 'Anthropic',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    login: 'https://console.anthropic.com/settings/keys',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-opus-4-8',
    async check(apiKey, options = {}) {
        if (!apiKey)
            return { ok: false, detail: 'missing ANTHROPIC_API_KEY' };
        try {
            const response = await (options.fetch ?? fetch)(`${anthropicProvider.baseUrl}/models`, {
                signal: providerSignal(options.timeoutMs ?? 30_000, [options.signal]),
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
            });
            return response.ok
                ? { ok: true, detail: 'API key accepted' }
                : { ok: false, detail: `API returned HTTP ${response.status}` };
        }
        catch (error) {
            return { ok: false, detail: secretSafeError(String(error), apiKey).message };
        }
    },
    createDriver(options) {
        return new AnthropicAgentDriver(anthropicProvider.id, anthropicProvider.label, {
            ...options,
            defaultBaseUrl: anthropicProvider.baseUrl,
            defaultModel: anthropicProvider.defaultModel,
        });
    },
};
export const KEYED_PROVIDERS = [
    anthropicProvider,
    openAIProvider({
        id: 'openai',
        label: 'OpenAI',
        apiKeyEnv: 'OPENAI_API_KEY',
        login: 'https://platform.openai.com/api-keys',
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-5.1',
    }),
    openAIProvider({
        id: 'xai',
        label: 'xAI',
        apiKeyEnv: 'XAI_API_KEY',
        login: 'https://console.x.ai/',
        baseUrl: 'https://api.x.ai/v1',
        defaultModel: 'grok-4',
    }),
    openAIProvider({
        id: 'openrouter',
        label: 'OpenRouter',
        apiKeyEnv: 'OPENROUTER_API_KEY',
        login: 'https://openrouter.ai/keys',
        baseUrl: 'https://openrouter.ai/api/v1',
        defaultModel: 'openrouter/auto',
    }),
];
export function createDefaultKeyedProviderRegistry() {
    return new KeyedProviderRegistry(KEYED_PROVIDERS)
        .alias('api', 'anthropic')
        .alias('router', 'openrouter');
}
export function createKeyedAgentDriver(providerId, options, registry = createDefaultKeyedProviderRegistry()) {
    return registry.require(providerId).createDriver(options);
}
