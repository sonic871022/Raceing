import { canonicalJson } from '../protocol.js';
function assertNonEmpty(value, name) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`${name} must be a non-empty string`);
    }
}
/** Validate the portable discovery contract before scheduling a run. */
export function assertGameDescriptor(descriptor) {
    assertNonEmpty(descriptor.id, 'descriptor.id');
    assertNonEmpty(descriptor.version, 'descriptor.version');
    if (!['sequential', 'simultaneous', 'mixed'].includes(descriptor.dynamics)) {
        throw new TypeError('descriptor.dynamics must be sequential, simultaneous, or mixed');
    }
    if (!['none', 'explicit', 'sampled'].includes(descriptor.chance)) {
        throw new TypeError('descriptor.chance must be none, explicit, or sampled');
    }
    if (!['perfect', 'imperfect'].includes(descriptor.information)) {
        throw new TypeError('descriptor.information must be perfect or imperfect');
    }
    if (!['zero-sum', 'constant-sum', 'general-sum', 'identical'].includes(descriptor.utility)) {
        throw new TypeError('descriptor.utility must be zero-sum, constant-sum, general-sum, or identical');
    }
    if (!['terminal', 'incremental'].includes(descriptor.rewards)) {
        throw new TypeError('descriptor.rewards must be terminal or incremental');
    }
    if (!Number.isSafeInteger(descriptor.minPlayers) || descriptor.minPlayers <= 0) {
        throw new RangeError('descriptor.minPlayers must be a positive safe integer');
    }
    if (!Number.isSafeInteger(descriptor.maxPlayers)
        || descriptor.maxPlayers < descriptor.minPlayers) {
        throw new RangeError('descriptor.maxPlayers must be a safe integer no smaller than minPlayers');
    }
    if (descriptor.maxEpisodeLength !== undefined
        && (!Number.isSafeInteger(descriptor.maxEpisodeLength)
            || descriptor.maxEpisodeLength <= 0)) {
        throw new RangeError('descriptor.maxEpisodeLength must be a positive safe integer');
    }
    if (descriptor.minUtility !== undefined && !Number.isFinite(descriptor.minUtility)) {
        throw new RangeError('descriptor.minUtility must be finite');
    }
    if (descriptor.maxUtility !== undefined && !Number.isFinite(descriptor.maxUtility)) {
        throw new RangeError('descriptor.maxUtility must be finite');
    }
    if (descriptor.minUtility !== undefined && descriptor.maxUtility !== undefined
        && descriptor.maxUtility < descriptor.minUtility) {
        throw new RangeError('descriptor.maxUtility must not be smaller than minUtility');
    }
}
function actionKey(action) {
    return canonicalJson(action);
}
/**
 * Validate a finite canonical distribution. Callers retain the returned array
 * as the canonical chance/policy order.
 */
