# 萌学古诗 · 前端 API 速查

> 所有 API 统一走 `https://www.duwei.cloud/api`，需要 Bearer token 鉴权。

---

## 认证

| 功能 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 微信登录 | `POST` | `/auth/wechat-login` | 传 `{code}`，返回 `{token, user}` |
| 开发登录 | `POST` | `/auth/dev-login` | 传 `{openid}`，调试用 |

### 鉴权机制
1. 小程序的 `utils/api.js` 封装了所有请求
2. 首次调用 `api.login()` 获取 token，存入 `wx.storage.apiToken`
3. 后续请求自动带 `Authorization: Bearer {token}`
4. 401 错误自动重新登录后重试

---

## 首页 & 发现

| 功能 | 方法 | 路径 | 返回 |
|---|---|---|---|
| 今日一诗 | `GET` | `/home/today-poem` | `{item: Poem}` |
| 继续学习 | `GET` | `/home/continue-learning` | `{item: Poem}` |
| 推荐列表 | `GET` | `/home/recommendations` | `{items: [Poem]}` |
| 人气朗诵 | `GET` | `/home/popular-recitations` | `{items: [Work]}` |

---

## 古诗

| 功能 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 古诗列表 | `GET` | `/poems` | 支持 `?page=&page_size=&level=&season=&tag=&search=` |
| 古诗详情 | `GET` | `/poems/{id}` | 单首诗完整数据 |
| 主题标签 | `GET` | `/themes` | 所有可用主题标签 |

### Poem 对象
```typescript
{
  id: number
  title: string
  author: string
  dynasty: string
  content: string
  pinyin: string
  annotated_content: [{text, pinyin, annotation}]  // 富文本
  translation: string        // 诗意
  story: string              // 背景故事
  parent_guide: string       // 家长导读
  difficulty: number         // 1-3
  tags: string[]             // 标签
  season: string             // spring/summer/autumn/winter/any
  audio_url: string          // 朗读音频 URL（后端原始地址，前端通过 normalizeMediaUrl 改写为 HTTPS）
  audio_version: string      // 音频版本号
  image_url: string          // 配图 URL
  video_available: boolean
  card_unlocked: boolean
  follow_timings: object     // 跟读时间轴（可选）
}
```

---

## 朗诵

| 功能 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 上传朗诵 | `POST` | `/poems/{poem_id}/recitations` | multipart，`file` + `duration_seconds` |
| 精选朗诵 | `GET` | `/poems/{poem_id}/recitations/featured` | 官方/精选朗诵 |
| 人气朗诵 | `GET` | `/poems/{poem_id}/recitations/top?limit=5` | 按点赞排行 |
| 朗诵详情 | `GET` | `/recitations/{id}` | 单条朗诵数据 |
| 获取音频 | `GET` | `/recitations/{id}/audio` | 朗诵音频文件 |
| 删除朗诵 | `DELETE` | `/recitations/{id}` | 删除自己的朗诵 |
| 发布到发现 | `POST` | `/recitations/{id}/submit` | 公开朗诵 |
| 撤回公开 | `DELETE` | `/recitations/{id}/submit` | 撤回公开 |
| 点赞 | `POST` | `/recitations/{id}/like` | |
| 取消点赞 | `DELETE` | `/recitations/{id}/like` | |

---

## 诗配画

| 功能 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 上传诗配画 | `POST` | `/poems/{poem_id}/artworks` | multipart，`file` + `title` + `description` |
| 诗配画列表 | `GET` | `/artworks` | 支持 `?mine=true`（我的作品）、分页 |
| 诗配画详情 | `GET` | `/artworks/{id}` | 包括作者、状态、点赞 |
| 获取图片 | `GET` | `/artworks/{id}/image` | 诗配画原图 |
| 删除诗配画 | `DELETE` | `/artworks/{id}` | |
| 发布到发现 | `POST` | `/artworks/{id}/submit` | 公开作品 |
| 撤回公开 | `DELETE` | `/artworks/{id}/submit` | 撤回公开 |
| 点赞 | `POST` | `/artworks/{id}/like` | |
| 取消点赞 | `DELETE` | `/artworks/{id}/like` | |

---

## 我的

