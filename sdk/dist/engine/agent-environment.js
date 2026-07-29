import { advanceTick } from './contracts.js';
import { enumerateActions } from './solver.js';
export const AGENT_TRANSCRIPT_VERSION = '1.3';
export class AgentEnvironmentError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'AgentEnvironmentError';
    }
}
function actionKey(action) {
    return JSON.stringify({
        id: action.id,
        ...(action.x !== undefined ? { x: action.x } : {}),
        ...(action.y !== undefined ? { y: action.y } : {}),
        ...(action.index !== undefined ? { index: action.index } : {}),
        ...(action.boardId !== undefined ? { boardId: action.boardId } : {}),
        ...(action.zoneId !== undefined ? { zoneId: action.zoneId } : {}),
        ...(action.seat !== undefined ? { seat: action.seat } : {}),
        ...(action.targets !== undefined ? { targets: action.targets } : {}),
    });
}
function copyAction(action) {
    return {
        ...action,
        ...(action.targets ? {
            targets: action.targets.map((target) => ({
                container: target.container,
                coord: Array.isArray(target.coord) ? [...target.coord] : target.coord,
            })),
        } : {}),
    };
}
function copyOutcome(outcome) {
    return outcome.kind === 'ongoing'
        ? { kind: 'ongoing' }
        : {
            kind: 'decided',
            ranking: outcome.ranking.map((entry) => ({ ...entry })),
            ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}),
        };
}
function assertSeed(seed) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
        throw new RangeError('seed must be an unsigned 32-bit integer');
    }
}
/**
 * Provider-neutral, deterministic environment for agentic play.
 *
 * Products inject their reducer and content. The SDK owns episode lifecycle,
 * concrete action discovery, validation, reward accounting, and transcripts.
 */
