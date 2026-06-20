# 萌学古诗音频维护流程

> 重要原则：朗读音频和跟读切片音频是两套资源，不能混用、不能互相兜底。修音频优先使用 FunASR 工具生成/校验时间轴，不要手工凭静音点猜切片。当前生产公网统一走 `https://www.duwei.cloud`，由 Nginx 反代 MinIO。

## 1. 音频类型与路径约定

### 1.1 朗读音频（整首诗）

用途：学习页“朗读/播放整首诗”。

- MinIO bucket：`mengxue-gushi`
- MinIO 对象目录：`audios-id/`
- 文件名：`poem-{id}.mp3`
- 生产访问地址：

```text
https://www.duwei.cloud/audios/poem-{id}.mp3
```

代码入口：

- `utils/tts.js`
- `pages/learn/learn.js` 中整首朗读相关逻辑

维护规则：

- 处理跟读问题时，不要修改朗读音频路径。
- 不要用朗读整首音频给跟读单句兜底。
- 不要把跟读切片上传到 `audios-id/`。

### 1.2 跟读音频（单句切片）

用途：学习页“一句一句跟读”。

- MinIO bucket：`mengxue-gushi`
- MinIO 对象目录：`line-audios/`
- 文件名：`poem-{id}-line-{n}.mp3`，`n` 从 1 开始
- 生产访问地址：

```text
https://www.duwei.cloud/line-audios/poem-{id}-line-{n}.mp3
```

代码入口：

- `data/poem-line-timings.js`：每首诗逐句时间轴
- `data/poem-line-audios.js`：跟读单句音频索引
- `data/poem-line-audio-durations.js`：每个单句 mp3 的真实时长
- `pages/learn/learn.js`：跟读播放逻辑

维护规则：

- 跟读只播放 `line-audios/` 下的单句 mp3。
- 没有切片时，提示“跟读音频准备中”，不要回退到整首朗读。
- 跟读播放等待时间应基于真实 mp3 时长，不要使用固定 4 秒等硬编码截断。

## 2. 生成跟读切片

前提：`data/poem-line-timings.js` 已有每句的 `start` / `end` 时间点，MinIO 中已有整首朗读音频 `audios-id/poem-{id}.mp3`。

建议流程：

1. 从 MinIO IP 下载整首朗读音频到本地缓存目录，例如：

```bash
mkdir -p .cache/follow-full-audios
curl -L --fail \
  -o .cache/follow-full-audios/poem-1.mp3 \
  http://192.144.133.222:9000/mengxue-gushi/audios-id/poem-1.mp3
```

2. 用 `ffmpeg` 按时间轴切出单句音频，输出到项目内固定目录 `line-audios/`：

```bash
mkdir -p line-audios
ffmpeg -y -ss 0.000 -t 2.000 \
  -i .cache/follow-full-audios/poem-1.mp3 \
  -vn -acodec libmp3lame -q:a 4 \
  line-audios/poem-1-line-1.mp3
```

切片注意：

- 起点可少量提前，例如 `start - 0.04s`，避免吞开头。
- 终点应在 `end` 后保留尾音余量，例如 `+0.28s`。
- 但不能跨到下一句太多；如果下一句开始很近，应限制在 `next_start - 0.06s`。
- 切片产物必须保存到项目 `line-audios/`，不要只留在 `/tmp` 等临时目录。

## 3. 更新前端跟读索引

切片完成后，必须同步更新：

- `data/poem-line-audios.js`
- `data/poem-line-audios.json`
- `data/poem-line-audio-durations.js`

要求：

- `poem-line-audios.js` 中每句 URL 形如：

```js
url: "line-audios/poem-1-line-1.mp3"
```

- `poem-line-audio-durations.js` 中记录每个 mp3 的真实秒数，用于跟读播放等待，避免没读完就断。

可用 `ffprobe` 获取时长：

```bash
ffprobe -v error \
  -show_entries format=duration \
  -of default=nw=1:nk=1 \
  line-audios/poem-1-line-1.mp3
```

## 4. 上传跟读切片到 MinIO

上传目标必须是正式 MinIO bucket，不要只放临时目录。

推荐使用服务器容器里的 `mc`：

```bash
ssh ubuntu@192.144.133.222 \
  'sudo docker exec minio /bin/mc alias set local http://127.0.0.1:9000 minioadmin "Duwei118="'
```

上传前可清理旧切片目录：

```bash
ssh ubuntu@192.144.133.222 \
  'sudo docker exec minio /bin/mc rm --recursive --force local/mengxue-gushi/line-audios/'
```

上传流程示例：

```bash
ssh ubuntu@192.144.133.222 'rm -rf /tmp/line-audios-upload && mkdir -p /tmp/line-audios-upload'
rsync -az --include='*.mp3' --exclude='*' \
  line-audios/ \
  ubuntu@192.144.133.222:/tmp/line-audios-upload/
ssh ubuntu@192.144.133.222 \
  'sudo docker cp /tmp/line-audios-upload minio:/tmp/line-audios-upload-all && \
   sudo docker exec minio /bin/mc cp --recursive /tmp/line-audios-upload-all/ local/mengxue-gushi/line-audios/ && \
   rm -rf /tmp/line-audios-upload'
```

说明：这里 `/tmp` 只是上传中转，最终资源必须在 MinIO：

```text
local/mengxue-gushi/line-audios/
```

## 5. 必须做的验证

每次处理跟读音频后，必须验证三件事：

1. 前端索引数量正确。
2. 每个 MinIO IP URL 返回 `200`。
3. 每个切片真实时长不短于时间轴句子时长，避免没读完整句就断。

### 5.1 单个 URL 验证

```bash
curl -I \
  https://www.duwei.cloud/line-audios/poem-1-line-1.mp3
```

应看到：

```text
HTTP/1.1 200 OK
Content-Type: audio/mpeg
```

### 5.2 全量验证脚本思路

对 `data/poem-line-audios.js` 中每一句：

- 拼接 URL：

```text
https://www.duwei.cloud/{url}
```

- 用 `curl` 检查 HTTP 状态必须是 `200`。
- 用 `data/poem-line-audio-durations.js` 检查真实时长。
- 若 `duration + 0.05 < end - start`，判定为失败，需要重切。

当前最近一次完成状态：

```text
poems: 171
checked_lines: 739
duration_entries: 739
errors_count: 0
```

## 6. 禁止事项

- 禁止为了修跟读去改朗读音频路径。
- 禁止跟读缺少切片时回退播放整首朗读。
- 禁止把 IP/临时地址写入小程序正式逻辑；正式访问统一使用 `https://www.duwei.cloud`。
- 禁止只把音频放在 `/tmp`、`.cache` 等临时目录后就结束；临时文件只作中转，必须上传到生产 MinIO 并清理临时文件。
- 禁止固定 4 秒切换录音；长句会被截断。
- 禁止把单句切片放到 `audios-id/`，那是整首朗读目录。
