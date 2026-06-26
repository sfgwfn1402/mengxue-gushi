#!/usr/bin/env python3
"""
FunASR 朗诵评分服务（自建、免费、字准确率）。

功能：
- 接收一段儿童朗诵音频 + 期望诗句，用 FunASR 识别成文字，
  与诗文逐字比对，给出总分、逐句对错、逐字命中。
- 只评"读对了哪些字/哪句错"，不评发音标准度（那需要讯飞等付费评测）。

两种运行方式：
1. 自测评分算法（不需要 FunASR，纯逻辑）：
   python3 scripts/funasr_score_service.py --selftest
2. 起 HTTP 服务（需要 FunASR 环境）：
   python3 scripts/funasr_score_service.py --serve --port 8181
   POST /score  body: { "expected": "床前明月光，疑是地上霜。", "audio_base64": "..." , "ext": "mp3" }
   或  body: { "expected": "...", "audio_path": "/abs/path.mp3" }

后端（Rust）拿到小程序上传的录音后，转调本服务 /score 即可。
"""
from __future__ import annotations

import argparse
import base64
import gc
import json
import re
import sys
import tempfile
import threading
import time
from difflib import SequenceMatcher
from pathlib import Path

# 空闲多久卸载模型把内存还给生产栈（秒）
IDLE_UNLOAD_SECONDS = 600

PUNCT_RE = re.compile(r"[\s，。！？、；：,.!?;:《》（）()\[\]【】'\"“”‘’·—\-]")
LINE_SPLIT_RE = re.compile(r"(?<=[，。！？；])")

# 逐句判定"读对了"的命中阈值
LINE_OK_RATIO = 0.8


def normalize(text: str) -> str:
    return PUNCT_RE.sub("", text or "")


def split_lines(content: str) -> list[str]:
    parts = LINE_SPLIT_RE.split(content or "")
    return [p for p in (x.strip() for x in parts) if p]


def char_flags(expected_norm: str, recognized_norm: str) -> list[bool]:
    """逐字标记 expected 中哪些字在识别结果里按序命中。"""
    flags = [False] * len(expected_norm)
    sm = SequenceMatcher(None, expected_norm, recognized_norm, autojunk=False)
    for tag, i1, i2, _j1, _j2 in sm.get_opcodes():
        if tag == "equal":
            for i in range(i1, i2):
                flags[i] = True
    return flags


def score_recitation(expected: str, recognized: str) -> dict:
    """核心评分：期望诗文 vs 识别文本 -> 总分 + 逐句 + 逐字。纯逻辑、可单测。"""
    lines = split_lines(expected)
    exp_norm = "".join(normalize(l) for l in lines)
    rec_norm = normalize(recognized)
    flags = char_flags(exp_norm, rec_norm)

    matched = sum(1 for f in flags if f)
    total = len(exp_norm)
    overall = round(100 * matched / total) if total else 0

    line_results = []
    idx = 0
    for l in lines:
        ln = normalize(l)
        n = len(ln)
        lf = flags[idx:idx + n]
        idx += n
        correct = sum(1 for f in lf if f)
        line_results.append({
            "text": l,
            "total": n,
            "correct": correct,
            "ok": n > 0 and (correct / n) >= LINE_OK_RATIO,
            "chars": [{"c": c, "ok": bool(f)} for c, f in zip(ln, lf)],
        })

    return {
        "score": overall,
        "matched": matched,
        "total": total,
        "recognized": recognized,
        "lines": line_results,
    }


# ---------------- FunASR 识别（复用 funasr_poem_audio_tool 的套路） ----------------

_MODEL = None
_LAST_USED = 0.0
_LOCK = threading.Lock()  # 保证加载/卸载/推理互斥，避免空闲清理线程在推理中途卸载模型


def get_model():
    """懒加载：第一次用时加载；短朗诵不需要 VAD 分块/标点模型，只加载主模型省内存。"""
    global _MODEL, _LAST_USED
    if _MODEL is None:
        try:
            from funasr import AutoModel
        except Exception as exc:  # noqa
            raise RuntimeError(
                "FunASR 不可用，请在服务机执行：pip install funasr modelscope torch torchaudio"
                f"（原始错误：{exc}）"
            )
        print("加载 FunASR 模型...", flush=True)
        _MODEL = AutoModel(model="paraformer-zh", disable_update=True, log_level="ERROR")
        print("FunASR 模型已就绪", flush=True)
    _LAST_USED = time.time()
    return _MODEL


