import { MARK_KINDS } from '../schema/storyboard';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { getClient, hasApiKey, modelId } from '../generator/client';
import type { Codified } from './songboard';

const PROPS = ['rain', 'sun', 'moon', 'stars', 'heart', 'fire', 'photo', 'clock', 'smile', 'wave', 'smoke', 'loop', 'glass'] as const;

const Schema = z.object({
  lines: z.array(
    z.object({
      lyric: z.string().describe('The original lyric line, copied exactly'),
      code: z.array(z.string()).describe('1 to 3 code fragments, each at most 22 characters, typed in order'),
      cues: z
        .array(
          z.object({
            word: z.string().describe('A word that appears verbatim in one of the code fragments'),
            prop: z.enum(PROPS).nullable().describe('Visual that appears when the word is typed, or null'),
            mark: z.enum(MARK_KINDS).nullable().describe('Letters act out the word: strike lies, underline promises, shatter breaking, burn fire, frost cold, fall falling, float flying, dissolve forgetting/leaving, shout screaming, whisper quiet, pulse heartbeat, bounce laughing, shine beauty; or null'),
          }),
        )
        .describe('0 to 2 cues per line; only for words that carry the image'),
    }),
  ),
});

const SYSTEM = `You turn song lyrics into short lines of code for a motion-design studio whose videos show lyrics being typed in a dark code editor in sync with the music.
Rules:
- Keep the original language and its exact words (Turkish stays Turkish, with its letters). Do not translate. Rearrange words into code syntax; you may drop filler words but never invent new ones, except the code keywords if, while, return, const, let, true, false, null, and operators.
- Each fragment is at most 22 characters, reads naturally as code (calls, properties, conditions, loops) and as the lyric at the same time. Questions become if (...). Repetition becomes loops or repeated calls. Negation can become !, ==, or null.
- Split a long lyric into 2 or 3 fragments in sung order.
- Cues: pick at most 2 words per line whose meaning is visual: crying or rain -> rain; morning or light -> sun; night -> moon; dreams or sky -> stars; love or kissing -> heart; fighting or burning -> fire; memories or photos -> photo; time or waiting -> clock; smiling or laughing -> smile; songs or voices -> wave; smoking or drinking -> smoke; forever or again -> loop; lies -> mark strike; promises or belief -> mark underline. The cue word must appear exactly in a fragment.`;

/** Returns Claude-written code per lyric line, or null when no key, refusal, or failure (caller falls back). */
export async function codifyWithClaude(lyrics: string[], context: { title: string; artist: string }, log: (m: string) => void): Promise<Codified | null> {
  if (!hasApiKey() || lyrics.length === 0) return null;
  try {
    log(`Asking ${modelId()} to write the code lines...`);
    const res = await getClient().messages.parse({
      model: modelId(),
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Song: "${context.title}" by ${context.artist}.\nLyric lines, one per line:\n${lyrics.join('\n')}` }],
      output_config: { format: zodOutputFormat(Schema), effort: 'medium' },
    });
    if (res.stop_reason === 'refusal' || !res.parsed_output) {
      log('Claude did not return code lines; using the built-in converter.');
      return null;
    }
    const out: Codified = {};
    for (const l of res.parsed_output.lines) {
      const code = l.code.map((c) => c.trim()).filter((c) => c.length > 0 && c.length <= 34).slice(0, 3);
      if (code.length === 0) continue;
      const cues = l.cues
        .filter((c) => code.some((f) => f.includes(c.word)))
        .slice(0, 2)
        .map((c) => ({ char: 0, word: c.word, prop: c.prop, mark: c.mark }));
      out[l.lyric] = { code, cues };
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch (err) {
    const msg = err instanceof Anthropic.APIError ? `${err.status ?? ''} ${err.message}` : err instanceof Error ? err.message : String(err);
    log(`Claude code-line request failed (${msg}); using the built-in converter.`);
    return null;
  }
}
