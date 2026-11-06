"""Time plain lyrics against a song: Whisper word timestamps + sequence alignment -> LRC.

usage: python -I align.py <audio> <lyrics.txt> <out.lrc> [model]
       python -I align.py --words <audio> <timed.lrc> <out.words.json> [model]

Both write per-word timings next to the LRC (<name>.words.json); held notes in the reel come from them.
The --words form keeps an existing LRC as it is and only adds the word timings.

Lyrics are the source of truth (Whisper mishears rap); Whisper only supplies *when* each word is sung.
Section headers like "[Nakarat: Motive]" in the lyrics are kept and passed through to the LRC.
Progress goes to stderr as "progress <0..1>", the result summary to stdout as JSON.
"""
import json
import re
import subprocess
import sys
import unicodedata

import numpy as np


def fold(s: str) -> str:
    s = s.replace("İ", "i").replace("I", "ı").lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("ı", "i")
    return re.sub(r"[^a-z0-9]", "", s)


def sim(a: str, b: str) -> float:
    """Normalised similarity (1 = same) from Levenshtein distance."""
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return 1 - prev[-1] / max(len(a), len(b))


def load_audio(path: str) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768


def transcribe(audio: np.ndarray, model_name: str):
    from faster_whisper import WhisperModel

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segs, info = model.transcribe(audio, language="tr", word_timestamps=True, vad_filter=False, beam_size=5)
    words = []
    for s in segs:
        for w in s.words or []:
            f = fold(w.word)
            if f:
                words.append((float(w.start), float(w.end), f))
        print(f"progress {min(0.99, s.end / max(1.0, info.duration)):.3f}", file=sys.stderr, flush=True)
    return words


def align(lines, words):
    """Global alignment (Needleman-Wunsch) of lyric words to heard words; returns start time per line."""
    def sung(text):
        # Ad-libs in parentheses are often not heard; keep them only when the whole line is an ad-lib.
        bare = re.sub(r"\([^)]*\)", " ", text)
        return (bare if fold(bare) else text.replace("(", " ").replace(")", " ")).split()

    lw = [(li, fold(w)) for li, text in enumerate(lines) for w in sung(text) if fold(w)]
    lw_raw = [w for li, text in enumerate(lines) for w in sung(text) if fold(w)]
    n, m = len(lw), len(words)
    GAP = -0.45
    score = np.zeros((n + 1, m + 1), np.float32)
    move = np.zeros((n + 1, m + 1), np.int8)  # 0 diag, 1 skip lyric, 2 skip heard
    score[1:, 0] = GAP * np.arange(1, n + 1)
    score[0, 1:] = GAP * 0.4 * np.arange(1, m + 1)  # ad-libs and mishears are common: cheap to skip heard words
    move[1:, 0] = 1
    move[0, 1:] = 2
    for i in range(1, n + 1):
        a = lw[i - 1][1]
        for j in range(1, m + 1):
            s = sim(a, words[j - 1][2])
            d = score[i - 1, j - 1] + (s * 2 - 0.8)
            u = score[i - 1, j] + GAP
            l = score[i, j - 1] + GAP * 0.4
            if d >= u and d >= l:
                score[i, j], move[i, j] = d, 0
            elif u >= l:
                score[i, j], move[i, j] = u, 1
            else:
                score[i, j], move[i, j] = l, 2
    hit = {}
    i, j = n, m
    while i > 0 and j > 0:
        mv = move[i, j]
        if mv == 0:
            if sim(lw[i - 1][1], words[j - 1][2]) >= 0.5:
                hit[i - 1] = j - 1
            i, j = i - 1, j - 1
        elif mv == 1:
            i -= 1
        else:
            j -= 1
    starts, matched = [], []
    for li in range(len(lines)):
        idx = [k for k, (l, _) in enumerate(lw) if l == li]
        used = set(hit.values())
        t = None
        for p, k in enumerate(idx):
            if k not in hit:
                continue
            j = hit[k]
            t = words[j][0]
            # Misheard opening words: the unmatched heard words right before the first hit belong to this line.
            q = j - 1
            while p > 0 and q >= 0 and q not in used and j - q <= p and t - words[q][0] < 2.5:
                t = words[q][0]
                q -= 1
            if t == words[j][0] and p > 0:
                t -= 0.35 * p
            break
        starts.append(t)
        matched.append(sum(1 for k in idx if k in hit) / max(1, len(idx)))
    # Lines with no matched word: interpolate between neighbours.
    for li, t in enumerate(starts):
        if t is None:
            prev = next(((k, starts[k]) for k in range(li - 1, -1, -1) if starts[k] is not None), None)
            nxt = next(((k, starts[k]) for k in range(li + 1, len(starts)) if starts[k] is not None), None)
            if prev and nxt:
                starts[li] = prev[1] + (nxt[1] - prev[1]) * (li - prev[0]) / (nxt[0] - prev[0])
            elif prev:
                starts[li] = prev[1] + 3.5 * (li - prev[0])
            elif nxt:
                starts[li] = max(0.0, nxt[1] - 3.5 * (nxt[0] - li))
            else:
                starts[li] = 0.0
    for li in range(1, len(starts)):
        starts[li] = max(starts[li], starts[li - 1] + 0.3)
    # Per line, the sung words that were heard, with Whisper's start/end (held notes come from these).
    per_line = [[] for _ in lines]
    for k, (li, _) in enumerate(lw):
        if k in hit:
            j = hit[k]
            per_line[li].append({"w": lw_raw[k], "s": round(words[j][0], 2), "e": round(words[j][1], 2)})
    return starts, matched, per_line