def unload_model():
    """卸载模型，把内存还给生产栈（模型文件仍在硬盘，下次秒级从盘加载，不重下）。"""
    global _MODEL
    if _MODEL is not None:
        _MODEL = None
        gc.collect()
        try:
            import torch
            if hasattr(torch, "cuda") and torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:  # noqa
            pass
        print("空闲超时，已卸载 FunASR 模型，内存归还生产栈", flush=True)


def _idle_janitor():
    """后台线程：空闲超过 IDLE_UNLOAD_SECONDS 就卸载模型。"""
    while True:
        time.sleep(30)
        with _LOCK:
            if _MODEL is not None and (time.time() - _LAST_USED) > IDLE_UNLOAD_SECONDS:
                unload_model()


def recognize(audio_path: str) -> str:
    model = get_model()
    res = model.generate(input=str(audio_path), batch_size_s=300)
    item = res[0] if isinstance(res, list) and res else (res if isinstance(res, dict) else {})
    return item.get("text") or item.get("raw_text") or ""


def score_audio(expected: str, audio_path: str) -> dict:
    with _LOCK:  # 与空闲清理线程互斥，推理期间不会被卸载
        recognized = recognize(audio_path)
    return score_recitation(expected, recognized)


# ---------------- HTTP 服务（stdlib，无额外依赖） ----------------

def serve(port: int):
    from http.server import BaseHTTPRequestHandler, HTTPServer

    class Handler(BaseHTTPRequestHandler):
        def _send(self, code, payload):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == "/health":
                self._send(200, {
                    "ok": True,
                    "model_loaded": _MODEL is not None,
                    "idle_seconds": round(time.time() - _LAST_USED, 1) if _LAST_USED else None,
                })
            else:
                self._send(404, {"error": "not found"})

        def do_POST(self):
            if self.path != "/score":
                self._send(404, {"error": "not found"})
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                req = json.loads(self.rfile.read(length) or b"{}")
                expected = req.get("expected") or ""
                if not expected:
                    self._send(400, {"error": "missing expected"})
                    return
                audio_path = req.get("audio_path")
                tmp = None
                if not audio_path:
                    b64 = req.get("audio_base64")
                    if not b64:
                        self._send(400, {"error": "missing audio"})
                        return
                    ext = req.get("ext", "mp3")
                    tmp = tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False)
                    tmp.write(base64.b64decode(b64))
                    tmp.flush()
                    audio_path = tmp.name
                result = score_audio(expected, audio_path)
                if tmp:
                    Path(tmp.name).unlink(missing_ok=True)
                self._send(200, result)
            except Exception as exc:  # noqa
                self._send(500, {"error": str(exc)})

        def log_message(self, *args):
            pass

    threading.Thread(target=_idle_janitor, daemon=True).start()
    # 只绑本机：同机 Rust 后端调用，不对公网暴露
    print(f"FunASR 评分服务启动: http://127.0.0.1:{port}  (POST /score, GET /health)；空闲 {IDLE_UNLOAD_SECONDS}s 自动卸载模型")
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()


# ---------------- 自测：验证评分算法（不需要 FunASR） ----------------

def selftest():
    expected = "床前明月光，疑是地上霜。举头望明月，低头思故乡。"
    cases = [
        ("全对", "床前明月光疑是地上霜举头望明月低头思故乡", 100),
        ("错一字", "床前明月光疑是地上霜举头望明月低头思故香", None),
        ("漏一句", "床前明月光疑是地上霜低头思故乡", None),
        ("空白", "", 0),
        ("带标点识别", "床前明月光，疑是地上霜，举头望明月，低头思故乡。", 100),
    ]
    ok = True
    for name, rec, expect_score in cases:
        r = score_recitation(expected, rec)
        line_marks = " ".join(("✅" if l["ok"] else "⚠️") + l["text"] for l in r["lines"])
        print(f"[{name}] 得分={r['score']}  命中{r['matched']}/{r['total']}")
        print(f"        {line_marks}")
        if expect_score is not None and r["score"] != expect_score:
            print(f"        ✗ 期望 {expect_score}，实得 {r['score']}")
            ok = False
    print("自测结果:", "✅ 全部通过" if ok else "✗ 有用例不符")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true", help="只跑评分算法自测，不需要 FunASR")
    ap.add_argument("--serve", action="store_true", help="启动 HTTP 评分服务（需要 FunASR）")
    ap.add_argument("--port", type=int, default=8181)
    ap.add_argument("--expected", help="命令行单次评分：期望诗文")
    ap.add_argument("--audio", help="命令行单次评分：音频路径")
    args = ap.parse_args()

    if args.selftest:
        return selftest()
    if args.serve:
        serve(args.port)
        return 0
    if args.expected and args.audio:
        print(json.dumps(score_audio(args.expected, args.audio), ensure_ascii=False, indent=2))
        return 0
    ap.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
