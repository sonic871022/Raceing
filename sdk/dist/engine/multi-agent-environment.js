import { advanceTick } from './contracts.js';
import { enumerateActions } from './solver.js';
export const MULTI_AGENT_TRANSCRIPT_VERSION = '1.1';
export class MultiAgentEnvironmentError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'MultiAgentEnvironmentError';
    }
}
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
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
function actionKey(action, hostedSeat) {
    const normalized = hostedSeat && action.seat === hostedSeat
        ? { ...action, seat: undefined }
        : action;
    return JSON.stringify({
        id: normalized.id,
        ...(normalized.x !== undefined ? { x: normalized.x } : {}),
        ...(normalized.y !== undefined ? { y: normalized.y } : {}),
        ...(normalized.index !== undefined ? { index: normalized.index } : {}),
        ...(normalized.boardId !== undefined ? { boardId: normalized.boardId } : {}),
        ...(normalized.zoneId !== undefined ? { zoneId: normalized.zoneId } : {}),
        ...(normalized.seat !== undefined ? { seat: normalized.seat } : {}),
        ...(normalized.targets !== undefined ? { targets: normalized.targets } : {}),
    });
}
function defaultSnapshot(value, label) {
    try {
        return structuredClone(value);
    }
    catch (error) {
        throw new TypeError(`${label} is not cloneable; provide a snapshot adapter`, { cause: error });
    }
}
function validateSeats(seats) {
    if (!Array.isArray(seats) || seats.length === 0
        || seats.some((seat) => typeof seat !== 'string' || seat.length === 0)
        || new Set(seats).size !== seats.length) {
        throw new TypeError('multi-agent seats must be unique non-empty strings');
    }
    return [...seats].sort(compareText);
}
/**
 * Deterministic shared-state environment for multiple seat-scoped policies.
 * Simultaneous participation resolves one canonical input batch per tick.
 */
