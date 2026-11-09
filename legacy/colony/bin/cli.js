#!/usr/bin/env node
/**
 * Colony CLI - Umbrella entry point
 * Proxies to @colony/cli bin for cross-platform compatibility.
 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', 'v3', '@colony', 'cli', 'bin', 'cli.js');
await import(pathToFileURL(cliPath).href);
