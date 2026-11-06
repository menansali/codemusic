# Mezzanine Studio

Automated production system for cinematic, vertical Instagram Reels in a dark code-editor aesthetic:
extreme macro typography, syntax-highlighted code, a blinking red block cursor, shallow depth of
field and light film grain. Song reels keep the frame to the editor itself: no glow, no particles.

Every run produces an original 30 s, 1080x1920, 30 fps H.264 MP4 with mixed, loudness-normalized audio
and a JSON manifest. Concepts, poetic code lines and scene timings come from Claude; the same seed always
renders the same video.

## Stack

TypeScript, React, Remotion 4, FFmpeg, Claude API (`@anthropic-ai/sdk`), Zod.

## Install

Requirements: Node 20+ (Node 24 recommended), `ffmpeg` and `ffprobe` on PATH (macOS: `brew install ffmpeg`).

```bash
npm install          # also downloads Remotion's headless Chrome
cp .env.example .env # add ANTHROPIC_API_KEY (optional, see below)
```

## Usage

```bash
# one video from a topic
npm run generate -- --topic "summer nostalgia"

# five distinct videos
npm run generate:batch -- --count 5 --topic "late night trains"

# list everything rendered so far
npm run list

# print a video's scene configuration and render one still per scene
npm run preview -- --id summer-nostalgia-1eosay0

# interactive preview of the composition and every scene type
npm run studio

# lyric-as-code reel cut to a song section (see "Song videos")
npm run song -- --music ~/Music/track.mp3 --lyrics assets/lyrics/track.lrc \
  --hook "first words of the chorus" --names "artist1,artist2" --title "Track" --artist "Artist"
```

Options for `generate` and `batch`:

| Flag | Meaning |
| --- | --- |
| `--seed <n>` | integer seed; same topic + seed = identical storyboard and frames |
| `--duration <sec>` | target length, 25 to 35 (default 30) |
| `--draft` | fast encode (veryfast preset, CRF 23) for checking ideas |
| `--dry-run` | write storyboard + audio stems, skip the render |
| `--fallback` | skip Claude and use the built-in storyboard library |
| `--brand <text>` | brand mark shown top-left through the middle of the reel (or set `BRAND_NAME` in `.env`) |

Output lands in `output/<id>/`:

```
video.mp4         final H.264 / AAC, faststart, -16 LUFS
storyboard.json   the validated storyboard that was rendered
manifest.json     topic, seed, generator, model, probe results, validation, per-scene timing
audio/            bed.wav, sfx.wav (and music.wav when music was mixed)
stills/           written by `npm run preview`
```

## Song videos

`npm run song` builds the format the reference account uses most: the lyrics typed as code by named
collaborative cursors, in sync with the vocals, cut on the beat.

| Flag | Meaning |
| --- | --- |
| `--music <file>` | the track (mp3, wav, m4a, flac...) |
| `--lyrics <file.lrc>` | synced lyrics in LRC format; each line is typed when it is sung |
| `--hook <phrase>` | start the reel on the first lyric containing this phrase (chorus) |
| `--start <sec>` | explicit start time instead of hook/loudest-section detection |
| `--bpm <n>` | override the detected tempo |
| `--names <a,b>` | cursor tags; two names make a duet (red and blue cursors) |
| `--title`, `--artist` | used for the file name and manifest |
| `--duration <sec>` | reel length, default 30 |
| `--story <file>` | story notes and twist (see below) |
| `--hero <kind>` | hero set piece: `neon`, `tape`, `player`, `horizon`, `none`, `auto` |
| `--no-claude` | use the built-in lyric converter even with an API key |

`npm run songs -- --file songs.json` renders a list of songs in one go (see `songs.example.json`; each
entry takes the same options as the song command). Every render also writes `caption.txt` with a Turkish
caption and hashtags.

Every song render also writes `cover.jpg` (a frame from the reveal, for the post cover) and
`video.nosong.mp4` (key clicks and room tone only). Instagram and TikTok sometimes mute uploads that
contain commercial music; post the no-song version and add the track from the in-app library instead.

