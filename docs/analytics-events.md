# 埋点事件字典

萌学古诗小程序的自建埋点分析体系。本文档是埋点的唯一事实来源：新增/修改埋点时，**必须同步更新本文档**。

## 1. 架构概览

```
前端 track(event, props)
  → utils/track.js 缓冲(4秒 或 满10条触发)
  → api.trackEvents 批量 POST /api/events  (retries:0，失败静默丢弃)
  → 后端 event_store.insert_events 写入 events 表
  → 管理员中心「数据看板」GET /api/admin/analytics 聚合展示
```

设计原则：

- **绝不阻塞业务**：`track()` 同步入队即返回，上报异步、失败静默，不抛错、不重试。
- **可选登录态**：上报接口 `POST /events` 带 token 则记 `user_id`，未登录记 `null`，永不因鉴权失败拒绝。
- **自建不依赖第三方**：儿童 App 规避第三方 SDK 合规风险，数据存自己的 PostgreSQL。
- **只埋能回答真问题的事件**，不滥埋。

## 2. 数据结构

`events` 表（迁移 `202606260003_events.sql`）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | BIGSERIAL | 主键 |
| `event_name` | TEXT | 事件名，见下表 |
| `user_id` | TEXT (nullable) | 登录用户 id，匿名为 null |
| `page` | TEXT | 触发时所在页面 route（track.js 自动附带） |
| `props` | JSONB | 事件附加属性 |
| `created_at` | TIMESTAMPTZ | 服务端写入时间 |

索引：`(event_name, created_at)`、`(created_at)`、`(user_id, created_at)`。

## 3. 事件字典

| 事件名 | 中文标签 | 触发点（文件 / 方法） | props | 回答的问题 |
|---|---|---|---|---|
| `page_view` | 页面访问 | `index.js` onShow / `profile.js` onShow | `{ name }` | 首页·我的页有人去吗 |
| `poem_open` | 打开诗词 | `learn.js` onLoad | `{ poem_id, type }` | 学习页入口量（即学习页的 page_view） |
| `poem_learn` | 学会一首 | `learn.js` markAsLearned | `{ poem_id, type }` | 多少诗被点亮 |
| `poem_follow` | 完成跟读 | `learn.js` completeFollowPoem | `{ poem_id }` | 跟读功能使用量 |
| `poem_recite` | 背诵闯关 | `recite.js` finish | `{ poem_id }` | 背诵功能使用量 |
| `ai_score_used` | AI评分(发起) | `learn.js` scoreMyRecitation | `{ poem_id }` | AI 评分有没有人点 |
| `ai_score_done` | AI评分(完成) | `learn.js` scoreMyRecitation 成功回调 | `{ poem_id, score }` | 评分完成率 / 分数分布 |
| `checkin` | 打卡 | `profile.js` doCheckin 成功 | `{ streak }` | 每日活跃 / 打卡习惯 |
| `share_clicked` | 点击分享 | index/profile/parent-report onShareAppMessage | `{ type, from }` | 分享有人点吗，哪种 |
| `recitation_play` | 听社区朗诵 | `index.js` playDiscoverRecitation | `{ recitation_id }` | 发现页的朗诵有人听吗 |
| `listen_open` | 进磨耳朵 | `index.js` goListen | — | 磨耳朵入口有人点吗 |
| `listen_play` | 磨耳朵播放 | `listen.js` playAt | `{ poem_id, list }` | 磨耳朵真有人听吗/听哪个单 |
| `invite_landed` | 邀请落地 | `index.js` maybeShowInviteWelcome | `{ from }` | 邀请真转化了吗 |
| `review_done` | 复习一首 | `review.js` remembered | `{ poem_id }` | 复习功能有人用吗 |
| `reminder_subscribed` | 开启提醒 | `profile.js` openStudyReminder 授权成功 | — | 提醒订阅有人开吗 |
| `daily_plan_view` | 看到今日计划 | `index.js` buildDailyPlan | `{ total }` | 今日计划有多少人看到 |
| `daily_plan_tap` | 点今日计划项 | `index.js` goPlanItem | `{ kind }` | 计划项有人点吗(新诗/复习) |
| `daily_plan_complete` | 完成今日计划 | `index.js` buildDailyPlan(全完成) | `{ total }` | 多少人真把当天功课做完 |

### share_clicked 的 props

| 字段 | 取值 | 含义 |
|---|---|---|
| `type` | `home` | 首页/浮球面板分享 |
| | `invite` | 个人中心邀请卡分享 |
| | `card` | 成就卡分享（带卡片缩略图） |
| | `report` | 家长周报分享 |
| `from` | `index` / `profile` / `parent-report` | 分享发起页 |

## 4. 数据看板

入口：个人中心 →「管理员中心」→「数据看板」（仅 admin 角色可见）。
页面：`pages/admin-analytics/admin-analytics`，接口 `GET /api/admin/analytics?days=N`（默认 7，clamp 1~90）。

展示内容：

- **活跃用户 / 总事件数**：区间内去重 user_id 数与事件总量。
- **每日活跃**：按天的事件量条形图 + 当日活跃人数。
- **功能使用次数**：各 `event_name` 计数，按次数降序，中文标签见上表（标签映射在 `admin-analytics.js` 的 `EVENT_LABELS`）。
- **热门诗 Top 10**：`poem_open/learn/follow/recite` 事件里 `props.poem_id` 的计数，LEFT JOIN `poems` 取标题。

## 5. 如何新增一个埋点

1. 在动作发生处调用 `track('your_event', { ...props })`（先 `const { track } = require('相对路径/utils/track')`）。
2. 若需在看板显示中文标签，在 `admin-analytics.js` 的 `EVENT_LABELS` 加一行。
3. 若是诗词维度事件且想进「热门诗」，props 带 `poem_id`，并把事件名加入 `event_store.rs` analytics 的 `IN (...)` 列表。
4. **更新本文档的事件字典表**。

## 6. 注意事项

- 事件名 ≤ 64 字符，超长或空会被后端忽略。
- 单次批量 ≤ 50 条，超出部分丢弃。
- `props` 不要放敏感信息（手机号、openid 等）。
- 埋点是「锦上添花」，任何上报失败都不应影响用户体验——这是 track.js 全程静默的原因。
