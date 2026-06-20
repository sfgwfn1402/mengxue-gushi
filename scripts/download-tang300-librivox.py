#!/usr/bin/env python3
"""
从 LibriVox / Internet Archive 下载《唐诗三百首》公有领域 MP3（仅 Mandarin 朗读）。

来源：https://librivox.org/group/342
许可：Public Domain（LibriVox 志愿者朗读，非夏青版）

若 archive.org 连接超时，请使用可访问该站的网络（如 VPN）后重试。
"""
from __future__ import annotations

import argparse
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import unquote, urlparse

# LibriVox RSS id -> 卷次
VOLUMES = {
    1: 441,
    2: 584,
    3: 1266,
    4: None,  # 见下方 FALLBACK_RSS
}

# 卷四页面未在 group 列表暴露稳定 rss id，用 archive 标识检索
FALLBACK_RSS_BY_ARCHIVE = {
    "tangpoems4_1207_librivox": None,
}

ARCHIVE_BASE = "https://archive.org/download"
USER_AGENT = "mengxue-gushi/1.0 (librivox downloader)"


def fetch(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def parse_rss_mandarin_mp3(rss_xml: bytes) -> list[tuple[str, str]]:
    root = ET.fromstring(rss_xml)
    items: list[tuple[str, str]] = []
    for item in root.findall("./channel/item"):
        title_el = item.find("title")
        title = (title_el.text or "") if title_el is not None else ""
        if "Mandarin" not in title:
            continue
        url = None
        enc = item.find("enclosure")
        if enc is not None and enc.get("url"):
            url = enc.get("url")
        if not url:
            media = item.find("{http://search.yahoo.com/mrss/}content")
            if media is not None and media.get("url"):
                url = media.get("url")
        if url and url.endswith(".mp3"):
            items.append((title, url))
    return items


def safe_filename(title: str, url: str) -> str:
    base = Path(unquote(urlparse(url).path)).name
    if base.endswith(".mp3"):
        return base
    slug = re.sub(r"[^\w\u4e00-\u9fff]+", "_", title).strip("_")[:80]
    return f"{slug}.mp3"


def download_file(url: str, dest: Path, retries: int = 3) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        print(f"  skip {dest.name}")
        return
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            print(f"  get {dest.name} (try {attempt})")
            data = fetch(url)
            dest.write_bytes(data)
            return
        except Exception as e:
            last_err = e
            time.sleep(2 * attempt)
    raise RuntimeError(f"下载失败 {url}: {last_err}") from last_err


def download_volume(vol: int, rss_id: int, out_dir: Path) -> int:
    rss_url = f"https://librivox.org/rss/{rss_id}"
    print(f"\n卷 {vol}: {rss_url}")
    try:
        rss = fetch(rss_url, timeout=60)
    except Exception as e:
        print(f"  无法获取 RSS: {e}", file=sys.stderr)
        return 0
    items = parse_rss_mandarin_mp3(rss)
    vol_dir = out_dir / f"vol{vol}"
    count = 0
    for title, url in items:
        fname = safe_filename(title, url)
        try:
            download_file(url, vol_dir / fname)
            count += 1
        except Exception as e:
            print(f"  FAIL {fname}: {e}", file=sys.stderr)
    return count


def try_zip_fallback(out_dir: Path) -> None:
    """若单文件下载失败，可手动从 archive 页面下载 ZIP 后放入 out_dir。"""
    zips = [
        ("vol1", f"{ARCHIVE_BASE}/300_tang_poems_vol_1_librivox/300_tang_poems_vol_1_librivox_64kb_mp3.zip"),
        ("vol2", f"{ARCHIVE_BASE}/300_tang_poems_vol_2_librivox/300_tang_poems_vol_2_librivox_64kb_mp3.zip"),
        ("vol3", f"{ARCHIVE_BASE}/300_tang_poems_vol_3_librivox/300_tang_poems_vol_3_librivox_64kb_mp3.zip"),
        ("vol4", f"{ARCHIVE_BASE}/tangpoems4_1207_librivox/tangpoems4_1207_librivox_64kb_mp3.zip"),
    ]
    print("\n若 RSS 单集下载失败，可浏览器打开以下 ZIP（需能访问 archive.org）：")
    for label, url in zips:
        print(f"  {label}: {url}")


def main() -> int:
    parser = argparse.ArgumentParser(description="下载 LibriVox 唐诗三百首 MP3（Mandarin）")
    parser.add_argument(
        "-o",
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "audios" / "tang300-librivox",
    )
    parser.add_argument("--vol", type=int, choices=[1, 2, 3, 4], help="只下载指定卷")
    args = parser.parse_args()

    total = 0
    volumes = {args.vol: VOLUMES[args.vol]} if args.vol else VOLUMES
    for vol, rss_id in volumes.items():
        if rss_id is None:
            print(f"卷 {vol}: 请从 https://librivox.org/ 查找 RSS，或用手动 ZIP", file=sys.stderr)
            continue
        total += download_volume(vol, rss_id, args.out)

    try_zip_fallback(args.out)
    print(f"\n完成：共下载 {total} 个 Mandarin MP3 -> {args.out}")
    return 0 if total else 1


if __name__ == "__main__":
    raise SystemExit(main())
