# Cassini — Exhibition Room

一个纯静态的摄影陈列室。三个游戏、一百零一幅照片，一路往下滚，背景色连续过渡。

**没有框架、没有构建步骤、没有外部依赖**（字体和图片全部在本地）。
拖进 GitHub 就能被 Cloudflare Pages 直接拉起来，不需要任何命令。

---

## 一、先看效果

直接双击 `index.html` 就能看。

这一版特意做成了**双击即可**：图片索引写在 `js/data.js` 里，不是用
`fetch()` 去读的，所以不会出现 `file://` 跨域白屏。
（上一站 St.Cassini Production 需要开本地服务器，是因为它要 fetch JSON。）

---

## 二、六个章节

| 序号 | 章节 | 内容 |
|---|---|---|
| 01 | Exhibition Room | 巨型标题 + 一张把 101 张照片串成星座的关系图 |
| 02 | Index | 目录，三行，点任意一行进入对应展厅 |
| 03 | Cyberpunk 2077 | 30 幅 |
| 04 | Death Stranding | 34 幅 |
| 05 | Death Stranding 2 — On the Beach | 37 幅 |
| 06 | Contact | 邮箱 + 从现在起算的 Unix 时间戳（每秒跳） |

每张照片点开是全屏查看器：`←` `→` 翻页、`Esc` 关闭、手机可左右滑。

---

## 三、传到 GitHub（关键步骤，别拖错）

### 1. 建一个空仓库

GitHub 右上角 `+` → `New repository` → 填名字（例如 `cassini-exhibition-room`）
→ **不要勾** Add a README / .gitignore / license（保持完全空）→ Create。

### 2. 拖文件

打开新仓库页面，点 `uploading an existing file`（或直接浏览器地址栏后面加 `/upload`）。

⚠️ **拖的是「这个文件夹里面的内容」，不是文件夹本身。**
如果拖了整个 `Cassini Photography Exhibition Room` 文件夹，
仓库根目录会多出一层同名文件夹，网站就打不开了。

GitHub 网页上传**一次最多 100 个文件**，而这里一共 112 个，所以要分三次。
（少拖一次也没关系，GitHub 会提示超限，把剩下的再拖一次就行。）

**第 1 次拖**（8 个文件）：`index.html`、`README.md`、`_headers`、`css/`、`js/`、`fonts/`
→ 页面底部 `Commit changes`。

**第 2 次拖**（64 个文件）：`media/cyberpunk/` + `media/stranding/` 两个文件夹
→ 再 `Commit changes`。

**第 3 次拖**（37 个文件）：`media/stranding2/`
→ 再 `Commit changes`。

三次都提交完，仓库根目录应当**直接**是：

```
index.html
README.md
_headers
css/  js/  fonts/  media/
```

> 记住：**先拖文件夹以外的东西，最后拖 media**，因为 media 最占上传时间。

### 3. 建 Cloudflare Pages 项目

Cloudflare 后台 → `Workers & Pages` → `Create` → `Pages` → `Connect to Git`
→ 选这个仓库，然后照这张表填：

| 设置项 | 填什么 |
|---|---|
| Project name | 随便，会成为 `xxx.pages.dev` 里的 xxx |
| Framework preset | **None** |
| Build command | **留空** |
| Build output directory | **留空** |
| Production branch | **main** |

保存，等一分钟，`https://<项目名>.pages.dev` 就能看了。

> 第三项填成 `dist` 之类会得到一个「部署成功但全站 404」的站——
> 因为文件就在根目录，不在任何子目录里。

以后改任何文件（网页上点铅笔改、或者再传一次）都会自动重新部署，约 30～60 秒生效。

域名绑定你自己来，纯静态站没有额外要求；要加 `CNAME` 文件就加在根目录。

---

## 四、换图 / 加图

图片在 `media/` 下三个目录里，文件名是 `01.webp`、`02.webp`……

