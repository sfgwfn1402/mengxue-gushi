# 萌学古诗 · 音频状态清单

> 记录每首诗的音频资源状态：整首朗读、逐句跟读、时间轴。
> 数据来源：`audios/`、`line-audios/`、`data/poem-line-audios.js`、`data/poem-line-timings.js`

---

## 总览

| 指标 | 数值 |
|---|---|
| 诗库总数 | **171** 首（level1: 58, level2: 76, level3: 37） |
| 有整首朗读 | **171** / 171 ✅ 全覆盖 |
| 有跟读索引 | **171** / 171 ✅ 全覆盖 |
| 有时间轴 | **171** / 171 ✅ 全覆盖 |
| 跟读切片文件总数 | **741** 个（`line-audios/`） |
| 整首朗读文件总数 | **171** 个（`audios/`） |

---

## 分级别统计

| 级别 | 范围 | 诗数 | 朗读 | 跟读 | 时间轴 |
|---|---|---|---|---|---|
| 启蒙 (level1) | ID 1-58 | 58 | ✅ | ✅ | ✅ |
| 进阶 (level2) | ID 59-134 | 76 | ✅ | ✅ | ✅ |
| 挑战 (level3) | ID 135-171 | 37 | ✅ | ✅ | ✅ |

---

## 音频访问路径

### 整首朗读
```
https://www.duwei.cloud/audios/poem-{id}.mp3
```
MinIO 目录：`mengxue-gushi/audios-id/`

### 逐句跟读
```
https://www.duwei.cloud/line-audios/poem-{id}-line-{n}.mp3
```
MinIO 目录：`mengxue-gushi/line-audios/`

### 本地文件
```
audios/poem-{id}.mp3          # 整首朗读
line-audios/poem-{id}-line-{n}.mp3  # 跟读切片
```

---

## 特殊音频版本

以下诗有硬编码的音频版本参数（`utils/tts.js`），用于在音频更新后绕过微信缓存：

| 诗 ID | 标题 | 音频 ID 别名 | 版本参数 | 说明 |
|---|---|---|---|---|
| 8 | 游子吟 | 74 | `20260621-full6` | 正文补齐为六句，复用 ID 74 完整六句音频 |
| 33 | 四时田园杂兴 | — | `20260621-real-guwendao-funasr-v9` | 真人朗读 + FunASR 时间轴 v9 |
| 38 | 琵琶行 | — | `20260621-pipaxing-bai-guwendao-p38_58_30` | 长诗节选音频 |
| 39 | 兵车行 | — | `20260621-bingchexing-excerpt-funasr-v4-tail` | 长诗节选音频 + FunASR v4 尾部修正 |

### 版本参数原理
- 音频 URL 后拼接 `?v={version}`
- 音频文件更新后改版本号 → 浏览器/微信不会用旧缓存
- 新诗上线时不需要版本参数，只有更新过的旧诗需要

---

## 音频资源生成工具

| 工具 | 用途 |
|---|---|
| `scripts/funasr_poem_audio_tool.py` | **主工具**：自动识别音频时间轴 + 生成跟读切片 |
| `scripts/generate-poem-audios.sh` | 批量生成音频（已过时，被 FunASR 工具替代） |
| `scripts/generate-poem-audios.js` | 生成整首朗读音频的索引 |
| `scripts/download-tang300-librivox.py` | 从 Librivox 下载古诗朗读（已过时） |

---

## 音频数据文件索引

| 文件 | 作用 | 条目数 |
|---|---|---|
| `data/poem-line-timings.js` | 逐句音频时间轴（JSON 格式）| 171 |
| `data/poem-line-audios.js` | 跟读音频 URL 索引 | 171 |
| `data/poem-line-audio-durations.js` | 跟读每句的录音时长限制 | 754 |

---

## 音频更新流程

当需要更新某首诗的朗读音频时，参见：
- [audio-workflow.md](audio-workflow.md) — 人工/真人朗读音频维护流程
- [audio-funasr-workflow.md](audio-funasr-workflow.md) — FunASR 自动识别时间轴流程

**核心硬规则**：
1. 整首朗读和跟读切片是两套独立资源，不混用，不互相兜底
2. 修音频优先用 FunASR 工具链，不要手工 `ffmpeg -ss/-to`
3. 更新后用 `?v={new_version}` 绕缓存
4. 上传 MinIO 后需验证 HTTPS URL 可访问