**Who sings which line.** Prefix a lyric in the LRC with the cursor name, `[00:52.1] poizi: Lütfen bu gece
içme` or `[00:52.1] (poizi) ...`. Unmarked chorus lines go to the first name; unmarked verse lines alternate
in pairs.

**Pacing.** Lines that recur in the song are treated as chorus and cut on every line; verse lines cut every
two lines or after four seconds. Cuts land on the beat before the vocal. Energy jumps in the track get a
flash entrance; the reveal enters with a focus pull.

**Hero set pieces** sit in the top third for the whole reel and fade out for the reveal: a neon sign (glass
tubes tracing the title, the artist names in a second colour, an icon picked from the title's meaning, one
letter that buzzes, glow that surges on kicks), a cassette deck with spinning reels, a now-playing card with the real track position, and a
line-terrain horizon that moves with the music.

**Code lines by Claude.** With `ANTHROPIC_API_KEY` set, each sung line is rewritten as short poetic code in
its original language, and the model picks the visual cues by meaning. Without a key, or on any failure,
the rule-based converter is used. The manifest records which one ran.

What happens: `src/audio/beat.ts` decodes the track, estimates tempo and beat phase (spectral flux +
autocorrelation) and finds the loudest section; `src/lyrics/codify.ts` turns each lyric into code
(`what is love` becomes `what.is(love);`, questions become `if (...)`, repeated words become `w(); w();`);
`src/lyrics/songboard.ts` groups lines into scenes that cut on the beat ahead of each vocal entry and ends
with a wide reveal of the whole file; `src/scenes/LyricEditorScene.tsx` types the lines at their timestamps
with motion-blurred whip pans between lines. The track is mixed at full level with the synthesized bed and
key clicks underneath. Drop LRC files in `assets/lyrics/` (lrclib.net serves synced lyrics for most songs).

Without `--lyrics` the song command still runs but has nothing to type; use `generate --topic` with a music
file in `assets/music/` for an ambient reel instead.

### Vibes: a different look per song

`--vibe` (or `"vibe"` in `studio.json`, default `auto`) picks a complete look: editor theme, palette, hero
piece, overlay, cut style, camera punch and glitch strength.

| Vibe | For | Look |
| --- | --- | --- |
| `gece` | sad rap, night songs | dark editor, amber and red, nothing over the code |
| `arabesk` | arabesk, old Turkish songs | warm faded colours, VHS scanlines and OSD, cassette deck, hard cuts |
| `drill` | drill, club, trap | magenta and cyan, whip cuts, heavy kick punch, glitch |
| `ask` | love songs, pop | light editor theme, pink and peach, now-playing card |
| `terminal` | alternative, rock | green CRT terminal, scanlines |
| `whatsapp` | breakup songs | lyrics as a chat thread: typing in the input bar, "yazıyor…", ticks |
| `mono` | songs about opposites, cold songs | black and white editor, white cursor; only errors keep their red. A line with "yin … yang" splits the frame along the yin-yang curve, one half inverted (works in any vibe); an error twist takes the light half away |

Each vibe also sets its own scene cuts, colour grade, stutter and default ending:

| Vibe | Cuts | Ending (`auto`) |
| --- | --- | --- |
| `gece` | whip pans, hard cut, flash | `save` |
| `arabesk` | hard cut, focus pull | `crt` |
| `drill` | datamosh smear, whips, flash | `card` |
| `ask` | focus pull, hard cut | `save` |
| `terminal` | hard cut, flash | `crt` |
| `whatsapp` | hard cut; the twist deletes your last message ("Bu mesaj silindi") | `card` |
| `mono` | hard cut, focus pull, flash | `card` |

`auto` looks at tempo, loudness and lyric vocabulary (arabesk words, breakup words, love words) in
`src/lib/vibes.ts`; extend the word lists there.

**House rule: no stock effects.** Text is drawn flat: no bloom, no RGB fringe, no lens flares, sparks,
sparkle stars, light leaks or floating clip-art. The richness goes into the typing itself. The neon sign,
tape deck, player and horizon heroes still exist (`--hero neon`), but only `arabesk` (tape) and `ask`
(player) use one by default. `cutIn: burn` and `bokeh` in old storyboards fall back to a hard cut and a
focus pull.

