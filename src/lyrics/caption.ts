import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Storyboard } from '../schema/storyboard';
import { VIBES } from '../lib/vibes';
import { loadStudio } from '../lib/studio';

const tag = (s: string) =>
  '#' +
  s
    .toLocaleLowerCase('tr')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** Turkish caption + hashtags for Instagram / TikTok, written next to the video. */
export async function writeCaption(sb: Storyboard, outDir: string, log: (m: string) => void): Promise<void> {
  const studio = await loadStudio();
  const vibe = VIBES[sb.vibe ?? 'gece'];
  const artist = sb.song?.artist ?? '';
  const title = sb.song?.title ?? sb.title;
  const hook = sb.hook?.style === 'question' ? sb.hook.text : null;
  const ep = sb.episode ? `#${String(sb.episode).padStart(3, '0')} ` : '';
  const lines = [
    `${ep}${hook ?? `${title}, kod olarak.`}`,
    '',
    `🎧 ${artist} – ${title}`,
    studio.tagline ? `// ${studio.tagline}` : '',
    '',
    'Sonraki şarkıyı yorumlara yaz 👇',
    '',
    [tag(artist), tag(title), ...vibe.hashtags, ...studio.hashtags].filter((h, i, all) => h.length > 1 && all.indexOf(h) === i).join(' '),
  ].filter((l, i, a) => !(l === '' && a[i - 1] === ''));
  const file = path.join(outDir, 'caption.txt');
  await fs.writeFile(file, lines.join('\n') + '\n');
  log(`Caption: ${path.relative(process.cwd(), file)}`);
}
