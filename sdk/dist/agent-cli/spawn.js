import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
function safeConfigPath(workdir, path) {
    if (!path || isAbsolute(path))
        throw new TypeError(`CLI config path must be relative: ${path}`);
    const target = resolve(workdir, path);
    const back = relative(workdir, target);
    if (back.startsWith('..') || isAbsolute(back))
        throw new TypeError(`CLI config escapes scratch directory: ${path}`);
    return target;
}
/** Launch an MCP-capable agent in an isolated scratch directory. */
export function spawnCliAgent(spec, context, options = {}) {
    const launch = spec.launch(context);
    const workdir = mkdtempSync(join(tmpdir(), 'gaos-agent-'));
    try {
        for (const [path, content] of Object.entries(launch.files)) {
            const target = safeConfigPath(workdir, path);
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, content, 'utf8');
        }
    }
    catch (error) {
        rmSync(workdir, { recursive: true, force: true });
        throw error;
    }
    const child = spawn(spec.bin, launch.argv, {
        cwd: workdir,
        env: options.env ?? process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdoutBuffer = '';
    let stderrTail = '';
    child.stdout?.on('data', (data) => {
        const text = data.toString();
        options.onStdout?.(text);
        stdoutBuffer += text;
        let newline;
        while ((newline = stdoutBuffer.indexOf('\n')) >= 0) {
            const line = stdoutBuffer.slice(0, newline);
            stdoutBuffer = stdoutBuffer.slice(newline + 1);
            for (const transcript of spec.parseLine?.(line) ?? [])
                options.onTranscript?.(transcript);
        }
    });
    child.stderr?.on('data', (data) => {
        const text = data.toString();
        stderrTail = (stderrTail + text).slice(-2_000);
        options.onStderr?.(text);
    });
    const completion = new Promise((resolveCompletion, reject) => {
        child.once('error', (error) => {
            if (!options.keepWorkdir)
                rmSync(workdir, { recursive: true, force: true });
            reject(error);
        });
        child.once('close', (code, signal) => {
            if (stdoutBuffer) {
                for (const transcript of spec.parseLine?.(stdoutBuffer) ?? [])
                    options.onTranscript?.(transcript);
            }
            if (!options.keepWorkdir)
                rmSync(workdir, { recursive: true, force: true });
            resolveCompletion({ code, signal, stderrTail: stderrTail.trim() });
        });
    });
    const agentProcess = {
        child,
        workdir,
        completion,
        interruptionMode: spec.supportsResume && context.sessionId ? 'resume' : 'unsupported',
        interrupt: async (interruptOptions) => {
            if (!spec.supportsResume || !context.sessionId) {
                return { mode: 'unsupported', interrupted: false, preservesContext: false };
            }
            child.kill('SIGTERM');
            await completion;
            await interruptOptions.beforeResume?.();
            const replacement = spawnCliAgent(spec, {
                ...context,
                prompt: interruptOptions.prompt,
                resume: true,
            }, options);
            return { mode: 'resume', interrupted: true, preservesContext: true, process: replacement };
        },
        stop: (signal = 'SIGTERM') => child.kill(signal),
    };
    return agentProcess;
}
