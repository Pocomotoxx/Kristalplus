#!/usr/bin/env node
import { runCommand } from './cli/commands.js';

const { code, output } = await runCommand(process.argv.slice(2), process.cwd());
const text = JSON.stringify(output, null, 2);
(code === 0 ? process.stdout : process.stderr).write(`${text}\n`);
process.exitCode = code;
