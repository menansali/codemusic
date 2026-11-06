/**
 * Word -> visual cue lexicon. Matched against folded (lowercase, diacritics stripped) lyric words,
 * Turkish and English. `prop` is a scene-level visual, `mark` decorates the word inline.
 */
import type { MARK_KINDS } from '../schema/storyboard';

export type PropKind = 'rain' | 'sun' | 'moon' | 'stars' | 'heart' | 'fire' | 'photo' | 'clock' | 'smile' | 'wave' | 'smoke' | 'loop' | 'glass';
export type MarkKind = (typeof MARK_KINDS)[number];
export type Cue = { prop: PropKind | null; mark: MarkKind | null };

type Entry = { re: RegExp; prop?: PropKind; mark?: MarkKind };

/** Scene-level props. First match wins. */
const PROPS: Entry[] = [
  // crying, rain, tears
  { re: /^(agla|aglad|agliyor|aglam|gozyas|yagmur|yagiyor|islan|cry|crying|tears?|rain|raining)/, prop: 'rain' },
  // sun, morning, light
  { re: /^(gunes|sabah|gunaydin|isik|aydinl|sun|sunrise|sunset|morning|light)/, prop: 'sun' },
  // night, moon, dark
  { re: /^(gece|ay$|mehtap|karanlik|night|moon|midnight|dark)/, prop: 'moon' },
  // stars, sky, dream
  { re: /^(yildiz|gokyuz|ruya|hayal|stars?|sky|dream)/, prop: 'stars' },
  // love, kiss, heart
  { re: /^(ask|sev(?!me|mi|mez)|kalp|kalbim|optum|opt|opuc|saril|love|lover|kiss|heart|darling)/, prop: 'heart' },
  // fire, fight, burn ("yan" alone is "side": yanimda = next to me, so only verb forms)
  { re: /^(ates|yan(d|iyor|ar|mak|gin|ik$|acak)|yak(t|iyor|ar|mak|acak)|savas|kavga|alev|fire|burn|fight|flame)/, prop: 'fire' },
  // memory, photo, past
  { re: /^(fotograf|foto|ani$|anilar|hatir|unut|eski|gecmis|photo|picture|memor|remember|forget)/, prop: 'photo' },
  // time, waiting, clock
  { re: /^(saat|zaman|bekl|gec$|gecikt|yillar|yil$|time|wait|hours?|clock|years?)/, prop: 'clock' },
  // laugh, smile
  { re: /^(gul|guluyor|gulus|gulumse|smile|laugh|smiling)/, prop: 'smile' },
  // song, voice, music
  { re: /^(sarki|ses$|sesin|muzik|dinle|radyo|song|voice|music|sing|radio)/, prop: 'wave' },
  // smoke, cigarette, drink
  { re: /^(sigara|duman|icme|icki|sarhos|smoke|cigarette|drink|drunk|wine|whisky)/, prop: 'smoke' },
  // endless, forever, again
  { re: /^(sonsuz|hep$|yine|tekrar|dongu|forever|again|always|loop|endless)/, prop: 'loop' },
];

/** Letter behaviours: the word acts out its meaning. First match wins. */
const MARKS: Entry[] = [
  // breaking, ending -> the letters crack apart
  { re: /^(bitti|bitic|bitec|kirild|kirik|kiril|yikild|paramparca|dagild|bozuld|oldu$|olmus|broke|broken|over$|shatter|crack)/, mark: 'shatter' },
  { re: /^(yalan|lie|lies|liar|fake)/, mark: 'strike' },
  { re: /^(inan|soz$|yemin|promise|believe|swear|truth)/, mark: 'underline' },
  // fire -> letters burn into embers
  { re: /^(ates|yan(d|iyor|ar|mak|gin|ik$|acak)|yak(t|iyor|ar|mak|acak)|alev|kul$|kuller|cehennem|fire|burn|flame|hell)/, mark: 'burn' },
  // cold -> frost grows over the word ("don" is also "return" once folded, so not used)
  { re: /^(buz|soguk|ayaz|kis$|kisin|kar$|usu|titre|cold|ice|icy|freeze|frozen|winter|snow)/, mark: 'frost' },
  // falling -> letters drop with gravity
  { re: /^(dus(tu|tum|uyor|mek|ecek|erim|ers|me$)|yere|cokt|fall|falling|fell|drop)/, mark: 'fall' },
  // flying, free -> letters float up ("uc" alone is also "three")
  { re: /^(uc(tu|tum|uyor|mak|arim|ar$|alim|us)|havalan|kanat|ozgur|fly|flying|float|free$|wings?)/, mark: 'float' },
  // leaving, forgetting -> the word dissolves
  { re: /^(kaybol|yokol|unut|silin|sildim|sil$|gitti|gidiyor|gidersen|gidis|gitme|git$|terk|elveda|disappear|fade|gone|vanish|forget|leave|left$)/, mark: 'dissolve' },
  // shouting -> huge and shaking
  { re: /^(bagir|haykir|cigli|ciglik|isyan|scream|shout|yell)/, mark: 'shout' },
  // whispering -> tiny and dim
  { re: /^(fisilda|fisilt|sessiz|sus$|sustu|susuyor|whisper|quiet|silent|silence)/, mark: 'whisper' },
  // heartbeat -> pulses on the kick
  { re: /^(kalp|kalbim|kalbin|nabiz|atiyor|heart|heartbeat|beat$)/, mark: 'pulse' },
  // laughing -> the letters hop
  { re: /^(gul(uyor|dun|dum|us|mek|ersen|meye|$)|kahkaha|haha|laugh|laughing)/, mark: 'bounce' },
  // beauty -> a glint runs across the word
  { re: /^(guzel|parla|isilt|pirilt|beautiful|pretty|shine|gorgeous)/, mark: 'shine' },
];

export const fold = (s: string) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

export function cueForWord(word: string): Cue | null {
  const w = fold(word).replace(/[^a-z]/g, '');
  if (w.length < 2) return null;
  const prop = PROPS.find((e) => e.re.test(w))?.prop ?? null;
  const mark = MARKS.find((e) => e.re.test(w))?.mark ?? null;
  return prop || mark ? { prop, mark } : null;
}

/** Scan a code line, return cues keyed by the character index where the word ends. */
export function cuesForLine(codeLine: string): { char: number; word: string; prop: PropKind | null; mark: MarkKind | null }[] {
  const out: { char: number; word: string; prop: PropKind | null; mark: MarkKind | null }[] = [];
  const re = /[\p{L}]+/gu;
  let m: RegExpExecArray | null;
  const seenProps = new Set<PropKind>();
  while ((m = re.exec(codeLine)) !== null) {
    const cue = cueForWord(m[0]);
    if (!cue) continue;
    const prop = cue.prop && !seenProps.has(cue.prop) ? cue.prop : null;
    if (prop) seenProps.add(prop);
    if (prop || cue.mark) out.push({ char: m.index + m[0].length, word: m[0], prop, mark: cue.mark });
  }
  return out;
}