- **换一张**：直接上传同名文件覆盖，不用改任何代码。
- **加一张**：文件名顺延（例如 `38.webp`），然后**还要改 `js/data.js`**——
  在里面找到对应那一组，照现有的格式加一条：

```json
{ "n": 38, "file": "media/stranding2/38.webp", "w": 2000, "h": 1250, "kb": 300,
  "lqip": "……", "lqipW": 32, "lqipH": 20 }
```

`lqip` 是那张图 32px 宽的模糊预览（base64），用来做模糊占位和首页星座图里的小图。
懒得弄的话，把它填成空字符串 `""` 也能跑，只是那张图会少一层渐进效果。

**建议图片规格**：`2000×1250`、WebP、质量 80 左右，单张 150～400 KB。
现在 101 张一共约 16 MB。

---

## 五、目录结构

```
index.html          页面骨架（六个章节）
css/site.css        设计系统：配色、字体、栅格、动效
js/site.js          背景色过渡、导航连线、星座图、查看器、时间戳
js/data.js          图片索引（自动生成的那份清单）
fonts/              5 个 woff2：GT Standard L/M、Inter、Geist Mono、JetBrains Mono
media/cyberpunk/    30 张
media/stranding/    34 张
media/stranding2/   37 张
_headers            Cloudflare 的缓存与安全头
```

---

## 六、动效清单（对照 Shopify Editions · Fall '26）

| 参考站的做法 | 这里的实现 |
|---|---|
| 整页背景色随滚动在色块间连续过渡 | 六层纯色层叠加 + 逐帧透明度插值（GPU 合成，不重绘） |
| 左侧固定导航轨 + 圆点 + 连到正文的细线 + 沿线跑的光点 | 同款，连线用三次贝塞尔，随滚动实时重算，靠近接线 |
| 巨型标题（GT Standard，负字距，行高 0.8） | 同款，逐行遮罩上推入场 |
| 卡片：1px 半透明白边 + 8% 白底 + 圆角 0 | 同款（照片框、目录行都用这套表面） |
| —— | **照片墙**：图片不再是静态栅格，而是一块画布上缓慢漂移的一堆照片；鼠标靠近时被推开、指到的那张放大并摆正，点击进全屏 |
| Hero 的关系图（节点 + 引线 + 标签） | 照片星座图：三个枢纽，101 个照片节点，入场逐条画线、节点弹入，之后缓慢呼吸、沿引线跑脉冲、跟随鼠标轻微视差 |
| 取景框角标 / 等宽小字 / 下划线链接 / 药丸按钮 | 全部保留 |
| 全部动效尊重 `prefers-reduced-motion` | 已做 |

配色沿用参考站的六个色块结构，换成三个展区的性格色：

| 章节 | 底色 | 墨色 |
|---|---|---|
| 01 首页 | `#051daa` 蓝 | 白 |
| 02 目录 | `#7000a9` 紫 | 白 |
| 03 Cyberpunk 2077 | `#f2e400` 霓虹黄 | **黑** |
| 04 Death Stranding | `#5a5e62` 灰 | 白 |
| 05 Death Stranding 2 | `#0c55ae` 蓝 | 白 |
| 06 Contact | `#0f0f0f` 石墨 | 白 |

黄色那一段必须用黑字，所以整站做了一套「墨色」变量 `--ink`：
进入 2077 展区时它会从白过渡到黑，连文字、细线、左侧导航轨、取景框角标、
滚动条一起换色，`@property` 注册过的颜色变量可以在 0.55 秒内平滑补间。

---

## 七、字体授权提醒

`GT Standard` 是从 Shopify 官网抓下来的商用字体。个人作品集展示问题不大，
但**如果以后要正式商用 / 接客户项目，建议换掉**：
把 `css/site.css` 里 `--display` 和 `--text` 的 `"GT Standard L"` / `"GT Standard M"`
改成 `"Inter"` 即可（已经在本地，免费开源，观感接近）。
`Inter`、`Geist Mono`、`JetBrains Mono` 都是免费字体，可以放心用。