export class MultiAgentEnvironment {
    options;
    seats;
    seed;
    maxTicks;
    actionsFor;
    snapshotLevel;
    snapshotObservation;
    state;
    ticks = 0;
    ended = false;
    truncated = false;
    totalRewards;
    lastRewards;
    initialObservations;
    records = [];
    transcriptLevel;
    constructor(options) {
        this.options = options;
        this.seats = validateSeats(options.seats);
        this.seed = options.seed ?? 1;
        if (!Number.isSafeInteger(this.seed) || this.seed < 0 || this.seed > 0xffff_ffff) {
            throw new RangeError('multi-agent seed must be an unsigned 32-bit integer');
        }
        this.maxTicks = options.maxTicks ?? 10_000;
        if (!Number.isSafeInteger(this.maxTicks) || this.maxTicks < 1) {
            throw new RangeError('multi-agent maxTicks must be a positive safe integer');
        }
        this.actionsFor = options.enumerateActions ?? ((view) => enumerateActions(view));
        this.snapshotLevel = options.snapshotLevel
            ?? ((level) => defaultSnapshot(level, 'multi-agent level'));
        this.snapshotObservation = options.snapshotObservation
            ?? ((view) => defaultSnapshot(view, 'multi-agent observation'));
        this.totalRewards = Object.fromEntries(this.seats.map((seat) => [seat, 0]));
        this.lastRewards = Object.fromEntries(this.seats.map((seat) => [seat, 0]));
    }
    reset() {
        this.transcriptLevel = this.snapshotLevel(this.options.level);
        this.state = this.options.reducer.init(this.options.level, this.seed);
        this.ticks = 0;
        this.ended = false;
        this.truncated = false;
        this.records = [];
        this.totalRewards = Object.fromEntries(this.seats.map((seat) => [seat, 0]));
        this.lastRewards = Object.fromEntries(this.seats.map((seat) => [seat, 0]));
        const views = this.views();
        this.initialObservations = Object.fromEntries(this.seats.map((seat) => [
            seat,
            this.snapshotObservation(views[seat]),
        ]));
        const full = this.options.reducer.view(this.state);
        if (full.status !== 'playing' || full.outcome?.kind === 'decided')
            this.ended = true;
        return this.tick(views, full);
    }
    observe() {
        if (this.state === undefined) {
            throw new MultiAgentEnvironmentError('not_started', 'call reset() before observe()');
        }
        return this.tick(this.views(), this.options.reducer.view(this.state));
    }
    step(intents) {
        if (this.state === undefined) {
            throw new MultiAgentEnvironmentError('not_started', 'call reset() before step()');
        }
        if (this.ended) {
            throw new MultiAgentEnvironmentError('episode_done', 'reset before another multi-agent step');
        }
        if (!intents || typeof intents !== 'object' || Array.isArray(intents)) {
            throw new TypeError('multi-agent intents must be a seat record');
        }
        const previousViews = this.views();
        const full = this.options.reducer.view(this.state);
        const participating = this.participatingSeats(full);
        for (const seat of Object.keys(intents)) {
            if (!participating.includes(seat)) {
                throw new MultiAgentEnvironmentError('invalid_participation', `seat ${seat} is not participating in this collection tick`);
            }
        }
        const actions = [];
        for (const seat of participating) {
            const view = previousViews[seat];
            const gameplay = this.actionsFor(view);
            const systems = view.systemActions
                ? enumerateActions({ ...view, actions: view.systemActions })
                : [];
            const supplied = intents[seat]
                ?? this.options.waitAction?.(seat, view)
                ?? { id: 'wait' };
            if (supplied.seat !== undefined && supplied.seat !== seat) {
                throw new MultiAgentEnvironmentError('illegal_action', `action seat ${supplied.seat} does not match policy seat ${seat}`);
            }
            const concrete = [...gameplay, ...systems];
            const legal = this.options.isActionLegal
                ? this.options.isActionLegal(supplied, seat, view, concrete)
                : concrete.some((candidate) => (actionKey(candidate, seat) === actionKey(supplied, seat)));
            if (!legal) {
                throw new MultiAgentEnvironmentError('illegal_action', `action is not legal for seat ${seat}: ${actionKey(supplied)}`);
            }
            actions.push(copyAction(supplied.seat === undefined ? { ...supplied, seat } : supplied));
        }
        if (full.participation?.mode === 'simultaneous') {
            if (!('advance' in this.options.reducer) && !this.options.reducer.applyIntents) {
                throw new MultiAgentEnvironmentError('invalid_participation', 'simultaneous participation requires TickReducer.advance or reducer.applyIntents');
            }
            this.state = advanceTick(this.options.reducer, this.state, actions);
        }
        else {
            if (actions.length !== 1) {
                throw new MultiAgentEnvironmentError('invalid_participation', 'sequential or implicit participation must resolve exactly one action');
            }
            this.state = advanceTick(this.options.reducer, this.state, actions);
        }
        this.ticks++;
        const nextViews = this.views();
        const nextFull = this.options.reducer.view(this.state);
        const rewards = {};
        for (const seat of this.seats) {
            const reward = this.options.reward
                ? this.options.reward(previousViews[seat], nextViews[seat], actions, this.ticks, seat)
                : this.defaultReward(nextViews[seat], seat);
            if (!Number.isFinite(reward))
                throw new TypeError(`reward for seat ${seat} must be finite`);
            rewards[seat] = reward;
            this.lastRewards[seat] = reward;
            this.totalRewards[seat] = this.totalRewards[seat] + reward;
        }
        if (nextFull.status !== 'playing' || nextFull.outcome?.kind === 'decided') {
            this.ended = true;
        }
        else if (this.ticks >= this.maxTicks) {
            this.ended = true;
            this.truncated = true;
        }
        this.records.push({
            n: this.ticks,
            actions: actions.map(copyAction),
            rewards: { ...rewards },
            observations: Object.fromEntries(this.seats.map((seat) => [
                seat,
                this.snapshotObservation(nextViews[seat]),
            ])),
        });
        return this.tick(nextViews, nextFull);
    }
    /** Reset and replay canonical per-tick action batches from a transcript. */
    replay(ticks) {
        let step = this.reset();
        for (const actions of ticks) {
            const intents = {};
            for (const action of actions) {
                if (typeof action.seat !== 'string' || action.seat.length === 0) {
                    throw new TypeError('multi-agent replay actions require seat ids');
                }
                if (intents[action.seat]) {
                    throw new TypeError(`multi-agent replay has duplicate seat action: ${action.seat}`);
                }
                intents[action.seat] = copyAction(action);
            }
            step = this.step(intents);
        }
        return step;
    }
    transcript() {
        const step = this.observe();
        if (this.transcriptLevel === undefined || this.initialObservations === undefined) {
            throw new MultiAgentEnvironmentError('not_started', 'call reset() before transcript()');
        }
        return {
            version: MULTI_AGENT_TRANSCRIPT_VERSION,
            level: this.snapshotLevel(this.transcriptLevel),
            seed: this.seed,
            seats: [...this.seats],
            initialObservations: Object.fromEntries(this.seats.map((seat) => [
                seat,
                this.snapshotObservation(this.initialObservations[seat]),
            ])),
            ticks: this.records.map((tick) => ({
                n: tick.n,
                actions: tick.actions.map(copyAction),
                rewards: { ...tick.rewards },
                observations: Object.fromEntries(this.seats.map((seat) => [
                    seat,
                    this.snapshotObservation(tick.observations[seat]),
                ])),
            })),
            result: {
                ticks: this.ticks,
                status: step.status,
                ...(step.outcome ? { outcome: copyOutcome(step.outcome) } : {}),
                totalRewards: { ...this.totalRewards },
                terminated: step.terminated,
                truncated: step.truncated,
            },
        };
    }
    views() {
        if (this.state === undefined) {
            throw new MultiAgentEnvironmentError('not_started', 'call reset() before observing seats');
        }
        return Object.fromEntries(this.seats.map((seat) => [
            seat,
            this.options.reducer.viewFor
                ? this.options.reducer.viewFor(this.state, seat)
                : this.options.reducer.view(this.state),
        ]));
    }
    participatingSeats(view) {
        let seats;
        if (view.participation?.mode === 'sequential') {
            seats = [view.participation.activeSeat];
        }
        else if (view.participation?.mode === 'simultaneous') {
            seats = view.participation.seats;
        }
        else if (view.activeSeat) {
            seats = [view.activeSeat];
        }
        else if (this.seats.length === 1) {
            seats = this.seats;
        }
        else {
            throw new MultiAgentEnvironmentError('invalid_participation', 'multi-seat views must declare participation');
        }
        if (new Set(seats).size !== seats.length
            || seats.some((seat) => !this.seats.includes(seat))) {
            throw new MultiAgentEnvironmentError('invalid_participation', 'view participation must contain unique configured seats');
        }
        return [...seats].sort(compareText);
    }
    defaultReward(view, seat) {
        if (view.outcome?.kind === 'decided') {
            const result = view.outcome.ranking.find((entry) => entry.seat === seat);
            return result?.score ?? (result?.rank === 1 ? 1 : 0);
        }
        return view.status === 'won' ? (view.stars ?? 1) : 0;
    }
    tick(views, full) {
        const participating = this.ended ? [] : this.participatingSeats(full);
        return {
            seats: Object.fromEntries(this.seats.map((seat) => {
                const view = views[seat];
                const isParticipating = participating.includes(seat);
                return [seat, {
                        seat,
                        observation: view,
                        legalActions: isParticipating ? this.actionsFor(view) : [],
                        systemActions: isParticipating && view.systemActions
                            ? enumerateActions({ ...view, actions: view.systemActions })
                            : [],
                        participating: isParticipating,
                        reward: this.lastRewards[seat],
                        totalReward: this.totalRewards[seat],
                    }];
            })),
            participatingSeats: participating,
            tick: this.ticks,
            status: full.status,
            ...(full.outcome ? { outcome: copyOutcome(full.outcome) } : {}),
            terminated: this.ended && !this.truncated,
            truncated: this.truncated,
            done: this.ended,
        };
    }
}
/** Run seat policies concurrently while committing their inputs canonically. */
export async function runMultiAgentEpisode(environment, policies) {
    let step = environment.reset();
    while (!step.done) {
        const decisions = await Promise.all(step.participatingSeats.map(async (seat) => {
            const policy = policies[seat];
            if (!policy)
                return [seat, undefined];
            return [seat, await policy(step.seats[seat], step)];
        }));
        step = environment.step(Object.fromEntries(decisions));
    }
    return { finalStep: step, transcript: environment.transcript() };
}
