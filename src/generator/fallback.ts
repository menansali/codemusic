import type { WireStoryboard } from '../schema/storyboard';
import { hashString, rng, pick } from '../lib/seed';

/**
 * Offline storyboard library. Used when no API key is available (or Claude fails).
 * Each template is parameterized by the topic so different topics give different videos,
 * and the variant index rotates so batch runs stay distinct.
 */

type Vars = { topic: string; word: string; camel: string; upper: string; slug: string };

function vars(topic: string): Vars {
  const words = topic.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const word = words[words.length - 1] ?? 'summer';
  const camel = words.map((w, i) => (i === 0 ? w : w[0]!.toUpperCase() + w.slice(1))).join('') || 'summer';
  const upper = word[0]!.toUpperCase() + word.slice(1);
  const slug = words.join('-') || 'reel';
  return { topic, word, camel, upper, slug };
}

const fill = (s: string, v: Vars) => s.replace(/\{topic\}/g, v.topic).replace(/\{word\}/g, v.word).replace(/\{camel\}/g, v.camel).replace(/\{upper\}/g, v.upper).replace(/\{slug\}/g, v.slug);

type Template = (v: Vars, r: () => number) => Omit<WireStoryboard, 'seed' | 'id' | 'topic'>;

const cam = (zoomFrom: number, zoomTo: number, fx: number, fy: number, tx: number, ty: number, tilt: number, f0: number, f1: number) => ({
  zoomFrom, zoomTo, panFrom: { x: fx, y: fy }, panTo: { x: tx, y: ty }, tiltDeg: tilt, focusFrom: f0, focusTo: f1,
});
const fx = (grain: number, lightLeak: number, dust: number, stars: number, aberration: number, vignette: number) => ({ grain, lightLeak, dust, stars, aberration, vignette });

