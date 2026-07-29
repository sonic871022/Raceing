function bounds(count) {
    const min = typeof count === 'number' ? count : count.min;
    const max = typeof count === 'number' ? count : count.max;
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)
        || min < 0 || max < min) {
        throw new RangeError('target count must use non-negative safe integer bounds');
    }
    return { min, max };
}
/**
 * Enumerate target choices in deterministic candidate order with an explicit
 * truncation result. The first choice beyond `maxChoices` sets `truncated`.
 */
export function enumerateTargetChoices(spec, view, options = {}) {
    if (!spec || typeof spec.candidates !== 'function') {
        throw new TypeError('target spec requires a candidates function');
    }
    const { min, max } = bounds(spec.count);
    const maxChoices = options.maxChoices ?? 10_000;
    if (!Number.isSafeInteger(maxChoices) || maxChoices < 1) {
        throw new RangeError('maxChoices must be a positive safe integer');
    }
    const candidates = spec.candidates(view);
    if (!Array.isArray(candidates))
        throw new TypeError('target candidates must be an array');
    const choices = [];
    let truncated = false;
    const admit = (choice) => {
        if (choices.length >= maxChoices) {
            truncated = true;
            return false;
        }
        choices.push([...choice]);
        return true;
    };
    const generateDistinct = (size, start, selected) => {
        if (selected.length === size)
            return admit(selected);
        const remaining = size - selected.length;
        for (let index = start; index <= candidates.length - remaining; index++) {
            selected.push(candidates[index]);
            if (!generateDistinct(size, index + 1, selected) && truncated)
                return false;
            selected.pop();
        }
        return true;
    };
    const generateOrdered = (size, selected) => {
        if (selected.length === size)
            return admit(selected);
        for (const candidate of candidates) {
            selected.push(candidate);
            if (!generateOrdered(size, selected) && truncated)
                return false;
            selected.pop();
        }
        return true;
    };
    for (let size = min; size <= max; size++) {
        if (spec.distinct && size > candidates.length)
            continue;
        const completed = spec.distinct
            ? generateDistinct(size, 0, [])
            : generateOrdered(size, []);
        if (!completed && truncated)
            break;
    }
    return { choices, truncated };
}
