import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { AgentInterruptionResult } from '../agent/driver.js';
import type { CliAgentLaunchContext, CliAgentSpec } from './specs.js';

export interface CliAgentExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderrTail: string;
}

export interface CliAgentProcess {
  child: ChildProcess;
  workdir: string;
  completion: Promise<CliAgentExit>;
  interruptionMode: 'resume' | 'unsupported';
  interrupt(options: CliAgentInterruptOptions): Promise<CliAgentInterruptionResult>;
  stop(signal?: NodeJS.Signals): boolean;
}

export interface CliAgentInterruptOptions {
  prompt: string;
  /** Product-owned transport reset performed after exit and before resume. */
  beforeResume?(): void | Promise<void>;
}

export interface CliAgentInterruptionResult extends AgentInterruptionResult {
  process?: CliAgentProcess;
}

export interface SpawnCliAgentOptions {
  env?: NodeJS.ProcessEnv;
  onStdout?(text: string): void;
  onStderr?(text: string): void;
  onTranscript?(text: string): void;
  /** Retain the scratch directory after exit for debugging. */
  keepWorkdir?: boolean;
}

function safeConfigPath(workdir: string, path: string): string {
  if (!path || isAbsolute(path)) throw new TypeError(`CLI config path must be relative: ${path}`);
  const target = resolve(workdir, path);
  const back = relative(workdir, target);
  if (back.startsWith('..') || isAbsolute(back)) throw new TypeError(`CLI config escapes scratch directory: ${path}`);
  return target;
}

/** Launch an MCP-capable agent in an isolated scratch directory. */
export function spawnCliAgent(
  spec: CliAgentSpec,
  context: CliAgentLaunchContext,
  options: SpawnCliAgentOptions = {},
): CliAgentProcess {
  const launch = spec.launch(context);
  const workdir = mkdtempSync(join(tmpdir(), 'gaos-agent-'));
  try {
    for (const [path, content] of Object.entries(launch.files)) {
      const target = safeConfigPath(workdir, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, 'utf8');
    }
  } catch (error) {
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
  child.stdout?.on('data', (data: Buffer) => {
    const text = data.toString();
    options.onStdout?.(text);
    stdoutBuffer += text;
    let newline: number;
    while ((newline = stdoutBuffer.indexOf('\n')) >= 0) {
      const line = stdoutBuffer.slice(0, newline);
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      for (const transcript of spec.parseLine?.(line) ?? []) options.onTranscript?.(transcript);
    }
  });
  child.stderr?.on('data', (data: Buffer) => {
    const text = data.toString();
    stderrTail = (stderrTail + text).slice(-2_000);
    options.onStderr?.(text);
  });

  const completion = new Promise<CliAgentExit>((resolveCompletion, reject) => {
    child.once('error', (error) => {
      if (!options.keepWorkdir) rmSync(workdir, { recursive: true, force: true });
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (stdoutBuffer) {
        for (const transcript of spec.parseLine?.(stdoutBuffer) ?? []) options.onTranscript?.(transcript);
      }
      if (!options.keepWorkdir) rmSync(workdir, { recursive: true, force: true });
      resolveCompletion({ code, signal, stderrTail: stderrTail.trim() });
    });
  });
  const agentProcess: CliAgentProcess = {
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
