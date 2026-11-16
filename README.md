# 漫剧工坊 · Manju Studio

> An interactive AI short-drama (漫剧) production pipeline for **DeepSeek Harness**.
> 把一部小说变成可拍的竖屏漫剧：一集一个工作区，按阶段路由提示词，扫合规红线，校验 15 秒分镜，管理资产卡，检索克隆音色。

![icon](icon.svg)

## 它解决什么

漫剧制作的资料通常是一堆散落的提示词：改文的、提取人物的、写分镜的、运镜的、打斗的、封面的。真正麻烦的不是"没有提示词"，而是：

1. **这一步该用哪份文件**，粘到哪个窗口，产出存哪；
2. **分镜写完没人校验**——15 秒被写成 17 秒、漏了音色标注、状态卡和最后一镜对不上，等到出视频才发现；
3. **人物越生成越不像**，因为角色卡里写了道具、特效、瞳孔颜色；
4. **合规红线**是事后才想起来查的。

这个插件把上面四件事变成 7 个工具，让模型按 12 个阶段带着你走完，**纯文本的步骤它直接做，需要账号的步骤它给你精确的操作清单**。

## 七个工具

| 工具 | 作用 |
|---|---|
| `manju_init_project` | 建一集的工作区：13 个阶段目录 + 卡片/分镜/台词/发布模板 |
| `manju_status` | 扫项目目录，报告哪些阶段已有产出、下一步该做什么 |
| `manju_step` | 某一步的作战手册：我做啥、你在哪个 App 做什么、用哪份提示词、产出存哪、通过标准 |
| `manju_prompt` | 按 id 或关键词查提示词：文件绝对路径、粘贴位置、行分段、预览 |
| `manju_check` | 三种检查：`compliance`（违禁词逐行扫描）、`storyboard`（15 秒分镜格式）、`card`（资产卡规则） |
| `manju_card` | 写入 / 列出 / 校验角色（C）、场景（S）、道具（P）卡 |
| `manju_voices` | 检索本机克隆音色索引（按关键词/分类），给出文件名与目录 |

## 十二个阶段

```
0 建项目 → 1 体检+分集 → 2 改文 → 3 剧本化 → 4 分场表 → 5 锁风格
→ 6 资产提取 → 7 三视图 → 8 分镜 → 9 首帧图 → 10 图生视频 → 11 配音 → 12 剪辑/封面/发布
```

- **模型完成**：1–5、8（以及 6 的结构化描述、7/9/10 的指令与提示词）
- **必须人来**：出图、图生视频、配音、剪辑（要账号、要额度、要审美判断）

`manju_step` 对每一步都标明 `agent` / `manual` / `mixed`，所以模型不会替你假装生成了视频。

## 安装

### 1. 在 DSH 里安装

插件 → 添加插件 → 选本地目录（本仓库根目录）。
或在支持的话里用 `plugin_manager` 的 `install_bundle`，target 指向本目录。

### 2. 指向你自己的资料库

插件不自带提示词正文与音频（那是你自己的资料）。**推荐**写一个用户级配置文件（DSH 宿主的工作目录通常是 profile 目录，不是你的项目目录，所以显式配置最稳）：

`%USERPROFILE%\.dsh-manju-studio.json`（Windows）或 `~/.dsh-manju-studio.json`

```json
{
  "libraryRoot": "F:\\DSH\\AI漫剧\\AI漫剧工坊\\01_提示词库",
  "voicesRoot": "F:\\DSH\\AI漫剧\\AI漫剧工坊\\02_音色库",
  "projectsRoot": "F:\\DSH\\AI漫剧\\AI漫剧工坊\\06_项目"
}
```

也可以改用环境变量 `MANJU_LIBRARY_ROOT` / `MANJU_VOICES_ROOT` / `MANJU_PROJECTS_ROOT`，
或在插件行的 `config` 里写同样的三个键。都不设时，插件会从工作目录、其各级父目录与主目录下的
`AI漫剧工坊/` 里自动探测。

> 改完配置需要**重启 DSH** 才会重新加载（插件的模块代际在重启时替换）。

### 3. 自检

```bash
node scripts/check-library.mjs "F:\...\01_提示词库"   # 26 条提示词是否都能解析
npm run build:voices                                # 生成本地完整音色索引（不入库）
node scripts/mask-names.mjs                         # 由本地索引重建仓库里的脱敏版
npm test                                            # 18 个单元测试
```

> **音色索引分两层**：仓库里的 `library/voice-index.json` 是**脱敏版**（真实人名 → 拼音首字母，只保留分类与描述）；
> 你本机跑 `npm run build:voices` 会生成 `library/voice-index.local.json`（真实文件名，已 gitignore），
> 插件优先读本地版，所以本机检索不受影响。
>
> `npm test` 直接跑测试文件（不经过 test runner 的子进程），因此在受限 shell 里也能通过；
> 想用 runner 的隔离执行用 `npm run test:runner`，它在禁止创建管道的环境里会报 `spawn EPERM`。

## 怎么用

在会话里直接说：

```
帮我建一集项目，剧名《无命人》，第 1 集
```
→ `manju_init_project`

```
这是小说全文，先做合规体检和分集
```
→ `manju_check(kind=compliance)` + 分集表

```
写第 1 集的分镜
```
→ `manju_step(step=8)` 的规则 + 资产清单 + `manju_check(kind=storyboard)` 自检

```
这镜飞得太慢了 / 人物被画太大 / 一镜到底被切成好几段
```
→ 从"四大翻车修复"提示词取公式与英文负向词

## 设计约定

- **提示词路由不复制正文**：插件只存"id → 文件名 / 粘贴位置 / 行分段"的元数据，正文永远从你自己的库里读，避免版本漂移与二次分发。
- **校验优先于生成**：分镜、卡片、合规都有确定性检查，能不靠模型自觉的地方就不靠。
- **只读外部资料**：插件不写你的提示词库与音色库，只写项目目录。
- **中文优先**：工具输出、模板、规则都是中文，因为流水线本身是中文语境。

## 已知限制

- 出图/视频/配音必须人做，插件只给操作清单与提示词，不代替账号调用。
- 分镜校验是格式检查（时间轴、音色、状态卡字段），不判断剧情好坏。
- 违禁词表是静态清单，不等于平台实时规则；`manju_check(kind=compliance)` 会同时列出需要人工判断的选题级红线。
- 音色索引是文件清单，不含音频本身。

## 开发

```
index.js            插件入口（apply/inject）
lib/config.js       路径解析与项目目录约定
lib/steps.js        12 个阶段的定义（agent/manual/mixed）
lib/tools.js        7 个工具
lib/compliance.js   违禁词规则
lib/storyboard.js   15 秒分镜校验
lib/cards.js        资产卡规则
lib/projects.js     脚手架与进度
lib/library.js      提示词路由与回退匹配
lib/voices.js       音色检索
library/index.json  26 条提示词的路由元数据
library/voice-index.json  音色索引（由脚本生成）
templates/          项目模板
```

## License

MIT