### Hooks and endings

- **Smash pull-out (default).** Frame 0 is an extreme macro inside the first word being typed, cursor
  glowing; on the first beat after ~0.7 s the camera snaps back into the editor. Set `"hookStyle"` in
  `studio.json` to `macro`, `flashforward`, `question` (uses the `?` line of the story file) or `none`.
- **Mid-action start.** The first lyric is already being typed when the video opens.
- **Pattern break.** If no cut lands between 2.4 and 3.8 s, a snap zoom and glitch is added on the beat there.
- **Kick punch.** Kick drums are detected from the low end of the track; the frame punches on each one.
- **Variant B.** `--variants 2` also renders `video.b.mp4` with a flash-forward hook (a rewound glimpse of
  the ending) so you can compare which opening performs better.
- **Ending.** `--ending auto` (default, by vibe), `card` (fade to the studio card), `crt` (the screen
  powers off into a line, then the card), `save` (a quiet "Kaydedildi" notice under the code, the editor
  window closes, then the card) or `loop` (the last frames dissolve into frame 0 for a seamless replay).
- **Section colour grade.** Verses are cooler and washed out, chorus lines warm and saturated, the twist
  gets its own grade (per vibe, `grade` in `src/lib/vibes.ts`).
- **Stutter edit.** When a chorus line lands, the camera punches in on it and the picture repeats three
  frames twice (up to three times per reel, vibes with `stutter: true`).
- **Speed ramp.** The camera creeps in and over-exposes for half a second before each drop, then the cut hits.
- **Directional motion blur** on the whip pans between lines (vertical blur, not multi-sample).

### Song edit (sound design)

The trimmed song stem is processed in `src/audio/songfx.ts`, synced to the storyboard:

- **Filter sweep:** the track is muffled for ~1.1 s before each drop and opens wide on the cut.
- **Reverse swell:** the first moment of the chorus (or the drop) reversed, rising into it.
- **Tape stop:** when a `!run`, `!error` or `!git` twist fires, the track winds down, holds a beat of
  silence and comes back in time.
- Key clicks on chorus lines are louder. `video.nosong.mp4` is unaffected.
- **Episode tag.** `#001`, `#002`… numbered automatically (`"episodes": false` in `studio.json` turns it off).

### Typing styles

**Typos, fixed live.** Up to three times per reel (at least 6 s apart) the typist misses a letter, types
on for a key or two, gets a red spellcheck squiggle, backspaces and fixes it. Missed Turkish letters come
first, the way people actually type on a phone: `gulüyorsun` → `gülüyorsun`, `anlardin` → `anlardın`,
`oyle` → `öyle`. Otherwise it is a neighbouring key. A typo only goes on a line with enough time before
the next vocal, so the words still land on the beat (`pickTypo` and `lyricPlans` in
`src/schema/timeline.ts`). Key clicks include the backspaces.

Chorus lines show the rest of the line as grey ghost text ahead of the cursor, like an autocomplete that
already knows the song. Lines with hesitation words (keşke, belki, yalan, vazgeç…) are typed, partly deleted
and retyped. Words act out their meaning, letter by letter:

| Words | Effect |
| --- | --- |
| bitti, kırıldı, bitecem… | crack apart and pull back together |
| yandı, ateş, alev… | glow hot, cool to charred red |
| buz, soğuk, kış… | letters cool to ice blue, one by one |
| düştüm, yere… | letters drop with gravity and bounce |
| uçtum, özgür, kanat… | letters float up |
| unuttum, gitti, kayboldu… | the word fades and drifts away |
| bağırdım, haykır… | huge and shaking |
| fısıldadım, sessiz, sus… | tiny and dim |
| kalbim, nabız… | pulses on every kick |
| gülüyorsun, kahkaha… | letters hop like laughter |
| güzel, parlak… | underlined once, as if by hand |
| yalan / inan, yemin | struck through / underlined |
The twist line types slower.

### Who sings which line

