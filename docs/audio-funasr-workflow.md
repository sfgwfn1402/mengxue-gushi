# 音频校验与时间轴工作流（FunASR）

用于修复/替换古诗真人朗读音频，避免手工凭感觉切音频导致“音频和诗句高亮对不上”。

## 原则

- 整首官方朗读：`audios/poem-{id}.mp3`
- 逐句跟读音频：`line-audios/poem-{id}-line-{n}.mp3`
- 小程序时间轴：
  - `data/poem-line-timings.js`：整首官方朗读的每句起止时间，用于播放高亮。
  - `data/poem-line-audios.js/json`：逐句跟读音频路径与时间。
  - `data/poem-line-audio-durations.js`：逐句音频时长。
- 生产资源必须通过 MinIO/S3 API 上传，不要直接 `cp` 到 MinIO 磁盘目录。
- 修改音频后要给 URL 加版本参数，绕过小程序 `audioCache` 本地缓存。

## FunASR 环境

建议使用独立虚拟环境：

```bash
python3 -m venv /tmp/funasr-venv
source /tmp/funasr-venv/bin/activate
python -m pip install --upgrade pip
pip install funasr modelscope torch torchaudio
```

需要 `ffmpeg`：

```bash
brew install ffmpeg
```

## 单首修复流程

例如修复 `id=33` 的《四时田园杂兴》：

```bash
cd /Users/duwei/workspace/mengxue-gushi
source /tmp/funasr-venv/bin/activate
python3 scripts/funasr_poem_audio_tool.py \
  --poem-id 33 \
  --input "/Users/duwei/Downloads/四时田园杂兴/四时田园杂兴.mp3" \
  --version 20260620-real-v3
```

脚本职责：

1. 从小程序诗库读取诗句。
2. 用 FunASR 识别音频，输出识别文本和时间戳。
3. 将识别文本和诗句做匹配，估算每句起止时间。
4. 导出整首 `audios/poem-{id}.mp3`。
5. 导出逐句 `line-audios/poem-{id}-line-{n}.mp3`。
6. 更新小程序数据文件：
   - `data/poem-line-timings.js`
   - `data/poem-line-audios.js`
   - `data/poem-line-audios.json`
   - `data/poem-line-audio-durations.js`
7. 更新音频版本参数，绕过缓存。
8. 生成 manifest 供人工复核。

## 人工复核

脚本生成后必须检查：

```bash
ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 audios/poem-33.mp3
ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 line-audios/poem-33-line-*.mp3
node --check data/poem-line-timings.js
node --check data/poem-line-audios.js
python3 -m json.tool data/poem-line-audios.json >/dev/null
```

## 生产上传

上传必须使用 MinIO/S3 API。直接复制到 `/opt/minio/data/...` 不可靠。

上传后验证：

```bash
curl -sL -o /tmp/prod-poem.mp3 'https://www.duwei.cloud/audios/poem-33.mp3?v=版本号'
shasum -a 256 audios/poem-33.mp3 /tmp/prod-poem.mp3
```

两行 sha256 必须一致。
