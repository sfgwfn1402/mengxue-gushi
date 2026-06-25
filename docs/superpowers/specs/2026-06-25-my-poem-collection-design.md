# 我的诗集（成就墙）· 设计文档

- 日期：2026-06-25
- 状态：设计已确认，待实现
- 作者：duwei + Claude

## 背景

萌学古诗已具备内容（100 首诗）、学习链路、UGC 创作和**后端进度记录**，但缺少一个把这些数据组织成"孩子专属成果"的展示层。当前"我的"页只有一个纯文字列表的弹窗（`openLearnedPoems()`），把已学的诗以 `《标题》朝代·作者` 文字行列出，没有可视化、没有星级、没有未学诗的对照，成就感弱。

本功能是"古诗成长档案"方向的**地基**：先把散落的进度数据组织成一面可视化的"诗集墙"，后续里程碑、庆祝动画、分享卡片都挂在它上面。

## 目标

把"我的"页现有的"已学古诗"文字弹窗，升级为一面**可视化诗集墙**：100 首诗按难度分组铺成格子，已学会的点亮并显示星级，未学的灰显作为对照，让孩子一眼看到"已点亮 X / 100"的成就和"还有多少等我点亮"。

## 非目标（YAGNI）

- 不新建独立页面（用户已确认增强现有弹窗）。
- 不在弹窗内展开/挂载用户作品（朗诵/诗配画）——点格子跳学习页即可，作品本就在学习页。
- 不改后端，不新增接口。
- 不做里程碑庆祝、连续天数强化、分享卡片——这些是后续功能，本次只做地基。

## 数据来源（已存在，无需新增）

- `api.listProgress()` → `GET /me/progress`，返回 `UserPoemProgress[]`，每项字段：
  - `poem_id: number`
  - `learned: bool`
  - `read_count: number`
  - `quiz_correct_count: number`
  - `quiz_wrong_count: number`
  - `last_learned_at: string | null`
- `api.listPoems({ page: 1, page_size: 500 })` → 全部诗，每首含 `id / title / author / dynasty / difficulty`。

`openLearnedPoems()` 当前已经同时拉这两个接口，本次复用同一份数据，只改组装与渲染。

## 设计

### 一、分组

按 `difficulty` 分三档（与诗园一致）：

- 启蒙（difficulty 1）
- 进阶（difficulty 2）
- 挑战（difficulty 3）

每组一个小标题，标题右侧显示该组进度，如 `启蒙 18/50`。组内按 `poem.id` 升序铺格子。

### 二、每首诗的状态

| 状态 | 判定 | 视觉 |
|---|---|---|
| 未学 untouched | 无进度记录，或 `read_count===0 && !learned` | 灰底、诗名浅灰、无星 |
| 学习中 learning | `read_count >= 1 && !learned` | 微亮、`✨`、诗名常规色 |
| 已学会 learned | `learned === true` | 点亮（暖色）、`⭐`×星级、诗名加深 |

### 三、星级（仅"已学会"的诗再细分掌握度）

复用已有字段，规则简单且对孩子友好：

- ⭐（1 星）：`learned`
- ⭐⭐（2 星）：`learned && read_count >= 3`
- ⭐⭐⭐（3 星）：`learned && read_count >= 3 && quiz_correct_count >= 1`

实现为一个纯函数 `computePoemStar(progress)`，返回 0–3 的整数（0 表示未学会，用于区分 ✨/灰显两态）。

### 四、弹窗结构（增强现有 modal）

`profile.wxml` 现有弹窗按 `modalType` 分支渲染（`about` / 列表）。新增分支 `modalType === 'collection'`：

```
modal-card
├── modal-header：标题「📚 我的诗集」+ 关闭 ×
├── collection-summary：已点亮 {{learnedCount}}/{{totalCount}}
└── collection-groups（可滚动）
    └── 每组 collection-group：
        ├── collection-group-title：启蒙 18/50
        └── collection-grid：
            └── collection-cell ×N（bindtap=openCollectionCell, data-id）
                ├── cell-stars：⭐⭐⭐ / ✨ / （空）
                └── cell-title：诗名
```

格子墙在弹窗内**纵向可滚动**（`scroll-view`），保证 100 首都能浏览。

### 五、交互

- 点任意格子 → `closeModal()` 后 `wx.navigateTo({ url: '/pages/learn/learn?id={id}&type=poem' })`。
  - 复用现有 `openModalItem` 的跳转逻辑，可新增 `openCollectionCell(e)`（从 `data-id` 取 id），或让格子复用 `openModalItem` 风格。
- 弹窗遮罩点击关闭逻辑不变。

### 六、空状态

`learnedCount === 0` 时，墙仍铺出全部灰格，summary 区显示一句引导：`挑一首点亮第一颗星 ⭐`。

### 七、数据组装（profile.js）

改造 `openLearnedPoems()`（或重命名为 `openMyCollection()`，入口 `handleStatTap` 的 `poems` 分支指向它）：

1. `Promise.all([api.listProgress(), api.listPoems({page:1,page_size:500})])`。
2. 建 `progressMap[poem_id] = progressItem`。
3. 遍历全部诗，按 difficulty 分组；每首诗算出 `state`（untouched/learning/learned）与 `star`（0–3）。
4. 组装为 `collectionGroups`：`[{ key, label, learned, total, cells:[{id,title,state,star}] }]`。
5. `setData({ modalVisible:true, modalType:'collection', modalTitle:'📚 我的诗集', collectionGroups, learnedCount, totalCount })`。
6. 失败时 toast「读取失败，请稍后重试」，保持现有错误处理风格。

### 八、样式（profile.wxss）

- `collection-grid`：每行 3–4 个格子（flex wrap），格子方形圆角卡片。
- 三态配色：已学会暖色（呼应主题 `#FFD700`/`#FF6B6B` 系），学习中浅暖，未学灰。
- 星星行小号，诗名两字到三字自适应、超长省略。
- 滚动区限制最大高度（如 `60vh`），避免弹窗超出屏幕。

## 错误处理

- 接口失败：沿用现有 `wx.showToast({ title:'读取失败，请稍后重试', icon:'none' })`，弹窗不打开或显示空态。
- 进度里有 `poem_id` 但全诗列表查不到对应诗：跳过该格（防脏数据）。

## 测试要点（手动，微信开发者工具 + 生产接口）

1. 有部分已学诗：墙正确点亮、星级符合规则、分组进度数对。
2. 一首没学：全灰 + 引导文案。
3. 点已学会格子 → 跳对应学习页。
4. 点未学格子 → 同样跳学习页（可学习并点亮）。
5. 学会一首后重开弹窗 → 该格变亮、计数 +1。
6. 接口失败 → toast，无白屏。

## 后续（不在本次范围）

- 学完一首的庆祝动画（落点在这面墙："你的诗集又多了一颗星"）。
- 里程碑（学会第 10/20/50 首）。
- 基于诗集 + 作品生成家长分享卡片。