const TEMPLATES: Template[] = [
  // A: waiting / looping — the reference's own arc, re-written.
  (v, r) => ({
    title: `last ${v.word}`,
    concept: `A programme that cannot stop missing ${v.topic}. An infinite loop is flagged as a warning, a beetle crosses the screen like a thought that will not leave, and the code finally drives toward a sun that never sets.`,
    palette: { accent: '#ff2a2a', warm: '#ff8a2a' },
    brand: null,
    lines: [`// last ${v.word}`, 'while (true) miss(you);', `like(stars.miss(sun));`, 'later.isBetterThan(never);', `if (${v.camel}.gone) keepGoing();`, `me.mood = "${pick(r, ['quiet', 'tender', 'blue', 'golden'])}";`],
    scenes: [
      { type: 'codeEditor', durationSec: 4.5, filename: `${v.camel}.js`, code: [`// last ${v.word}`, '', 'while (true) miss(you); // forever', ''], typingLine: 3, typedText: 'like(stars.miss(sun));', warning: { line: 2, text: 'infinite loop' }, autocomplete: null, camera: cam(2.8, 3.2, -0.45, -0.15, -0.1, 0.05, 11, 0.5, 1), effects: fx(0.5, 0.3, 0.3, 0, 0.45, 0.7) },
      { type: 'macroCode', durationSec: 3.5, token: 'forever', lineNumber: 3, context: ['while (true) miss(you);', 'like(stars.miss(sun));', '// every morning'], camera: cam(3.6, 4.1, -0.1, 0, 0.1, 0, 15, 0.3, 1), effects: fx(0.5, 0.1, 0.4, 0.9, 0.6, 0.7) },
      { type: 'ambient', durationSec: 2.5, code: ['later.isBetterThan(never);', '// every morning', `// ${v.topic}`], blurAmount: 0.85, camera: cam(2.3, 2.7, 0.3, 0.3, -0.2, 0, -14, 0.1, 0.3), effects: fx(0.6, 0.8, 0.6, 0.2, 0.2, 0.8) },
      { type: 'macroCode', durationSec: 3, token: 'if', lineNumber: 8, context: ['later.isBetterThan(never);', `if (${v.camel}.gone) keepGoing();`, 'drive();'], camera: cam(3.8, 4.3, 0, 0, 0.1, 0, -6, 0.25, 1), effects: fx(0.55, 0.15, 0.2, 0, 0.75, 0.75) },
      { type: 'codeEditor', durationSec: 3.5, filename: `${v.camel}.js`, code: ['later.isBetterThan(never);', '', `if (${v.camel}.gone)`, '  me.keepDriving();'], typingLine: 3, typedText: '  me.keepDriving();', warning: null, autocomplete: null, camera: cam(3.2, 2.9, 0.2, 0.2, -0.2, -0.1, 8, 0.7, 1), effects: fx(0.5, 0.35, 0.3, 0, 0.4, 0.7) },
      { type: 'sunset', durationSec: 5, code: ['drive();', 'drive();', '// radio up', 'drive();', '// windows down', 'drive();', 'drive();', "// don't look back", 'drive();', 'drive();', '// 4:30 am', 'drive();', 'drive();', 'drive();', '// keep going', 'drive();', 'drive();', 'drive();'], sunY: 0.11, haze: 0.65, camera: cam(1, 1.12, 0, 0, 0, -0.08, 0, 1, 1), effects: fx(0.6, 0.85, 0.5, 0.15, 0.3, 0.8) },
      { type: 'typography', durationSec: 3.5, text: `me.mood = "${pick(r, ['sadness', 'nostalgia', 'longing', 'warmth'])}";`, sub: `// if (season == "${v.word}")`, camera: cam(1, 1.06, 0, 0, 0, 0, 5, 0.8, 1), effects: fx(0.5, 0.3, 0.3, 0, 0.5, 0.75) },
      { type: 'codeEditor', durationSec: 4.5, filename: `${v.camel}.js`, code: ['while (true) miss(you);', 'like(stars.miss(sun));', 'later.isBetterThan(never);', `if (${v.camel}.gone) keepGoing();`, `me.mood = "${v.word}";`, '', `${v.camel}.forEach(day =>`], typingLine: 6, typedText: `${v.camel}.forEach(day =>`, warning: null, autocomplete: { line: 6, items: ['sun', 'sunset', `${v.word}time`] }, camera: cam(1.15, 1.35, 0, 0.05, 0, 0, 2, 1, 1), effects: fx(0.5, 0.2, 0.3, 0, 0.3, 0.7) },
    ],
    audio: { mood: 'warm', typingDensity: 0.7, musicFile: null, beatSec: null, beatOffset: null },
    transitions: 'mixed',
  }),
  // B: memory as a function that will not return.
  (v, r) => ({
    title: `remember(${v.word})`,
    concept: `Memory written as an async function that never resolves. The cursor waits, a beetle wanders through the gutter, and the promise resolves only at sunset.`,
    palette: { accent: '#ff3030', warm: '#ff9a2e' },
    brand: null,
    lines: [`async function remember(${v.word})`, 'await you; // still waiting', 'const light = new Sun(5, 47);', `return ${v.camel} ?? silence;`, '// resolved at dusk', 'export default longing;'],
    scenes: [
      { type: 'typography', durationSec: 3, text: `remember(${v.word});`, sub: `// ${v.topic}`, camera: cam(1, 1.08, 0, 0, 0, 0, -4, 0.6, 1), effects: fx(0.5, 0.25, 0.3, 0, 0.5, 0.75) },
      { type: 'codeEditor', durationSec: 4.5, filename: 'memory.ts', code: [`async function remember(${v.word}) {`, '  // still waiting', ''], typingLine: 2, typedText: '  await you;', warning: { line: 2, text: 'unreachable' }, autocomplete: null, camera: cam(2.9, 3.3, -0.4, -0.2, 0, 0.1, 13, 0.6, 1), effects: fx(0.5, 0.3, 0.3, 0, 0.45, 0.7) },
      { type: 'macroCode', durationSec: 2.5, token: 'await', lineNumber: 12, context: ['  await you;', '  const light = new Sun(5, 47);', '  return silence;'], camera: cam(4, 4.4, -0.1, 0, 0.05, 0, 7, 0.2, 1), effects: fx(0.55, 0.15, 0.2, 0, 0.8, 0.75) },
      { type: 'codeEditor', durationSec: 3.5, filename: 'memory.ts', code: ['const light = new Sun(5, 47);', `light.on(${v.camel});`, '', '// 5:47 am'], typingLine: 3, typedText: '// 5:47 am', warning: null, autocomplete: null, camera: cam(2.5, 2.8, 0.2, -0.3, -0.1, 0.15, -16, 0.9, 0.8), effects: fx(0.5, 0.15, 0.4, 0.8, 0.3, 0.7) },
      { type: 'ambient', durationSec: 2.5, code: [`return ${v.camel} ?? silence;`, '// resolved at dusk', 'export default longing;'], blurAmount: 0.9, camera: cam(2.2, 2.5, -0.3, 0.2, 0.2, -0.1, 12, 0.05, 0.3), effects: fx(0.6, 0.85, 0.6, 0.25, 0.2, 0.8) },
      { type: 'sunset', durationSec: 5, code: ['resolve();', '// slowly', 'resolve();', 'resolve();', '// then all at once', 'resolve();', 'resolve();', 'resolve();', '// 8:12 pm', 'resolve();', 'resolve();', '// windows down', 'resolve();', 'resolve();', 'resolve();', 'resolve();', 'resolve();'], sunY: 0.1, haze: 0.7, camera: cam(1, 1.1, 0, 0.05, 0, -0.05, 0, 1, 1), effects: fx(0.6, 0.9, 0.5, 0.1, 0.3, 0.8) },
      { type: 'codeEditor', durationSec: 4, filename: 'memory.ts', code: [`async function remember(${v.word}) {`, '  await you; // still waiting', '  const light = new Sun(5, 47);', `  return ${v.camel} ?? silence;`, '}', '', ''], typingLine: 6, typedText: `export default ${pick(r, ['longing', 'tenderness', 'quiet'])};`, warning: null, autocomplete: { line: 6, items: ['longing', 'light', `${v.word}`] }, camera: cam(1.2, 1.4, 0, 0.05, 0, 0.02, 3, 1, 1), effects: fx(0.5, 0.2, 0.3, 0, 0.3, 0.7) },
      { type: 'typography', durationSec: 5, text: `// ${pick(r, ['see you next', 'until next', 'same time next'])} ${v.word}`, sub: null, camera: cam(1, 1.05, 0, 0, 0, 0, 2, 0.9, 1), effects: fx(0.5, 0.35, 0.3, 0, 0.4, 0.8) },
    ],
    audio: { mood: 'dusty', typingDensity: 0.6, musicFile: null, beatSec: null, beatOffset: null },
    transitions: 'mixed',
  }),
  // C: a try/catch that keeps failing softly.
  (v, r) => ({
    title: `try { ${v.word} }`,
    concept: `An error handler for feelings. Every try block reaches for ${v.topic}; every catch swallows the error gently. The cursor blinks over the one line it cannot type.`,
    palette: { accent: '#ff2626', warm: '#ff7f24' },
    brand: null,
    lines: ['try {', `  hold(${v.camel});`, '} catch (ache) {', '  // let it pass', '  setTimeout(forget, Infinity);', '}'],
    scenes: [
      { type: 'ambient', durationSec: 2.5, code: ['try {', `  hold(${v.camel});`, '} catch (ache) {'], blurAmount: 0.8, camera: cam(2.4, 2.8, -0.2, 0.3, 0.2, 0, -10, 0.1, 0.4), effects: fx(0.6, 0.75, 0.6, 0.2, 0.2, 0.8) },
      { type: 'codeEditor', durationSec: 4.5, filename: `${v.slug}.js`, code: ['try {', '', '} catch (ache) {'], typingLine: 1, typedText: `  hold(${v.camel});`, warning: { line: 1, text: 'may throw' }, autocomplete: null, camera: cam(2.9, 3.3, -0.4, -0.1, 0.05, 0.05, 10, 0.5, 1), effects: fx(0.5, 0.3, 0.3, 0, 0.45, 0.7) },
      { type: 'macroCode', durationSec: 3, token: 'catch', lineNumber: 3, context: ['try {', '} catch (ache) {', '  // let it pass'], camera: cam(3.9, 4.3, 0.05, 0, -0.05, 0, -8, 0.3, 1), effects: fx(0.55, 0.15, 0.2, 0, 0.75, 0.75) },
      { type: 'ambient', durationSec: 3.5, code: ['} catch (ache) {', '  // let it pass', '  setTimeout(forget, Infinity);', '}'], blurAmount: 0.6, camera: cam(2.5, 2.9, -0.25, -0.2, 0.2, 0.15, 14, 0.3, 0.8), effects: fx(0.5, 0.3, 0.4, 0.85, 0.3, 0.7) },
      { type: 'typography', durationSec: 3, text: `setTimeout(forget, Infinity);`, sub: '// never fires', camera: cam(1, 1.07, 0, 0, 0, 0, 4, 0.7, 1), effects: fx(0.5, 0.3, 0.3, 0, 0.5, 0.75) },
      { type: 'sunset', durationSec: 5, code: ['retry();', 'retry();', '// softer this time', 'retry();', 'retry();', 'retry();', '// 6:02 pm', 'retry();', 'retry();', '// no stack trace', 'retry();', 'retry();', 'retry();', 'retry();', '// keep the window open', 'retry();', 'retry();', 'retry();'], sunY: 0.12, haze: 0.6, camera: cam(1, 1.13, 0, 0, 0, -0.1, 0, 1, 1), effects: fx(0.6, 0.85, 0.5, 0.15, 0.3, 0.8) },
      { type: 'codeEditor', durationSec: 4.5, filename: `${v.slug}.js`, code: ['try {', `  hold(${v.camel});`, '} catch (ache) {', '  // let it pass', '  setTimeout(forget, Infinity);', '}', ''], typingLine: 6, typedText: `finally { ${pick(r, ['smile', 'breathe', 'stay'])}(); }`, warning: null, autocomplete: { line: 6, items: ['finally', 'forget', `${v.word}`] }, camera: cam(1.2, 1.4, 0, 0.05, 0, 0, 2, 1, 1), effects: fx(0.5, 0.2, 0.3, 0, 0.3, 0.7) },
    ],
    audio: { mood: 'cold', typingDensity: 0.75, musicFile: null, beatSec: null, beatOffset: null },
    transitions: 'mixed',
  }),
];

export const FALLBACK_TEMPLATE_COUNT = TEMPLATES.length;

/** Build a wire storyboard for a topic. The seed alone selects the template and all variation, so `--seed` reproduces any video. */
export function fallbackStoryboard(topic: string, seed?: number): WireStoryboard {
  const v = vars(topic);
  const s = (seed ?? hashString(topic)) >>> 0;
  const r = rng(s, 'fallback');
  const template = TEMPLATES[s % TEMPLATES.length]!;
  const body = template(v, r);
  const out: WireStoryboard = {
    id: v.slug,
    topic,
    seed: s,
    ...body,
    lines: body.lines.map((l) => fill(l, v)),
  };
  return out;
}