| 功能 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 用户信息 | `GET` | `/me` | 昵称、头像、角色等 |
| 更新资料 | `POST` | `/me` | `{nickname, avatar_url}` |
| 上传头像 | `POST` | `/me/avatar` | multipart，`file` |
| 学习统计 | `GET` | `/me/stats` | 已学数、打卡、星星 |
| 每日打卡 | `POST` | `/me/checkin` | |
| 完成任务 | `POST` | `/me/tasks` | `{task_id, stars}` |
| 清除数据 | `POST` | `/me/clear-data` | |
| 学习进度 | `GET` | `/me/progress` | 所有诗的进度列表 |
| 更新进度 | `POST` | `/me/progress/{poem_id}` | `{status, score}` |
| 成语进度 | `GET` | `/me/idiom-progress` | |
| 更新成语进度 | `POST` | `/me/idiom-progress` | `{idiom_id, status}` |
| 我的朗诵 | `GET` | `/me/recitations` | 我的朗诵作品列表 |

---

## 收藏

| 功能 | 方法 | 路径 |
|---|---|---|
| 收藏列表 | `GET` | `/me/favorites` |
| 添加收藏 | `POST` | `/me/favorites/{poem_id}` |
| 取消收藏 | `DELETE` | `/me/favorites/{poem_id}` |

---

## 反馈

| 功能 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 提交反馈 | `POST` | `/feedback` | `{type, age, content}` |

---

## 作品二维码

| 功能 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 获取二维码 | `GET` | `/works/qrcode?type={recitation\|artwork}&id={id}` | 返回图片 |

---

## 管理后台（仅 admin 角色）

### 反馈管理
| 功能 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 反馈列表 | `GET` | `/admin/feedback` | 支持分页、状态筛选 |
| 更新状态 | `POST` | `/admin/feedback/{id}/status` | `{status: "reviewed"\|"resolved"\|"ignored"}` |

### 朗诵审核
| 功能 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 朗诵列表 | `GET` | `/admin/recitations` | 支持分页、状态筛选 |
| 审核 | `POST` | `/admin/recitations/{id}/review` | `{status: "public"\|"rejected"}` |

### 诗配画审核
| 功能 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 诗配画列表 | `GET` | `/admin/artworks` | 支持分页、状态筛选 |
| 审核 | `POST` | `/admin/artworks/{id}/review` | `{status: "public"\|"rejected"}` |

---

## 静态媒体（非 API 路由，由 Nginx 反代到 MinIO）

| 路径 | MinIO 目录 | 说明 |
|---|---|---|
| `/audios/poem-{id}.mp3` | `mengxue-gushi/audios-id/` | 整首官方朗读 |
| `/images/poem-{id}.jpg` | `mengxue-gushi/images-id/` | 古诗配图 |
| `/line-audios/poem-{id}-line-{n}.mp3` | `mengxue-gushi/line-audios/` | 逐句跟读音频 |
| `/recitations/{file}` | `mengxue-gushi/recitations/` | 用户上传朗诵 |
| `/avatars/{file}` | `mengxue-gushi/avatars/` | 用户头像 |
| `/artworks/{file}` | `mengxue-gushi/artworks/` | 用户诗配画 |

---

## 音频版本参数

部分诗有 `FALLBACK_POEM_AUDIO_VERSION`（`utils/tts.js`），用于在音频更新后绕过微信缓存：

| 诗 ID | 版本参数 |
|---|---|
| 8（游子吟） | `20260621-full6`（复用 ID 74 完整六句音频） |
| 33（四时田园杂兴） | `20260621-real-guwendao-funasr-v9` |
| 38（琵琶行） | `20260621-pipaxing-bai-guwendao-p38_58_30` |
| 39（兵车行） | `20260621-bingchexing-excerpt-funasr-v4-tail` |

---

## 相关文件

| 文件 | 说明 |
|---|---|
| `utils/api.js` | 所有 API 封装 |
| `utils/config.js` | 环境配置（apiBaseUrl 等） |
| `utils/tts.js` | 音频 URL 生成和音频版本 |
|[pages-guide.md](pages-guide.md) | 页面功能与路由 |
|[architecture.md](architecture.md) | 系统全景架构 |