Cursor names come from the lyrics file, never from a guess. Put section headers in the LRC, with or
without a timestamp, and every line under them belongs to that singer:

```
[Nakarat: BLOK3]
[00:35.80] Gidersen git, emin ol kalmaz aklım
[Bölüm 1: BLOK3]
[00:51.92] Lütfen bu gece içme, ben bitice'm bu gidişle
[Nakarat: Poizi]
[01:26.12] Gidersen git, emin ol kalmaz aklım
[Bölüm 2]                                 (no name: back to the lead artist)
```

A single line can also be tagged inline (`[01:02.00] poizi: ...`). Lines with no header or tag go to the
first name in `--names`. With `!join`, the reel ends as the second name joins: a "poizi katıldı" notice,
their cursor starts typing their next line from the LRC, the camera pushes in, and the reel cuts to the
card mid-line.

### The story layer (the plot twist)

`--story <file>` adds the "real story behind the song":

```
? ...                                    hook question (only with hookStyle "question")
@6 kayıp persona. 5 haziran 2026.        note at reel time 6 s (untimed notes are spread out)
! tek konuk. tek düet.                   twist typed as a comment under the finished file
!run tek konuk. tek düet.                the file is run; the console prints the twist
!error sen is undefined                  a compile error pops up, the screen shakes
!replace seni => beni                    find & replace flips a word across the whole song
!git son commit: gerçek hikâye.          git log of the notes, ending on this commit
!join albümün tek konuğu.                the second artist joins the file and starts typing their part
```

### Word cues (typed on every beat, drawn on every word)

`src/lyrics/lexicon.ts` maps lyric words (Turkish and English stems) to the letter effects above, fired the
moment the word is typed: "lie" strikes the word through, "believe" underlines it. (The lexicon also maps
words to floating props such as rain, a heart or the moon; those are drawn in `src/composition/Props.tsx`
but are off in song reels.) Typing
cadence is quantized to beat subdivisions so key clicks land on the grid. Extend the lexicon to teach the
studio new words.

### Held notes, the beat, and editor moments

