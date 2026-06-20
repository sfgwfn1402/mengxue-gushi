#!/usr/bin/env python3
"""
FunASR 古诗音频处理工具。

用途：
- 验证真人朗读音频是否匹配诗文。
- 基于 FunASR 时间戳估算每句起止时间。
- 导出整首朗读和逐句跟读音频。
- 更新小程序数据文件。

示例：
  source /tmp/funasr-venv/bin/activate
  python3 scripts/funasr_poem_audio_tool.py \
    --poem-id 33 \
    --input "/Users/duwei/Downloads/四时田园杂兴/四时田园杂兴.mp3" \
    --version 20260620-real-v3
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
AUDIO_DIR = ROOT / "audios"
LINE_AUDIO_DIR = ROOT / "line-audios"
TMP_DIR = Path("/tmp/mengxue-funasr")

PUNCT_RE = re.compile(r"[\s，。！？、；：,.!?;:《》（）()\[\]【】'\"“”‘’·-]")


def run(cmd: list[str]) -> None:
    print("+", " ".join(map(str, cmd)))
    subprocess.run(cmd, check=True)


def capture(cmd: list[str]) -> str:
    return subprocess.check_output(cmd, text=True).strip()


def normalize(text: str) -> str:
    return PUNCT_RE.sub("", text or "")


def load_poem(poem_id: int) -> dict:
    for name in ["poems-level1.json", "poems-level2.json", "poems-level3.json"]:
        path = DATA_DIR / name
        if not path.exists():
            continue
        data = json.loads(path.read_text())
        for poem in data.get("poems", []):
            if int(poem.get("id", -1)) == poem_id:
                return poem
    raise SystemExit(f"poem id not found: {poem_id}")


def split_poem_lines(content: str) -> list[str]:
    # 古诗前端按逗号/句号分行展示，不能只按句号切；
    # 例如“昼出耘田夜绩麻，村庄儿女各当家。”需要切成两行。
    parts = re.split(r"(?<=[，。！？；])", content)
    return [p for p in (x.strip() for x in parts) if p]


def ensure_funasr():
    try:
        from funasr import AutoModel  # noqa
        return AutoModel
    except Exception as exc:
        raise SystemExit(
            "FunASR 不可用。请先执行：\n"
            "python3 -m venv /tmp/funasr-venv\n"
            "source /tmp/funasr-venv/bin/activate\n"
            "python -m pip install --upgrade pip\n"
            "pip install funasr modelscope torch torchaudio\n"
            f"\n原始错误：{exc}"
        )


def recognize(input_path: Path) -> dict:
    AutoModel = ensure_funasr()
    print("加载 FunASR 模型，首次运行会下载模型...")
    model = AutoModel(model="paraformer-zh", vad_model="fsmn-vad", punc_model="ct-punc")
    res = model.generate(input=str(input_path), batch_size_s=300)
    if isinstance(res, list) and res:
        return res[0]
    if isinstance(res, dict):
        return res
    raise SystemExit(f"unexpected FunASR result: {res!r}")


def token_times(asr: dict) -> list[dict]:
    raw_text = asr.get("raw_text") or asr.get("text") or ""
    text = asr.get("text") or raw_text
    timestamps = asr.get("timestamp") or []
    # FunASR 可能 raw_text 用空格分词；若数量对不上，则退化成 text 字符级均分。
    tokens = [t for t in raw_text.split() if t.strip()]
    if not tokens or len(tokens) != len(timestamps):
        chars = list(normalize(text))
        if timestamps and len(timestamps) == len(chars):
            tokens = chars
        else:
            return []
    out = []
    for tok, ts in zip(tokens, timestamps):
        if not ts or len(ts) < 2:
            continue
        out.append({"text": normalize(tok), "start": ts[0] / 1000, "end": ts[1] / 1000})
    return [x for x in out if x["text"]]


def estimate_line_ranges(tokens: list[dict], lines: list[str]) -> list[dict]:
    if not tokens:
        raise SystemExit("FunASR 没有可用 timestamp，无法自动估算切点")
    token_text = "".join(t["text"] for t in tokens)
    ranges = []
    search_from = 0
    for idx, line in enumerate(lines):
        target = normalize(line)
        pos = token_text.find(target, search_from)
        if pos < 0:
            # 模糊匹配窗口，给出最像的位置。
            best = (-1, 0)
            for start in range(max(0, search_from - 20), max(1, len(token_text) - len(target) + 1)):
                ratio = SequenceMatcher(None, target, token_text[start:start + len(target)]).ratio()
                if ratio > best[1]:
                    best = (start, ratio)
            if best[1] < 0.65:
                raise SystemExit(f"无法匹配第 {idx+1} 句：{line}；识别文本：{token_text}")
            pos = best[0]
        end_pos = pos + len(target)
        # 字符位置 -> token index
        cur = 0
        start_token = end_token = None
        for ti, tok in enumerate(tokens):
            nxt = cur + len(tok["text"])
            if start_token is None and pos < nxt:
                start_token = ti
            if end_pos <= nxt:
                end_token = ti
                break
            cur = nxt
        if start_token is None or end_token is None:
            raise SystemExit(f"无法换算第 {idx+1} 句 token 范围")
        start = max(0, tokens[start_token]["start"] - 0.08)
        end = tokens[end_token]["end"] + 0.18
        ranges.append({"index": idx, "text": line, "start": round(start, 3), "end": round(end, 3), "match_start": pos, "match_end": end_pos})
        search_from = end_pos
    return ranges


def ffmpeg_export(input_path: Path, ranges: list[dict], poem_id: int, gap: float) -> list[dict]:
    AUDIO_DIR.mkdir(exist_ok=True)
    LINE_AUDIO_DIR.mkdir(exist_ok=True)
    TMP_DIR.mkdir(exist_ok=True)
    exported = []
    for item in ranges:
        n = item["index"] + 1
        out = LINE_AUDIO_DIR / f"poem-{poem_id}-line-{n}.mp3"
        dur = max(0.2, item["end"] - item["start"])
        run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(item["start"]), "-t", str(dur), "-i", str(input_path), "-ar", "16000", "-ac", "1", "-b:a", "48k", str(out)])
        duration = float(capture(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", str(out)]))
        item = {**item, "file": str(out.relative_to(ROOT)), "duration": round(duration, 3)}
        exported.append(item)

    silence = TMP_DIR / f"silence-{gap}.mp3"
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", str(gap), "-q:a", "9", "-acodec", "libmp3lame", str(silence)])
    concat = TMP_DIR / f"poem-{poem_id}-concat.txt"
    lines = []
    absolute = []
    cursor = 0.0
    for i, item in enumerate(exported):
        lines.append(f"file '{ROOT / item['file']}'")
        start = cursor
        end = start + item["duration"]
        absolute.append({**item, "full_start": round(start, 3), "full_end": round(end, 3)})
        cursor = end
        if i < len(exported) - 1:
            lines.append(f"file '{silence}'")
            cursor += gap
    concat.write_text("\n".join(lines) + "\n")
    whole = AUDIO_DIR / f"poem-{poem_id}.mp3"
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(concat), "-ar", "16000", "-ac", "1", "-b:a", "48k", str(whole)])
    whole_duration = float(capture(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", str(whole)]))
    return absolute, round(whole_duration, 3)


def write_manifest(poem: dict, asr: dict, ranges: list[dict], whole_duration: float, version: str) -> Path:
    out_dir = ROOT / "tmp" / "funasr"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"poem-{poem['id']}-manifest.json"
    manifest = {
        "poem_id": poem["id"],
        "title": poem["title"],
        "author": poem.get("author"),
        "content": poem.get("content"),
        "recognized_text": asr.get("text"),
        "raw_text": asr.get("raw_text"),
        "version": version,
        "whole_audio": f"audios/poem-{poem['id']}.mp3",
        "whole_duration": whole_duration,
        "lines": ranges,
    }
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--poem-id", type=int, required=True)
    ap.add_argument("--input", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--gap", type=float, default=0.45, help="拼接整首音频时句间静音秒数")
    args = ap.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        raise SystemExit(f"input not found: {input_path}")
    poem = load_poem(args.poem_id)
    lines = split_poem_lines(poem["content"])
    print(f"处理 poem-{args.poem_id}: {poem['title']} / {len(lines)} lines")
    asr = recognize(input_path)
    print("识别文本：", asr.get("text") or asr.get("raw_text"))
    tokens = token_times(asr)
    ranges = estimate_line_ranges(tokens, lines)
    for r in ranges:
        print(f"line {r['index']+1}: {r['start']} - {r['end']} {r['text']}")
    ranges, whole_duration = ffmpeg_export(input_path, ranges, args.poem_id, args.gap)
    manifest = write_manifest(poem, asr, ranges, whole_duration, args.version)
    print(f"manifest: {manifest}")
    print("下一步：人工听一遍逐句音频；确认后再更新数据文件和上传生产。")


if __name__ == "__main__":
    main()
