import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { CliAgentSpec } from './specs.js';

export interface CliAgentStatus {
  id: string;
  label: string;
  bin: string;
  installed: boolean;
  auth: 'ok' | 'none' | 'unknown';
  detail: string;
  login: string;
}

export function resolveCliExecutable(bin: string, path = process.env.PATH ?? ''): string | undefined {
  const candidates = bin.includes('/') ? [bin] : path.split(delimiter).filter(Boolean).map((dir) => join(dir, bin));
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep looking on PATH.
    }
  }
  return undefined;
}

function cleanStatusOutput(output: string): string[] {
  return output
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function inspectCliAgent(
  spec: CliAgentSpec,
  options: { path?: string; timeoutMs?: number } = {},
): Promise<CliAgentStatus> {
  const executable = resolveCliExecutable(spec.bin, options.path);
  if (!executable) {
    return {
      id: spec.id,
      label: spec.label,
      bin: spec.bin,
      installed: false,
      auth: 'none',
      detail: `${spec.bin} not found on PATH`,
      login: spec.login,
    };
  }
  if (!spec.status) {
    return {
      id: spec.id,
      label: spec.label,
      bin: spec.bin,
      installed: true,
      auth: 'unknown',
      detail: 'no status probe for this CLI',
      login: spec.login,
    };
  }

  const probe = spec.status;
  const checked = await new Promise<Pick<CliAgentStatus, 'auth' | 'detail'>>((resolve) => {
    const child = spawn(executable, probe.argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let settled = false;
    const finish = (result: Pick<CliAgentStatus, 'auth' | 'detail'>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ auth: 'unknown', detail: 'status check timed out' });
    }, options.timeoutMs ?? 8_000);
    child.stdout?.on('data', (data: Buffer) => { output += data.toString(); });
    child.stderr?.on('data', (data: Buffer) => { output += data.toString(); });
    child.on('error', (error) => finish({ auth: 'unknown', detail: `status check failed: ${error.message}` }));
    child.on('exit', (code) => {
      const lines = cleanStatusOutput(output);
      finish({
        auth: probe.ok(code ?? 1, output) ? 'ok' : 'none',
        detail: (probe.summary?.(output) ?? lines.at(-1) ?? '').slice(0, 160),
      });
    });
  });
  return {
    id: spec.id,
    label: spec.label,
    bin: spec.bin,
    installed: true,
    ...checked,
    login: spec.login,
  };
}