- **Held notes.** When the singer holds a word, its last vowel keeps typing for as long as the note lasts
  (`ziyan` becomes `ziyaaaaaan` while it is sung), then the extra letters squeeze back out. It needs word timings:
  the aligner writes `<song>.words.json` next to the `.lrc`. For an LRC you already have, add them with
  `npm run words -- <audio> <song.lrc> <song.words.json>`. Without the file nothing is stretched. Only clear outliers
  count (a word much longer than the song's typical word, at the end of a line), at most one per line.
- **Drums.** Kicks punch the camera in (as before); snares now nudge it sideways with a small roll, alternating
  direction, and make the line numbers flicker. Both are detected from the track itself.
- **Find.** The word typed most often in the reel (four times or more) gets searched once: the find bar opens
  (`Bul  sen  14 eşleşme`), every match lights up, and the camera pulls back to show them.
- **Diff.** A line that rewrites an earlier one (three words or more, exactly one changed) shows the old version above
  it as a removed red line, the new one in green.
- **Verse folds.** In the reveal, runs of three or more verse lines fold into one `▸ verse1() { … }` line, so the
  chorus and the twist get the room (not with a `replace` twist, which needs every line).
- **Duet split.** A scene where two singers trade lines (two each, two switches or more) gets two panes, one file
  per singer; the pane whose singer is on is lit.
- **Signature effect.** One per song, from what the song is about, fired once on the first time its word is typed:

  | Signature | Triggered by | What happens |
  | --- | --- | --- |
  | `yinyang` | yin + yang | the frame splits into the two halves |
  | `mirror` | ayna, yansıma, tersine, mirror | the editor turns around, the text reads backwards for a moment |
  | `loop` | döngü, tekrar, yeniden, sonsuz, again | the line duplicates itself three times down the file |
  | `retro` | eski, geçmiş, nostalji, hatıra, anılar | the shot turns into an old green-on-black screen |
  | `light` | ışık, aydınlık, light | the whole frame switches to light mode until the cut |

  `--signature auto` (default) checks the title first, then a word the reel's lyrics repeat at least twice;
  `--signature none` turns it off. The dashboard has the same choice under *Signature effect*.
- **Crash twist.** The `error` twist now crashes: the error, a stack trace built from the song's own lines
  (`at gidersen (song.js:12:1)`), `Process exited with code 1`, then a hard cut to black and the last story note
  typed out.

### Studio identity

`studio.json` holds the house style: name, tagline, palette, cursor colours, allowed props, default hero
and the cut style (`cut`, `whip` or `mixed`). `BRAND_NAME` and `BRAND_TAGLINE` in `.env` override name and tagline. With a
name set (`codemusic.tr`), the name types itself into the top-left corner after the first scene and stays until the
ending starts; there is no end card, the reel fades to black after the twist.

## Dashboard (make, review, post)

```bash
npm run setup:align   # once: installs automatic lyric timing (Whisper, ~1.5 GB model on first use)
npm run dashboard     # http://localhost:4400
```

- **New reel**: add the song, paste plain lyrics, press *Time the lyrics to the song*. The dashboard transcribes
  the track with Whisper and lines your lyrics up against it (`tools/align/align.py`), so the lyrics you paste stay
  the source of truth and Whisper only supplies the timing (it also saves word timings for held notes). The timed `.lrc` is editable right there. Then fill in title, artist, story
  notes and press *Render*.
- **Queue**: every render lands in *Needs review*. Watch it, choose version A, B or no-song, edit the caption, then
  *Approve*. Approved reels can be posted now or scheduled. Posted reels show their stats (views, reach, likes,
  comments, shares, saves) with *Refresh stats*.
- **Settings**: a step-by-step guide to connect Instagram (Professional account + a free Meta developer app,
  Instagram Login, no Facebook Page). The token is stored in `.env` only and renewed automatically every 20 days.

How posting works: Instagram's API downloads the video from a public URL. At post time the dashboard copies the
video to Instagram's audio spec (AAC 128 kbps, moov first, no edit lists), opens a temporary Cloudflare quick tunnel
(`brew install cloudflared`) to a separate tiny server that serves only that one file under a random path, creates the
reel, waits for Instagram to process it, publishes, and closes the tunnel. The dashboard itself is never exposed:
it listens on 127.0.0.1 only and refuses other Host headers and cross-site writes.

Limits to know:
- Scheduled posts go out only while `npm run dashboard` is running and the Mac is awake. A post that was due while
  it was off goes out as soon as it starts again.
- Reels posted through the API can't use Instagram's music library, so the song is in the video. Instagram may mute
  or block copyrighted audio. If that happens, post the *No song* version from the phone and add the track in the app.
- Instagram allows 100 API posts per 24 hours per account; Settings shows the current count.

## How a video is made

1. **Concept** — `src/generator/generate.ts` asks Claude (`claude-opus-5-5` by default, `ANTHROPIC_MODEL`
   to override) for a storyboard using structured output (`zodOutputFormat`). The storyboard carries a title,
   concept, 3–8 poetic code lines, 5–8 scenes with camera moves and effect intensities, and an audio mood.
2. **Validation** — `src/generator/normalize.ts` clamps every value, truncates over-long lines, strips
   non-ASCII, breaks runs of identical scene types and scales scene durations so the total is exactly the
   target. The result must pass the strict Zod schema in `src/schema/storyboard.ts`.
3. **Audio** — `src/audio/synth.ts` synthesizes two stems with no dependencies: a bed (brown-noise room tone
   and a detuned drone keyed to the mood) and sfx (typing clicks on every typed character, air whooshes on
   every cut). Timings come from `src/schema/timeline.ts`, the same function the composition uses, so sound
   and picture cannot drift. Drop an MP3/WAV into `assets/music/` and it is trimmed, faded and mixed under
   the bed.
4. **Render** — `src/render/render.ts` bundles the Remotion project, resolves the duration from the
   storyboard and renders H.264 with `@remotion/renderer`.
5. **Post** — `src/audio/post.ts` runs a two-pass EBU R128 loudness pass (video stream copied) and moves the
   moov atom to the front. `src/render/validate.ts` checks codec, resolution, frame rate, frame count,
   duration and the audio stream with ffprobe before the manifest is written.

### Without an API key

If `ANTHROPIC_API_KEY` is missing or authentication fails, the pipeline uses the offline storyboard library
in `src/generator/fallback.ts`: three hand-written templates parameterized by the topic and seed. The manifest
records `"generator": "fallback"`. Everything else (render, audio, validation) is identical.

## Visual system

- `src/editor/` — the editor is real HTML/CSS: gutter, tab bar, tokenizer-driven syntax colours, red
  squiggles with amber warning tooltips, an autocomplete popup and a typewriter cursor. It is rendered
  oversized (2200x3200) and framed by the camera.
- `src/effects/CameraRig.tsx` — zoom, pan, Dutch tilt and rack focus interpolated with a cinematic ease;
  the camera moves independently of the code layer. A defocused duplicate editor behind the focus plane
  provides parallax depth.
- `src/effects/` — film grain (tiled SVG turbulence, re-seeded per frame), dust (seeded SVG particles),
  vignette, depth-of-field blur, the yin-yang split. Glow pieces (light leaks, sparkle stars, the neon sign
  hero) were removed: the reels stay flat and typed.
- `src/scenes/` — `LyricEditorScene` (song reels), `CodeEditorScene`, `MacroCodeScene`, `InsectScene`,
  `SunsetScene`, `AmbientScene`, `TypographyScene`. `src/composition/Reel.tsx` sequences them with
  per-cut transitions (whip up/down with motion blur, focus pull, warm flash), a beat-locked micro push
  when the reel is cut to music, global overlays driven by the active scene, and the corner brand mark.

All randomness goes through `src/lib/seed.ts` or Remotion's `random()`; nothing uses `Math.random` or CSS
animations, so renders are reproducible frame for frame.

## Configuration

`.env` (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | enables Claude generation |
| `ANTHROPIC_MODEL` | model id, default `claude-opus-5-5` |
| `BRAND_NAME` | optional brand mark; blank = no branding |
| `FFMPEG_PATH`, `FFPROBE_PATH` | binaries if not on PATH |
| `RENDER_CONCURRENCY` | parallel browser tabs, default 6 |

Render quality lives in `src/lib/renderSettings.ts` (CRF 17, x264 `slow`, JPEG 95 for final; `veryfast`
for drafts). Frame size and rate are fixed at 1080x1920 @ 30 fps.

## Troubleshooting

- **Render is slow** — a final render takes a few minutes on a laptop; use `--draft` while iterating and
  `RENDER_CONCURRENCY` to match your cores.
- **`ffmpeg: command not found`** — install FFmpeg or set `FFMPEG_PATH` / `FFPROBE_PATH`.
- **Claude errors** — the SDK retries rate limits and 5xx automatically; refusals or repeated schema
  failures fall back to the offline library and the reason is recorded in `manifest.json` under `notes`.
- **Fonts** — JetBrains Mono is vendored in `public/fonts/`, so renders need no network access.
- **Render hangs at "Waiting for root component to load"** — Remotion's default headless Chrome hangs while
  loading web fonts on this macOS release, so the project renders with Chrome for Testing (downloaded once, ~190 MB,
  into `node_modules/.remotion`). Set `REMOTION_CHROME_MODE=headless-shell` to go back.
- **Anything hangs at 0% CPU (typecheck, render, a plain `cat`)** — the project sits on the iCloud Desktop, and when
  the disk is nearly full macOS offloads files to iCloud ("Optimize Mac Storage"); reading one then waits for the
  download. `find . -flags +dataless` lists offloaded files and `brctl download <file>` brings one back. Dependencies
  live in `node_modules.nosync` (iCloud never syncs `.nosync` folders) with `node_modules` as a link to it; after an
  `npm install` (which replaces the link with a folder), move the folder back:
  `rm -rf node_modules.nosync && mv node_modules node_modules.nosync && ln -s node_modules.nosync node_modules`.
  Keeping 30 GB+ free, or moving the project out of Desktop, stops the offloading.

## Licence note

Remotion is free for individuals and small teams; companies above the free tier need a Remotion licence.
