#!/usr/bin/env node
import { runAgentCli } from './agent-cli/command.js';

try {
  process.exitCode = await runAgentCli(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`gaos-agent: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}

