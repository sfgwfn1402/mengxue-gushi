# 萌学古诗 · 系统全景架构

## 1. 总览

```text
┌──────────────────────────────────────────────────────────┐
│                      微信小程序                          │
│  ┌─────────┐ ┌────────┐ ┌──────┐ ┌───────┐ ┌────────┐  │
│  │ 首页     │ │ 诗园   │ │ 创作  │ │ 诗光  │ │ 我的   │  │
│  └────┬────┘ └───┬────┘ └──┬───┘ └──┬────┘ └───┬────┘  │
│       └──────────┴─────────┴────────┴──────────┘        │
│                         │ HTTPS                          │
└─────────────────────────┼────────────────────────────────┘
                          │
            ┌─────────────┼─────────────┐
            │             │             │
            v             v             v
┌───────────────────┐ ┌─────────────┐ ┌──────────────┐
│   Rust API 服务   │ │   Nginx     │ │   MinIO      │
│   axum :8080      │ │   :80/:443  │ │   :9000      │
│                   │ │             │ │              │
│  /api/*           │ │ /audios/*   │ │ audios-id/   │
│  /audios/*        │ │ /images/*   │ │ images-id/   │
│  /images/*        │ │ /line-*     │ │ line-audios/ │
│  /recitations/*   │ │ /recitat*   │ │ recitations/ │
│  /avatars/*       │ │ /avatars/*  │ │ avatars/     │
│  /artworks/*      │ │ /artworks/* │ │ artworks/    │
│                   │ │             │ │              │
└────────┬──────────┘ └─────────────┘ └──────────────┘
         │
         │ sqlx
         v
┌───────────────────┐
│   PostgreSQL 16   │
│   127.0.0.1:5432  │
└───────────────────┘
```

## 2. 部署拓扑

### 生产服务器

| 项目 | 值 |
|---|---|
| 云平台 | 腾讯云 Ubuntu 24.04 |
| 公网 IP | 192.144.133.222 |
| 域名 | www.duwei.cloud |
| 用户 | ubuntu |

### 服务进程

```text
/opt/mengxuegushi/
├── app/                   # Rust 源码（git clone）
├── mengxuegushi-rust       # 编译产物
├── .env                    # 环境变量（DATABASE_URL 等）
└── audios/                 # 本地音频 fallback 目录
```

| 服务 | 端口 | 进程管理 | 说明 |
|---|---|---|---|
| Rust API | 0.0.0.0:8080 | systemd (`mengxuegushi.service`) | 业务 API + 静态媒体 |
| PostgreSQL | 127.0.0.1:5432 | systemd | 只监听本机，不对外开放 |
| MinIO (API) | 9000 | Docker | 对象存储 |
| MinIO (Console) | 9001 | Docker | Web 控制台 |
| Nginx | 80/443 | systemd | HTTPS 反代，证书覆盖 www.duwei.cloud |

## 3. 数据流全景

### 3.1 古诗内容流

```text
小程序启动
  │
  ▼
POST /api/auth/wechat-login (微信 code)
  │
  ▼  收到 Bearer token，后续请求带 Authorization
GET /api/poems?page=1&page_size=100
  │
  ▼  Rust 从 PostgreSQL 查 poems 表，返回 JSON
小程序 globalData.poems ← 标准化后的古诗列表
  │
  ▼  normalizePoemFromApi() 转换字段名，改写音频/图片 URL 为 HTTPS 域名
各页面使用 getPoemById() / getPoems()
```

### 3.2 音频播放流

```text
小程序学习页
  │
  ├── 整首朗读：https://www.duwei.cloud/audios/poem-{id}.mp3?v={version}
  │       │
  │       ▼  Nginx 反代 → MinIO audios-id/poem-{id}.mp3
  │
  ├── 逐句跟读：https://www.duwei.cloud/line-audios/poem-{id}-line-{n}.mp3
  │       │
  │       ▼  Nginx 反代 → MinIO line-audios/poem-{id}-line-{n}.mp3
  │
  └── 用户朗诵：https://www.duwei.cloud/recitations/{user_id}.mp3
          │
          ▼  Nginx 反代 → MinIO recitations/{user_id}.mp3
```

### 3.3 作品创作流

```text
用户录音 / 配画
  │
  ├── 朗诵：POST /api/poems/{poem_id}/recitations (multipart)
  │         → 文件存入 MinIO recitations/
  │         → 数据库插入 recitations 行，status = 'draft'
  │
  ├── 诗配画：POST /api/poems/{poem_id}/artworks (multipart)
  │         → 文件存入 MinIO artworks/
  │         → 数据库插入 artworks 行，status = 'draft'
  │
  ▼
我的作品页 → POST /api/recitations/{id}/submit → status 改为 'public'
          → POST /api/artworks/{id}/submit     → status 改为 'public'
  │
  ▼
发现页（首页）← GET /api/home/popular-recitations
              ← GET /api/artworks
```

### 3.4 用户数据流

```text
用户登录 → PostgreSQL users 表
  │
  ├── 学习进度 → /api/me/progress/{poem_id}
  ├── 收藏     → /api/me/favorites/{poem_id}
  ├── 打卡     → /api/me/checkin
  ├── 任务     → /api/me/tasks
  ├── 成语进度 → /api/me/idiom-progress
  └── 统计     → /api/me/stats
```

## 4. 关键技术决策

| 决策 | 原因 |
|---|---|
| 数据库是主数据源 | 用户换设备不丢数据；内容可后端管理 |
| 小程序不缓存业务数据 | 只存 token 和临时参数，避免数据不一致 |
| 统一走 HTTPS 域名 | 微信小程序合法域名要求 + 小程序禁止 HTTP |
| 跟读和朗读两套独立音频 | 整首给播放用，单句给逐句跟读用，不能混用兜底 |
| 音频版本参数绕过缓存 | `?v={version}` 更新音频后小程序不缓存旧音频 |
| IP Guard 中间件 | 限制 API 高频误封，静态媒体跳过 |
| Nginx 反代 MinIO | 统一 HTTPS 出口，避免小程序直接访问 MinIO IP |

## 5. 相关文档索引

| 文档 | 内容 |
|---|---|
| [DEVELOPMENT.md](../DEVELOPMENT.md) | 开发约定：默认操作生产 |
| [README.md](../README.md) | 项目概览、快速开始 |
| [audio-workflow.md](audio-workflow.md) | 音频维护完整流程 |
| [audio-funasr-workflow.md](audio-funasr-workflow.md) | FunASR 音频识别时间轴 |
| [api-reference.md](api-reference.md) | 前端 API 速查 |
| [pages-guide.md](pages-guide.md) | 页面功能与路由 |
| [poem-audio-status.md](poem-audio-status.md) | 每首诗音频状态清单 |
| 后端设计文档 | `/mengxuegushi-rust/docs/01-05` |