export function validateActionDistribution(distribution, options = {}) {
    if (distribution.length === 0) {
        throw new RangeError('distribution must contain at least one outcome');
    }
    const tolerance = options.tolerance ?? 1e-9;
    if (!Number.isFinite(tolerance) || tolerance < 0) {
        throw new RangeError('tolerance must be a non-negative finite number');
    }
    const legal = options.legalActions === undefined
        ? undefined
        : new Set(options.legalActions.map(actionKey));
    const seen = new Set();
    let total = 0;
    let previous;
    for (const [index, choice] of distribution.entries()) {
        const key = actionKey(choice.action);
        if (seen.has(key)) {
            throw new TypeError(`distribution contains duplicate action at index ${index}`);
        }
        seen.add(key);
        if (legal !== undefined && !legal.has(key)) {
            throw new TypeError(`distribution contains illegal action at index ${index}`);
        }
        if (!Number.isFinite(choice.probability) || choice.probability < 0) {
            throw new RangeError(`distribution probability at index ${index} must be non-negative and finite`);
        }
        if (options.requireCanonicalOrder === true && previous !== undefined && key < previous) {
            throw new TypeError('distribution actions are not in canonical order');
        }
        previous = key;
        total += choice.probability;
    }
    if (Math.abs(total - 1) > tolerance) {
        throw new RangeError(`distribution probabilities sum to ${total}, expected 1 ± ${tolerance}`);
    }
    return distribution;
}
export function validateChanceOutcomes(outcomes, tolerance = 1e-9) {
    return validateActionDistribution(outcomes, {
        tolerance,
        requireCanonicalOrder: true,
    });
}
/** Deterministically select from a validated distribution using a [0, 1) draw. */
export function sampleActionDistribution(distribution, draw) {
    validateActionDistribution(distribution);
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) {
        throw new RangeError('draw must be a finite number in [0, 1)');
    }
    let cumulative = 0;
    for (const choice of distribution) {
        cumulative += choice.probability;
        if (draw < cumulative)
            return structuredClone(choice.action);
    }
    return structuredClone(distribution[distribution.length - 1].action);
}
/** Wilson 95% interval; defined for an empty sample as [0, 1]. */
export function winRate(wins, episodes) {
    if (!Number.isSafeInteger(episodes) || episodes < 0
        || !Number.isSafeInteger(wins) || wins < 0 || wins > episodes) {
        throw new RangeError('wins and episodes must be safe integers with 0 <= wins <= episodes');
    }
    if (episodes === 0) {
        return { wins, episodes, rate: 0, confidence95: [0, 1] };
    }
    const z = 1.959963984540054;
    const rate = wins / episodes;
    const denominator = 1 + (z * z) / episodes;
    const center = (rate + (z * z) / (2 * episodes)) / denominator;
    const margin = z * Math.sqrt((rate * (1 - rate) + (z * z) / (4 * episodes)) / episodes) / denominator;
    return {
        wins,
        episodes,
        rate,
        confidence95: [Math.max(0, center - margin), Math.min(1, center + margin)],
    };
}
export function policyEntropy(distribution) {
    validateActionDistribution(distribution);
    return distribution.reduce((entropy, { probability }) => (probability === 0 ? entropy : entropy - probability * Math.log2(probability)), 0);
}
/** Aggregate ordered policy matchups without assuming zero-sum utilities. */
export function headToHeadPayoffMatrix(results) {
    if (results.length === 0)
        throw new TypeError('head-to-head results must not be empty');
    const policies = [...new Set(results.flatMap(({ rowPolicy, columnPolicy }) => [rowPolicy, columnPolicy]))].sort();
    const totals = new Map();
    for (const result of results) {
        assertNonEmpty(result.rowPolicy, 'rowPolicy');
        assertNonEmpty(result.columnPolicy, 'columnPolicy');
        if (!Number.isFinite(result.rowUtility)) {
            throw new RangeError('rowUtility must be finite');
        }
        if (!Number.isSafeInteger(result.episodes) || result.episodes <= 0) {
            throw new RangeError('head-to-head episodes must be a positive safe integer');
        }
        const key = `${result.rowPolicy}\0${result.columnPolicy}`;
        const current = totals.get(key) ?? { weighted: 0, episodes: 0 };
        current.weighted += result.rowUtility * result.episodes;
        current.episodes += result.episodes;
        totals.set(key, current);
    }
    const utilities = {};
    const episodes = {};
    for (const row of policies) {
        utilities[row] = {};
        episodes[row] = {};
        for (const column of policies) {
            const aggregate = totals.get(`${row}\0${column}`);
            if (aggregate !== undefined) {
                utilities[row][column] = aggregate.weighted / aggregate.episodes;
                episodes[row][column] = aggregate.episodes;
            }
        }
    }
    return { policies, utilities, episodes };
}
export function actionEfficiency(counts) {
    for (const [name, value] of Object.entries(counts)) {
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new RangeError(`${name} must be a non-negative safe integer`);
        }
    }
    if (counts.accepted + counts.invalid !== counts.attempted) {
        throw new TypeError('accepted plus invalid actions must equal attempted actions');
    }
    if (counts.productive > counts.accepted) {
        throw new TypeError('productive actions cannot exceed accepted actions');
    }
    const denominator = counts.attempted || 1;
    return {
        ...counts,
        acceptanceRate: counts.accepted / denominator,
        invalidActionRate: counts.invalid / denominator,
        productiveActionRate: counts.productive / denominator,
    };
}
/** Deterministic two-player Elo adapter; benchmark products choose K and meaning. */
export function updateEloRatings(ratings, matches, k = 32) {
    if (!Number.isFinite(k) || k <= 0)
        throw new RangeError('rating K must be positive and finite');
    const values = new Map(ratings.map(({ id, value }) => {
        assertNonEmpty(id, 'rating.id');
        if (!Number.isFinite(value))
            throw new RangeError('rating value must be finite');
        return [id, value];
    }));
    if (values.size !== ratings.length)
        throw new TypeError('rating ids must be unique');
    for (const match of matches) {
        const left = values.get(match.left);
        const right = values.get(match.right);
        if (left === undefined || right === undefined)
            throw new TypeError('rating match names an unknown policy');
        if (![0, 0.5, 1].includes(match.leftScore)) {
            throw new RangeError('rating match score must be 0, 0.5, or 1');
        }
        const expected = 1 / (1 + 10 ** ((right - left) / 400));
        values.set(match.left, left + k * (match.leftScore - expected));
        values.set(match.right, right + k * ((1 - match.leftScore) - (1 - expected)));
    }
    return ratings.map(({ id }) => ({ id, value: values.get(id) }));
}
/**
 * Reject formal metrics unless their required game preconditions are explicit.
 * GAOS does not infer a game-theoretic meaning from incomplete descriptors.
 */
export function assertFormalMetricPreconditions(metric, descriptor) {
    assertGameDescriptor(descriptor);
    if (descriptor.chance === 'sampled') {
        throw new TypeError(`${metric} requires enumerated or absent chance outcomes`);
    }
    if (descriptor.minPlayers !== 2 || descriptor.maxPlayers !== 2) {
        throw new TypeError(`${metric} currently requires exactly two players`);
    }
    if (metric !== 'best-response' && descriptor.utility !== 'zero-sum') {
        throw new TypeError(`${metric} currently requires zero-sum utility`);
    }
    if (descriptor.minUtility === undefined || descriptor.maxUtility === undefined) {
        throw new TypeError(`${metric} requires declared utility bounds`);
    }
}
export function assertTransformDescriptor(descriptor) {
    if (descriptor.schema !== 'gaos.game-transform.v1' || descriptor.deterministic !== true) {
        throw new TypeError('unsupported or nondeterministic transform descriptor');
    }
    assertGameDescriptor(descriptor.input);
    assertGameDescriptor(descriptor.output);
    assertNonEmpty(descriptor.evidenceIdentity, 'evidenceIdentity');
    if (descriptor.transform === 'simultaneous-to-sequential'
        && descriptor.input.dynamics === 'sequential') {
        throw new TypeError('commitment-form transform requires simultaneous input dynamics');
    }
    if (descriptor.transform === 'cooperative-centralized-view'
        && descriptor.input.utility !== 'identical') {
        throw new TypeError('centralized cooperative view requires identical utility');
    }
    if (descriptor.transform === 'utility-normalization'
        && (descriptor.input.minUtility === undefined
            || descriptor.input.maxUtility === undefined
            || descriptor.input.minUtility === descriptor.input.maxUtility)) {
        throw new TypeError('utility normalization requires distinct utility bounds');
    }
}
