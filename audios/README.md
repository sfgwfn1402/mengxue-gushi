# 古诗朗读音频

小程序按 **`/audios/poem-{id}.mp3`** 播放（见 `utils/tts.js`），`id` 与 `data/poems-level*.json` 一致。

## 当前状态

| 范围 | 文件 | 说明 |
|------|------|------|
| 本项目 **50 首** | `poem-1.mp3` … `poem-50.mp3` | 已就绪，可直接用 |
| 《唐诗三百首》全集 ~313 首 | `tang300-librivox/` | 需自行下载（见下） |

## 重新生成 50 首（本机语音，无需联网）

```bash
./scripts/generate-poem-audios.sh
```

输出为 **24kbps 单声道** MP3（约 1.6MB 合计），以满足微信小程序主包 **2MB** 预览上限。

## 唐诗三百首全集（网上，可选）

```bash
python3 scripts/download-tang300-librivox.py
```

需能访问 archive.org。与小程序 50 首 **编号不对应**，仅作资料库。
