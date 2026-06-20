# 🎓 萌学古诗 - 微信小程序

一个面向儿童的古诗启蒙小程序，重点是“多读、多听、多探索”。

## 当前内容

- **100 首古诗**：启蒙 / 进阶 / 挑战 三级分层
- **12 个成语故事**：适合低龄孩子理解
- **本地朗读音频**：已内置前 50 首 MP3，后续可继续生成
- **古诗仓库**：按难度、季节、关键词、主题标签搜索
- **学习详情**：原文、拼音、诗意、故事、收藏、朗读
- **挑战激励**：每日任务、星星、等级、学习进度

## 项目结构

```
mengxue-gushi/
├── app.js                         # 全局初始化，统一加载古诗数据
├── app.json                       # 小程序页面与 tab 配置
├── data/
│   ├── poems-level1.json          # 启蒙级古诗
│   ├── poems-level2.json          # 进阶级古诗
│   ├── poems-level3.json          # 挑战级古诗
│   └── index.json                 # 数据索引
├── utils/
│   ├── poems.js                   # 合并、标准化古诗数据
│   └── tts.js                     # 本地音频路径与存在性检查
├── pages/
│   ├── index/                     # 首页：今日一诗、分级入口、主题探索
│   ├── warehouse/                 # 古诗仓库：100 首列表、搜索筛选
│   ├── learn/                     # 学习详情页
│   ├── quiz/                      # 答题练习
│   ├── challenge/                 # 每日挑战
│   └── profile/                   # 个人中心
├── audios/                        # 本地诗词朗读 MP3
└── scripts/                       # 音频生成/下载脚本
```

## 快速开始

1. 打开微信开发者工具
2. 导入 `mengxue-gushi` 文件夹
3. 使用测试号或配置自己的 AppID
4. 点击“编译 / 预览”查看效果

## 内容维护

新增古诗时，优先放到对应分级文件：

- `data/poems-level1.json`：短小、画面直观、适合启蒙
- `data/poems-level2.json`：意象稍复杂、适合小学中段
- `data/poems-level3.json`：长诗、家国、哲理、历史类挑战内容

每首诗建议包含：

```json
{
  "id": 101,
  "title": "诗名",
  "author": "作者",
  "dynasty": "朝代",
  "content": "原文",
  "pinyin": "拼音，可暂空",
  "translation": "儿童可理解的诗意",
  "story": "背景或小故事",
  "difficulty": 1,
  "tags": ["春天", "儿童"],
  "season": "spring",
  "videoAvailable": false,
  "cardUnlocked": false
}
```

## 音频维护

朗读音频和跟读切片音频是两套资源，不能混用。当前联调阶段远程音频统一使用 MinIO IP，不使用域名。

- 朗读整首音频：`mengxue-gushi/audios-id/poem-{id}.mp3`
- 跟读单句音频：`mengxue-gushi/line-audios/poem-{id}-line-{n}.mp3`
- 详细生成、上传、验证流程见：[`docs/audio-workflow.md`](docs/audio-workflow.md)
- FunASR 音频识别与时间轴流程见：[`docs/audio-funasr-workflow.md`](docs/audio-funasr-workflow.md)

处理跟读问题时，不要修改朗读音频链路；跟读切片必须上传到 MinIO，并全量验证 URL 200 和切片时长。

## 后续建议

- 继续为第 51-100 首补齐真人/儿童友好朗读音频
- 给主题探索增加更多入口：动物、节日、亲情、送别、山水
- 增加“背诵模式”：逐句遮挡、提示首字、跟读打卡
- 增加“家长模式”：学习时长、已学诗词、复习提醒
