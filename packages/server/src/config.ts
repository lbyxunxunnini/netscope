import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { CliConfig } from '@netscope/shared';

const DIR = join(homedir(), '.netscope');
const FILE = join(DIR, 'config.json');

const DEFAULTS: CliConfig = {
  maxMessages: 1000,
  bodyLimit: 64 * 1024,
};

export function loadConfig(): CliConfig {
  try {
    const raw = readFileSync(FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<CliConfig>;
    return {
      maxMessages: Number(parsed.maxMessages) || DEFAULTS.maxMessages,
      bodyLimit: Number(parsed.bodyLimit) || DEFAULTS.bodyLimit,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveConfig(config: CliConfig): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(config, null, 2));
}