def stamp(t: float) -> str:
    t = max(0.0, t)
    return f"[{int(t // 60):02d}:{t % 60:05.2f}]"


def write_words(path: str, lines, starts, per_line):
    data = {"lines": [{"t": round(starts[i], 2), "text": lines[i], "words": per_line[i]} for i in range(len(lines))]}
    open(path, "w", encoding="utf-8").write(json.dumps(data, ensure_ascii=False) + "\n")


def words_only():
    audio_path, lrc_path, out_path = sys.argv[2:5]
    model_name = sys.argv[5] if len(sys.argv) > 5 else "medium"
    lines, starts = [], []
    for l in open(lrc_path, encoding="utf-8").read().splitlines():
        m = re.match(r"^\s*\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$", l)
        if m and m.group(3).strip() and not re.match(r"^\[[^\]]+\]$", m.group(3).strip()):
            lines.append(m.group(3).strip())
            starts.append(int(m.group(1)) * 60 + float(m.group(2)))
    words = transcribe(load_audio(audio_path), model_name)
    _, matched, per_line = align(lines, words)
    write_words(out_path, lines, starts, per_line)
    print(json.dumps({"lines": len(lines), "heardWords": len(words), "timedWords": sum(len(p) for p in per_line)}, ensure_ascii=False))


def main():
    if sys.argv[1] == "--words":
        return words_only()
    audio_path, lyrics_path, out_path = sys.argv[1:4]
    model_name = sys.argv[4] if len(sys.argv) > 4 else "medium"
    raw = [l.rstrip() for l in open(lyrics_path, encoding="utf-8").read().splitlines()]
    entries = []  # ("header", text) | ("line", text)
    for l in raw:
        s = l.strip()
        if not s:
            continue
        if re.match(r"^\[[^\]]+\]$", s) and not re.match(r"^\[\d", s):
            entries.append(("header", s))
        else:
            entries.append(("line", s))
    lines = [t for k, t in entries if k == "line"]
    words = transcribe(load_audio(audio_path), model_name)
    starts, matched, per_line = align(lines, words)
    write_words(re.sub(r"\.lrc$", "", out_path) + ".words.json", lines, starts, per_line)
    out, li = [], 0
    for k, t in entries:
        if k == "header":
            out.append(t)
        else:
            out.append(f"{stamp(starts[li])} {t}")
            li += 1
    end = (words[-1][1] + 1.0) if words else (starts[-1] + 4 if starts else 0)
    out.append(stamp(end))
    open(out_path, "w", encoding="utf-8").write("\n".join(out) + "\n")
    weak = [lines[i] for i, m in enumerate(matched) if m < 0.34]
    print(json.dumps({"lines": len(lines), "heardWords": len(words), "weakLines": weak[:20]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
