# 萌学古诗 · 页面功能与路由

## 页面一览（17 个页面）

```text
pages/
├── index/                     # ⭐ 首页（Tab）
├── warehouse/                 # ⭐ 诗园（Tab）
├── create/                    # ⭐ 创作（Tab）
├── challenge/                 # ⭐ 诗光（Tab）
├── profile/                   # ⭐ 我的（Tab）
├── learn/                     # 学习详情页
├── follow-landscape/          # 跟读页
├── practice/                  # 练习页（入口）
├── quiz/                      # 答题页（古诗/成语选择题）
├── animation/                 # 诗歌动画
├── works/                     # 我的作品
├── work-detail/               # 作品详情
├── feedback/                  # 家长反馈
├── admin/                     # 管理后台入口
├── admin-feedback/            # 管理：反馈处理
├── admin-recitation-review/   # 管理：朗诵审核
└── admin-artwork-review/      # 管理：诗配画审核
```

---

## 1. 首页 `pages/index/index`

**Tab 栏入口。** 用户打开小程序后的默认页面。

### 功能区块
| 区块 | 说明 |
|---|---|
| 今日一诗 | 调用 `/api/home/today-poem`，展示推荐古诗 |
| 学习路径 | 4 个快捷入口：启蒙必背、跟读练习、春天的诗、小动物的诗 |
| 继续学习 | 展示上次学习的诗（本地缓存 `lastLearnPoem`） |
| 发现 Tab | 人气朗诵 + 诗配画瀑布流（调用 `/api/home/popular-recitations` + `/api/artworks`）|
| 推荐列表 | 调用 `/api/home/recommendations`，展示推荐诗词卡片 |

### 关键路由
- 点击诗句卡片 → `/pages/learn/learn?id={poemId}`
- 点击学习路径 → 诗园搜索对应分类
- 点击发现作品 → `/pages/work-detail/work-detail?id={id}&type=recitation`

---

## 2. 诗园 `pages/warehouse/warehouse`

**Tab 栏入口。** 100 首古诗的仓库，支持搜索和筛选。

### 功能
- **分级浏览**：启蒙（1-50）/进阶（51-80）/挑战（81-100），Tab 切换
- **搜索**：按标题、作者、朝代搜索
- **标签筛选**：季节（春/夏/秋/冬）+ 关键词（动物/思乡/山水 等）
- **收藏过滤**：只看收藏的诗
- **跟读入口**：每首诗点击可直接进入学习详情页或跟读页

### 数据来源
- 后端模式：`/api/poems`（带筛选参数）
- 后端不可用时：`data/poems-level{1,2,3}.js` 本地兜底

### 关键路由
- 点击诗卡 → `/pages/learn/learn?id={poemId}` 或 `/pages/follow-landscape/follow-landscape?id={poemId}`

---

## 3. 学习详情 `pages/learn/learn`

**核心页面。** 单首诗的完整学习界面。

### 功能区块
| 区块 | 说明 |
|---|---|
| 诗句展示 | 原文分句展示，播放时当前句高亮 |
| 拼音 | 逐字拼音标注（富文本） |
| 诗意 | 儿童可理解的白话翻译 |
| 故事 | 背景故事 |
| 官方朗读 | 整首播放，调用 `utils/tts.js` → Nginx → MinIO `audios-id/poem-{id}.mp3` |
| 逐句跟读 | 一句一句播放，跟着读，调用 `data/poem-line-audios.js` |
| 录音上传 | 用户朗诵录音 → `POST /api/poems/{id}/recitations` |
| 人气朗诵 | 听其他用户的朗诵作品 → `/api/poems/{id}/recitations/featured` |
| 诗配画 | 查看/创作诗配画 |
| 收藏 | `POST/DELETE /api/me/favorites/{poem_id}` |
| 学习进度 | `POST /api/me/progress/{poem_id}` |

### 音频资源
- 整首朗读：`https://www.duwei.cloud/audios/poem-{id}.mp3`
- 跟读单句：`https://www.duwei.cloud/line-audios/poem-{id}-line-{n}.mp3`
- 用户录音：`https://www.duwei.cloud/recitations/{file}`
- 音频管理器 `utils/audio-manager.js` 负责全局互斥

---

## 4. 跟读页 `pages/follow-landscape/follow-landscape`

**逐句跟读专用页面。** 专注于"听一句、读一句"的跟读练习。

### 功能
- 逐句播放音频 → 录音 → 继续下一句
- 跟读时间轴使用 `data/poem-line-timings.js`
- 跟读音频使用 `data/poem-line-audios.js`
- 跟读进度上报 `/api/me/progress/{poem_id}`
- 支持横屏模式（`pageOrientation: auto`）

### 关键路由
- 从诗园或学习页跳入：`?id={poemId}`

---

## 5. 练习页 `pages/practice/practice`

**练习活动入口。** 展示学习统计和练习入口。

