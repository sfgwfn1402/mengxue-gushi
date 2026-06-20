# 萌学古诗开发说明

## 项目位置

- 小程序前端：`/Users/duwei/workspace/mengxue-gushi`
- Rust 后端：`/Users/duwei/workspace/xiaochengxu/mengxuegushi-rust`

## 环境约定：默认操作生产

萌学古诗当前所有真实调试、验证和问题排查都以生产环境为准：

- 小程序默认调用生产 Rust API。
- Rust 服务以生产服务器为准：`ubuntu@192.144.133.222`，目录 `/opt/mengxuegushi`。
- PostgreSQL 以生产库为准：服务器本机 `127.0.0.1:5432`，通过 `/opt/mengxuegushi/.env` 的 `DATABASE_URL` 连接。
- MinIO 以生产 MinIO 为准：服务器 `192.144.133.222` 上的生产 MinIO / bucket。
- 不要用本地 Rust 服务、本地数据库或本地 MinIO 的结果来判断线上小程序问题。
- 改完后端影响小程序线上行为时，需要发布生产 Rust 服务并验证生产接口。

## 作品发布到发现

产品逻辑：

1. 用户在创作页上传/保存朗诵或诗配画后，作品先进入“我的作品/我的诗集”，默认不展示到“发现”。
2. 用户在“我的作品/我的诗集”里主动点击“发布到发现”后，作品才公开。
3. 已发布作品可以在“发现”页看到；用户撤回公开后，“发现”页不再展示。

### 小程序前端相关文件

- 创作/上传作品：`pages/create/create.js`
  - `publishRecitation()`：上传朗诵，成功后提示“已保存到我的作品”。
  - `publishArtwork()`：上传诗配画，成功后提示“已保存到我的作品”。
- 我的作品/发布入口：`pages/works/works.js`
  - `openMoreMenu()`：作品右上角菜单，未公开时显示“发布到发现”，已公开/已发布时显示“撤回公开”。
  - `submitWork(id)`：调用后端公开接口。
  - `withdrawWork(id)`：调用后端撤回公开接口。
- 我的作品页面文案：`pages/works/works.wxml`
- 发现页：`pages/index/index.js`
  - `loadDiscoverItems()`：读取发现页作品。
  - 诗配画来自 `api.listArtworks({ limit: 20 })`。
  - 朗诵来自 `api.getPopularRecitations()`。
- API 封装：`utils/api.js`
  - `submitArtwork()` / `withdrawArtwork()`
  - `submitRecitation()` / `withdrawRecitation()`
  - `listArtworks()` / `getPopularRecitations()`

### 后端相关文件

后端仓库：`/Users/duwei/workspace/xiaochengxu/mengxuegushi-rust`

- 路由注册：`src/routes/mod.rs`
  - `POST /api/artworks/{artwork_id}/submit`
  - `DELETE /api/artworks/{artwork_id}/submit`
  - `POST /api/recitations/{recitation_id}/submit`
  - `DELETE /api/recitations/{recitation_id}/submit`
  - `GET /api/artworks`
  - `GET /api/home/popular-recitations`
- 诗配画接口：`src/routes/artworks.rs`
  - `submit_artwork()`：发布到发现。
  - `withdraw_artwork()`：撤回公开。
  - `list()`：发现页诗配画列表；非 `mine` 查询走公开列表。
- 朗诵接口：`src/routes/recitations.rs`
  - `submit_recitation()`：发布到发现。
  - `withdraw_recitation()`：撤回公开。
- 诗配画数据库逻辑：`src/services/artwork_store.rs`
  - `set_submission_status()`：更新作品状态。
  - `list_recent()`：发现页诗配画列表，目前只查 `status = 'public'`。
  - `list_mine()`：我的作品列表。
- 朗诵数据库逻辑：`src/services/recitation_store.rs`
  - `set_submission_status()`：更新作品状态。
  - 公开朗诵查询需要关注 `status = 'public'` 条件。
- 发现/首页数据：`src/services/home_store.rs`
  - `popular_recitations()`：发现页/首页人气朗诵来源。

### 注意

当前后端实现为：用户点“发布到发现”后，`submit_*` 接口直接把状态改为 `public`，发现页查询只返回 `public` 作品。
