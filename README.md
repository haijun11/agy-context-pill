# Context Pill for Antigravity

一个极简、零第三方依赖的 **Google Antigravity** 输入框监控胶囊插件。不改 `app.asar` 安装包、没有多余侧边栏、不自动杀进程，只在输入框右下角 `Turbo` 左侧优雅展示核心指标。

## ✨ 核心功能

1. **📊 今日用量（Daily Tokens）**
   * 胶囊显示当天所有会话累计消耗的总 Token。
   * 悬停浮卡展示：今日请求次数、**缓存读取 / 未命中输入 / 输出 Token** 三色分布条，以及当前会话累计用量。
2. **⚡ Prompt 缓存命中率（Cache Hit）**
   * 胶囊显示本轮命中率（`≥80%` 翠绿、`50%~79%` 琥珀黄、`<50%` 珊瑚红）。
   * 悬停浮卡展示：本轮缓存读取、未命中、输出明细，以及整段会话平均命中率。
3. **🕒 Gemini 5h & 周额度（Gemini Quota）**
   * 胶囊只显示 **Gemini 5 小时剩余额度**（过滤 Claude / GPT）。
   * 悬停浮卡同时展示 **5h 额度** 与 **周额度**（剩余百分比、进度条、重置倒计时与具体重置时间）。
4. **○ 上下文窗口（Context Window）**
   * 胶囊显示当前会话上下文占比，支持**双击直接触发 `/compact` 压缩上下文**（输入框有未发送草稿时自动保护不覆盖）。
   * 悬停浮卡展示：已用 / 上限、剩余可用、**解码速度（tok/s）**、**首字延迟（TTFT）** 与模型名称。
5. **⚙️ 原生设置集成**
   * 打开 `Settings → General → Input Box`，可独立开关 4 个胶囊的显示与隐藏，配置自动持久化。

---

## 📦 极简结构（0 第三方依赖）

```text
context-pill/
├── plugin.json               # 插件清单
├── 一键安装.bat               # Windows 一键安装并启用
├── uninstall.bat             # Windows 一键卸载清理
└── sidecars/
    └── pill/
        ├── sidecar.json      # Sidecar 配置（限制 96MB 内存，无侧边栏）
        ├── main.mjs          # 后台采集（LanguageServer RPC + 原生 WebSocket CDP）
        └── widget.js         # 注入 UI（Shadow DOM 隔离，自适应浅/深色主题）
```

---

## 🚀 快速安装（Windows）

### 1. 安装插件
下载本仓库（或 Release ZIP）解压后，直接双击运行 **`一键安装.bat`**。
脚本会自动完成：
1. 将插件复制到 `%USERPROFILE%\.gemini\config\plugins\context-pill`
2. 在 `%USERPROFILE%\.gemini\config\config.json` 中启用 `context-pill`

### 2. 带本机调试端口启动 Antigravity
由于 Antigravity 未提供输入框内嵌控件的公开插件 API，界面注入需要通过本机回环调试端口完成。在你的启动脚本或快捷方式末尾加上以下参数即可（仅绑定 `127.0.0.1` 本机回环地址，不改 `app.asar`）：

```text
--remote-debugging-port=0 --remote-debugging-address=127.0.0.1
```

例如使用 `.bat` 启动：
```bat
@echo off
start "" "%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe" --remote-debugging-port=0 --remote-debugging-address=127.0.0.1
```

---

## 🗑️ 卸载

双击运行 `uninstall.bat`，或在 Antigravity 插件设置中关闭 `Context Pill` 并删除 `%USERPROFILE%\.gemini\config\plugins\context-pill`。

## 📄 License

[MIT](LICENSE)