### 功能
- 学习统计：已学古诗数、成语数、连续学习天数
- 古诗选择题入口 → `/pages/quiz/quiz?mode=poem`
- 成语选择题入口 → `/pages/quiz/quiz?mode=idiom`
- 跟读练习入口 → `/pages/follow-landscape/follow-landscape`

---

## 6. 答题页 `pages/quiz/quiz`

**古诗/成语选择题闯关。**

### 功能
- 支持古诗题（`mode=poem`）和成语题（`mode=idiom`）
- 5 道选择题：题干（上句猜下句/诗意理解/作者辨识），4 个选项
- 答对 3 题（passScore=3）通过
- 通过后自动上报任务完成 `POST /api/me/tasks`

---

## 7. 诗歌动画 `pages/animation/animation`

**古诗动画播放页。** 展示古诗配视频/动画。

### 功能
- 读取诗歌数据，如有 `videoAvailable` 则播放视频
- 诗卡配图展示
- 上下切换不同诗

---

## 8. 创作 `pages/create/create`

**Tab 栏入口。** 用户创作朗诵录音或诗配画。

### 功能
| Tab | 说明 |
|---|---|
| 朗诵 | 选择古诗 → 录音 → 上传 `POST /api/poems/{id}/recitations` |
| 诗配画 | 选择古诗 → 拍照/选图 → 上传 `POST /api/poems/{id}/artworks` |

### 上传产物
- 朗诵：mp3 录音 → MinIO `recitations/`，status = 'draft'
- 诗配画：jpg/png → MinIO `artworks/`，status = 'draft'
- 成功后仅保存到「我的作品」，默认不公开到「发现」

---

## 9. 作品管理 `pages/works/works`

**用户的作品集。** Tab 切换朗诵作品和诗配画。

### 功能
- 朗诵作品列表：`GET /api/me/recitations`
- 诗配画列表：`GET /api/artworks?mine=true`
- 作品状态标签：私有/待审核/已发布/未通过
- 作品操作菜单：删除、发布到发现、撤回公开
  - 发布：`POST /api/recitations/{id}/submit`
  - 撤回：`DELETE /api/recitations/{id}/submit`

### 关键路由
- 点击作品 → `/pages/work-detail/work-detail?id={id}&type=recitation`

---

## 10. 作品详情 `pages/work-detail/work-detail`

**朗诵/诗配画作品详情。**

### 功能
- 播放朗诵音频（`/api/recitations/{id}/audio`）
- 展示诗配画大图（`/api/artworks/{id}/image`）
- 点赞/取消点赞
- 分享作品（二维码：`/api/works/qrcode`）

---

## 11. 诗光 `pages/challenge/challenge`

**Tab 栏入口。** 每日挑战和激励系统。

### 功能
- 每日任务：听诗、跟读、读懂诗
- 打卡：`POST /api/me/checkin`
- 星星积分、连续打卡统计
- 学习统计：`GET /api/me/stats`

---

## 12. 我的 `pages/profile/profile`

**Tab 栏入口。** 个人中心。

### 功能
- 用户信息编辑（头像、昵称）
- 学习统计展示
- 我的作品入口 → 作品页
- 收藏列表入口
- 家长反馈入口 → 反馈页

---

## 13. 家长反馈 `pages/feedback/feedback`

**家长提交反馈。** 帮助改进小程序。

### 功能
- 选择反馈类型（内容建议/朗读音频/插画动画/练习背诵/问题反馈 等）
- 填写孩子年龄段
- 文字描述
- 提交 `POST /api/feedback`

---

## 14. 管理后台

### 14.1 权限入口 `pages/admin/admin`
- 调用 `GET /api/me` 检查角色是否为 `admin`
- 管理员可见管理功能入口
- 非管理员提示「无管理员权限」

### 14.2 反馈管理 `pages/admin-feedback/admin-feedback`
- 查看所有家长反馈：`GET /api/admin/feedback`
- 更新处理状态：`POST /api/admin/feedback/{id}/status`

### 14.3 朗诵审核 `pages/admin-recitation-review/admin-recitation-review`
- 查看朗诵列表：`GET /api/admin/recitations`
- 审核通过/驳回：`POST /api/admin/recitations/{id}/review`

### 14.4 诗配画审核 `pages/admin-artwork-review/admin-artwork-review`
- 查看诗配画列表：`GET /api/admin/artworks`
- 审核通过/驳回：`POST /api/admin/artworks/{id}/review`

---

## 页面路由关系图

```text
首页 ──→ 学习详情 ──→ 跟读页
  │         │
  │         ├──→ 录音（内嵌）
  │         └──→ 人气朗诵（内嵌）
  │
  ├──→ 练习页 ──→ 答题页
  │         └──→ 跟读页
  │
  └──→ 发现（内嵌）──→ 作品详情

诗园 ──→ 学习详情 / 跟读页

创作 ──→ 我的作品 ──→ 作品详情

诗光（每日任务/统计）

我的 ──→ 我的作品
  ├──→ 收藏
  ├──→ 家长反馈
  └──→ 管理后台（管理员）
          ├──→ 反馈管理
          ├──→ 朗诵审核
          └──→ 诗配画审核
```
