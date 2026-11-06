import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import Anthropic from '@anthropic-ai/sdk';
import { StrictSchema, WireSchema, type Storyboard, type WireStoryboard } from '../schema/storyboard';
import { fallbackStoryboard } from './fallback';
import { fingerprint, normalize, type NormalizeOptions } from './normalize';
import { hashString } from '../lib/seed';
import { getClient, hasApiKey, modelId } from './client';
import { SYSTEM_PROMPT, userPrompt } from './prompts';

export type GenerateOptions = {
  topic: string;
  seed?: number;
  targetDuration?: number;
  brand?: string | null;
  variant?: number;
  forceFallback?: boolean;
  avoidFingerprints?: string[];
  log?: (msg: string) => void;
};

export type GenerateResult = {
  storyboard: Storyboard;
  generator: 'claude' | 'fallback';
  model: string | null;
  notes: string[];
};

function useFallback(opts: GenerateOptions, notes: string[]): GenerateResult {
  let seed = opts.seed ?? hashString(opts.topic);
  let storyboard = normalize(fallbackStoryboard(opts.topic, seed), { targetDuration: opts.targetDuration, seed, brand: opts.brand });
  // Keep batch outputs distinct even offline: bump the seed until the fingerprint is new.
  const avoid = new Set(opts.avoidFingerprints ?? []);
  let guard = 0;
  while (avoid.has(fingerprint(storyboard)) && guard++ < 9) {
    seed = (seed + 7919) >>> 0;
    storyboard = normalize(fallbackStoryboard(opts.topic, seed), { targetDuration: opts.targetDuration, seed, brand: opts.brand });
  }
  return { storyboard, generator: 'fallback', model: null, notes };
}

async function askClaude(opts: GenerateOptions, feedback: string | null): Promise<WireStoryboard> {
  const client = getClient();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt(opts.topic, opts.targetDuration ?? 30, opts.variant ?? 0, opts.avoidFingerprints ?? []) }];
  if (feedback) messages.push({ role: 'user', content: `Your previous storyboard was rejected by validation:\n${feedback}\nProduce a corrected storyboard.` });
  const response = await client.messages.parse({
    model: modelId(),
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages,
    output_config: { format: zodOutputFormat(WireSchema), effort: 'medium' },
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude declined the request (refusal).');
  if (response.stop_reason === 'max_tokens') throw new Error('Claude hit max_tokens before finishing the storyboard.');
  if (!response.parsed_output) throw new Error('Claude returned no parseable storyboard.');
  return response.parsed_output;
}

export async function generateStoryboard(opts: GenerateOptions): Promise<GenerateResult> {
  const log = opts.log ?? (() => {});
  const notes: string[] = [];
  if (opts.forceFallback) {
    notes.push('Offline storyboard library used (forced).');
    return useFallback(opts, notes);
  }
  if (!hasApiKey()) {
    notes.push('ANTHROPIC_API_KEY not set; offline storyboard library used.');
    log('No ANTHROPIC_API_KEY found, using the offline storyboard library.');
    return useFallback(opts, notes);
  }

  const norm: NormalizeOptions = { targetDuration: opts.targetDuration, seed: opts.seed, brand: opts.brand };
  let feedback: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      log(`Asking ${modelId()} for a storyboard (attempt ${attempt})...`);
      const wire = await askClaude(opts, feedback);
      const storyboard = normalize(wire, norm);
      const check = StrictSchema.safeParse(storyboard);
      if (!check.success) {
        feedback = check.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
        notes.push(`Attempt ${attempt} failed strict validation.`);
        continue;
      }
      return { storyboard: check.data, generator: 'claude', model: modelId(), notes };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof Anthropic.AuthenticationError) {
        notes.push(`Authentication failed (${msg}); offline storyboard library used.`);
        log(`Authentication failed: ${msg}`);
        return useFallback(opts, notes);
      }
      notes.push(`Attempt ${attempt} error: ${msg}`);
      log(`Claude attempt ${attempt} failed: ${msg}`);
      feedback = msg;
    }
  }
  notes.push('Claude generation failed twice; offline storyboard library used.');
  log('Falling back to the offline storyboard library.');
  return useFallback(opts, notes);
}
