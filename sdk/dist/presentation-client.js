/** Portable snapshot/patch/receipt state machine shared by engine clients. */
export class PresentationClient {
    reducer;
    value = {
        status: 'empty',
        acknowledged: [],
        rejected: {},
    };
    constructor(reducer) {
        this.reducer = reducer;
    }
    state() {
        return structuredClone(this.value);
    }
    receive(message) {
        if (message.type === 'acknowledgement') {
            if (!this.value.acknowledged.includes(message.submissionId)) {
                this.value = {
                    ...this.value,
                    acknowledged: [...this.value.acknowledged, message.submissionId],
                };
            }
            return this.state();
        }
        if (message.type === 'rejection') {
            this.value = {
                ...this.value,
                rejected: { ...this.value.rejected, [message.submissionId]: message.reason },
            };
            return this.state();
        }
        if (message.type === 'digest-mismatch') {
            this.value = { ...this.value, status: 'repair-required' };
            return this.state();
        }
        if (message.type === 'snapshot') {
            this.value = {
                ...this.value,
                status: 'ready',
                transitionRevision: message.transitionRevision,
                tick: message.tick,
                view: structuredClone(message.view),
                ...(message.digest === undefined ? {} : { digest: message.digest }),
            };
            return this.state();
        }
        if (this.value.status !== 'ready'
            || this.value.view === undefined
            || this.value.transitionRevision !== message.baseTransitionRevision) {
            this.value = { ...this.value, status: 'repair-required' };
            return this.state();
        }
        const view = this.reducer.applyPatch(structuredClone(this.value.view), message.patch);
        const actual = this.reducer.digest?.(view);
        if (message.digest !== undefined && actual !== undefined && actual !== message.digest) {
            this.value = { ...this.value, status: 'repair-required' };
            return this.state();
        }
        this.value = {
            ...this.value,
            status: 'ready',
            transitionRevision: message.transitionRevision,
            tick: message.tick,
            view: structuredClone(view),
            ...(message.digest === undefined ? {} : { digest: message.digest }),
        };
        return this.state();
    }
}
