import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-opus-5-5';

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 0);
}

export function modelId(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

let client: Anthropic | null = null;

/** Lazily constructed client. The SDK retries 429/5xx/connection errors with exponential backoff. */
export function getClient(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 4, timeout: 120_000 });
  return client;
}
