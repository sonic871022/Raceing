/** Run one complete episode using a synchronous or asynchronous agent policy. */
export async function runAgentEpisode(environment, policy) {
    let step = environment.reset();
    while (!step.done)
        step = environment.step(await policy(step));
    return { finalStep: step, transcript: environment.transcript() };
}
/** Sequential deterministic batch runner suitable for evaluation harnesses. */
export async function evaluateAgentEpisodes(cases, createEnvironment, policy) {
    const episodes = [];
    for (const episode of cases) {
        const result = await runAgentEpisode(createEnvironment(episode), (step) => policy(step, episode));
        episodes.push({ id: episode.id, ...result });
    }
    const count = episodes.length;
    return {
        episodes,
        summary: {
            episodes: count,
            won: episodes.filter(({ finalStep }) => finalStep.info.terminationReason === 'won').length,
            failed: episodes.filter(({ finalStep }) => finalStep.info.terminationReason === 'failed').length,
            truncated: episodes.filter(({ finalStep }) => finalStep.truncated).length,
            meanReward: count === 0
                ? 0
                : episodes.reduce((sum, episode) => sum + episode.finalStep.info.totalReward, 0) / count,
            meanTicks: count === 0
                ? 0
                : episodes.reduce((sum, episode) => sum + episode.finalStep.info.ticks, 0) / count,
        },
    };
}