export class AgentEnvironment {
    options;
    level;
    seed;
    maxTicks;
    enumerateActions;
    isActionLegal;
    rewardFor;
    state;
    ticks = 0;
    totalReward = 0;
    lastReward = 0;
    ended = false;
    terminationReason = null;
    records = [];
    transcriptLevel;
    initialObservation;
    snapshotLevel;
    snapshotObservation;
    constructor(options) {
        this.options = options;
        this.level = options.level;
        this.seed = options.seed ?? 1;
        assertSeed(this.seed);
        if (options.seat !== undefined && (typeof options.seat !== 'string' || options.seat.length === 0)) {
            throw new TypeError('seat must be a non-empty string');
        }
        this.maxTicks = options.maxTicks ?? 10_000;
        if (!Number.isSafeInteger(this.maxTicks) || this.maxTicks <= 0) {
            throw new RangeError('maxTicks must be a positive safe integer');
        }
        this.enumerateActions = options.enumerateActions ?? ((view) => enumerateActions(view));
        this.isActionLegal = options.isActionLegal ?? ((action, _view, concrete) => {
            const withoutHostedSeat = (value) => (options.seat && value.seat === options.seat
                ? { ...value, seat: undefined }
                : value);
            const candidate = actionKey(withoutHostedSeat(action));
            return concrete.some((legal) => actionKey(withoutHostedSeat(legal)) === candidate);
        });
        this.rewardFor = options.reward ?? ((_previous, next) => {
            if (options.seat && next.outcome?.kind === 'decided') {
                const result = next.outcome.ranking.find(({ seat }) => seat === options.seat);
                if (result)
                    return result.score ?? (result.rank === 1 ? 1 : 0);
            }
            return next.status === 'won' ? (next.stars ?? 1) : 0;
        });
        this.snapshotLevel = options.snapshotLevel ?? ((level) => {
            try {
                return structuredClone(level);
            }
            catch (error) {
                throw new TypeError('level is not cloneable; provide AgentEnvironmentOptions.snapshotLevel', { cause: error });
            }
        });
        this.snapshotObservation = options.snapshotObservation ?? ((view) => {
            try {
                return structuredClone(view);
            }
            catch (error) {
                throw new TypeError('view is not cloneable; provide AgentEnvironmentOptions.snapshotObservation', { cause: error });
            }
        });
    }
    reset(options = {}) {
        if (options.level !== undefined)
            this.level = options.level;
        if (options.seed !== undefined)
            this.seed = options.seed;
        assertSeed(this.seed);
        this.transcriptLevel = this.snapshotLevel(this.level);
        this.state = this.options.reducer.init(this.level, this.seed);
        this.ticks = 0;
        this.totalReward = 0;
        this.lastReward = 0;
        this.ended = false;
        this.terminationReason = null;
        this.records = [];
        const view = this.viewOf(this.state);
        this.initialObservation = this.snapshotObservation(view);
        if (view.status !== 'playing' || view.outcome?.kind === 'decided') {
            this.ended = true;
            this.terminationReason = view.status !== 'playing' ? view.status : 'decided';
        }
        return this.result(view);
    }
    observe() {
        return this.result(this.currentView());
    }
    step(action) {
        return this.stepInternal(action);
    }
    stepInternal(action) {
        if (this.state === undefined) {
            throw new AgentEnvironmentError('not_started', 'call reset() before step()');
        }
        if (this.ended) {
            throw new AgentEnvironmentError('episode_done', 'reset the environment before another step');
        }
        const previous = this.currentView();
        const gameplay = this.enumerateActions(previous);
        const systems = previous.systemActions
            ? enumerateActions({ ...previous, actions: previous.systemActions })
            : [];
        const candidate = copyAction(action);
        const concrete = [...gameplay, ...systems];
        if (!this.isActionLegal(candidate, previous, concrete)) {
            throw new AgentEnvironmentError('illegal_action', `action is not legal for this tick: ${actionKey(candidate)}`);
        }
        if (this.options.seat && candidate.seat !== undefined
            && candidate.seat !== this.options.seat) {
            throw new AgentEnvironmentError('illegal_action', `action seat ${candidate.seat} does not match environment seat ${this.options.seat}`);
        }
        const appliedAction = this.options.seat && candidate.seat === undefined
            ? { ...candidate, seat: this.options.seat }
            : candidate;
        this.state = advanceTick(this.options.reducer, this.state, [appliedAction]);
        this.ticks++;
        const next = this.viewOf(this.state);
        const reward = this.rewardFor(previous, next, appliedAction, this.ticks, this.options.seat);
        if (!Number.isFinite(reward))
            throw new TypeError('reward must be finite');
        this.lastReward = reward;
        this.totalReward += reward;
        if (next.status !== 'playing' || next.outcome?.kind === 'decided') {
            this.ended = true;
            this.terminationReason = next.status !== 'playing' ? next.status : 'decided';
        }
        else if (this.ticks >= this.maxTicks) {
            this.ended = true;
            this.terminationReason = 'tick_limit';
        }
        this.records.push({
            n: this.ticks,
            action: copyAction(appliedAction),
            reward,
            status: next.status,
            actionsUsed: next.hud.actionsUsed,
            observation: this.snapshotObservation(next),
        });
        return this.result(next);
    }
    /** Reset and deterministically replay a canonical action list. */
    replay(actions, options = {}) {
        let step = this.reset(options);
        for (const action of actions)
            step = this.stepInternal(action);
        return step;
    }
    transcript() {
        const step = this.observe();
        if (this.transcriptLevel === undefined || this.initialObservation === undefined) {
            throw new AgentEnvironmentError('not_started', 'call reset() before transcript()');
        }
        return {
            version: AGENT_TRANSCRIPT_VERSION,
            level: this.snapshotLevel(this.transcriptLevel),
            seed: this.seed,
            ...(this.options.seat ? { seat: this.options.seat } : {}),
            initialObservation: this.snapshotObservation(this.initialObservation),
            actions: this.records.map((record) => ({
                ...record,
                action: copyAction(record.action),
                observation: this.snapshotObservation(record.observation),
            })),
            result: {
                ...step.info,
                ...(step.info.outcome ? { outcome: copyOutcome(step.info.outcome) } : {}),
            },
        };
    }
    currentView() {
        if (this.state === undefined) {
            throw new AgentEnvironmentError('not_started', 'call reset() before observe()');
        }
        return this.viewOf(this.state);
    }
    viewOf(state) {
        return this.options.seat && this.options.reducer.viewFor
            ? this.options.reducer.viewFor(state, this.options.seat)
            : this.options.reducer.view(state);
    }
    result(view) {
        const terminated = this.ended && this.terminationReason !== 'tick_limit';
        const truncated = this.terminationReason === 'tick_limit';
        return {
            observation: view,
            actionDefinitions: view.actions,
            legalActions: this.ended ? [] : this.enumerateActions(view),
            systemActions: this.ended || !view.systemActions
                ? []
                : enumerateActions({ ...view, actions: view.systemActions }),
            reward: this.lastReward,
            terminated,
            truncated,
            done: terminated || truncated,
            info: {
                seed: this.seed,
                ...(this.options.seat ? { seat: this.options.seat } : {}),
                ticks: this.ticks,
                totalReward: this.totalReward,
                status: view.status,
                stars: view.stars ?? null,
                actionsUsed: view.hud.actionsUsed,
                ...(view.outcome ? { outcome: copyOutcome(view.outcome) } : {}),
                terminationReason: this.terminationReason,
            },
        };
    }
}
