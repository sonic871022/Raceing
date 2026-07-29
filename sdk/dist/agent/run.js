/** Run one complete deterministic environment episode through an AgentDriver. */
export async function runAgentDriverEpisode(environment, driver, options = {}) {
    await driver.reset?.();
    let step = environment.reset();
    const decisions = [];
    while (!step.done) {
        if (options.signal?.aborted)
            throw options.signal.reason;
        const decision = await driver.act({
            observation: step.observation,
            legalActions: step.legalActions,
            systemActions: step.systemActions,
            actionDefinitions: step.actionDefinitions,
            step: step.info.ticks,
            systemPrompt: options.systemPrompt,
            guidance: options.guidance,
            signal: options.signal,
        });
        decisions.push(decision);
        await options.onDecision?.(decision, step);
        step = environment.step(decision.action);
    }
    return {
        finalStep: step,
        transcript: environment.transcript(),
        decisions,
    };
}
