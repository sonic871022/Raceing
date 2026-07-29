/** Raised when same-tick resolution does not reach quiescence within its guard. */
export class SettlementLimitError extends Error {
    maxSteps;
    nextJob;
    constructor(maxSteps, nextJob) {
        super(`settlement exceeded its ${maxSteps}-step limit before ${nextJob.kind}:${nextJob.key}`);
        this.name = 'SettlementLimitError';
        this.maxSteps = maxSteps;
        this.nextJob = nextJob;
    }
}
const identityOf = (job) => `${job.kind}\u0000${job.key}`;
const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const compareQueued = (left, right) => ((left.job.priority ?? 0) - (right.job.priority ?? 0)
    || compareText(left.job.kind, right.job.kind)
    || compareText(left.job.key, right.job.key)
    || left.sequence - right.sequence);
/**
 * Resolve product-defined consequences in deterministic resolution waves.
 *
 * Every job enqueued by a resolver runs no earlier than the following wave.
 * The caller owns state mutation and rule semantics; this function owns work
 * ordering, duplicate policy, deferral, tracing, and convergence enforcement.
 */
export function runSettlementCascade(state, seeds, resolve, options) {
    if (!Number.isSafeInteger(options.maxSteps) || options.maxSteps < 1) {
        throw new RangeError('settlement maxSteps must be a positive safe integer');
    }
    let sequence = 0;
    let current = [];
    let next = [];
    const pendingCoalesced = new Set();
    const seenOnce = new Set();
    const trace = [];
    const deferred = [];
    const schedule = (job, wave, parentStep, target) => {
        const identity = identityOf(job);
        const policy = job.policy ?? 'repeat';
        if (policy === 'once') {
            if (seenOnce.has(identity))
                return false;
            seenOnce.add(identity);
        }
        else if (policy === 'coalesce') {
            if (pendingCoalesced.has(identity))
                return false;
            pendingCoalesced.add(identity);
        }
        target.push({
            job,
            sequence: sequence++,
            wave,
            ...(parentStep !== undefined ? { parentStep } : {}),
        });
        return true;
    };
    for (const seed of seeds)
        schedule(seed, 0, undefined, current);
    let steps = 0;
    let waves = 0;
    while (current.length > 0) {
        current.sort(compareQueued);
        const wave = current[0].wave;
        waves = Math.max(waves, wave + 1);
        for (const queued of current) {
            if (steps >= options.maxSteps)
                throw new SettlementLimitError(options.maxSteps, queued.job);
            if ((queued.job.policy ?? 'repeat') === 'coalesce') {
                pendingCoalesced.delete(identityOf(queued.job));
            }
            const step = steps++;
            trace.push({
                step,
                wave,
                job: queued.job,
                ...(queued.parentStep !== undefined ? { parentStep: queued.parentStep } : {}),
            });
            resolve(queued.job, {
                state,
                step,
                wave,
                enqueue: (job) => schedule(job, wave + 1, step, next),
                defer: (job) => deferred.push(job),
            });
        }
        current = next;
        next = [];
    }
    return { state, steps, waves, trace, deferred };
}
