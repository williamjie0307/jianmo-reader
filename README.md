# 简墨 · Jianmo Reader

面向 Windows 10 / 11 x64 的离线 Markdown 编辑器与阅读器。中文优先，支持多标签、编辑、分栏预览和阅读模式。

## 下载与安装

请在本仓库的 [Releases](../../releases) 下载 `Jianmo-Reader-1.2.0-Windows-x64-Setup.exe`，并对照同一版本的 SHA-256 校验文件。

关闭正在运行的简墨后安装；升级无需先卸载旧版。安装程序不会改写 Markdown 文件，仅在用户保存时写入编辑内容。

安装包未签名，Windows 可能提示未知发布者。请核对来源与校验值，不要为此关闭安全软件。

## 功能

- 新建、编辑、保存、另存为；未保存标签有提示，关闭前询问。
- Markdown 标题、列表、任务列表、表格、代码高亮及 KaTeX 数学公式。
- 多标签、文件夹树、大纲、查找替换、最近打开与阅读位置恢复。
- 明暗主题、字号、字体、行距及可调侧栏宽度。
- 普通保存保留可无损识别的 UTF-8 / UTF-16 / GB18030 编码、BOM 和换行风格；另存为 UTF-8。
- 磁盘外部变化不覆盖未保存编辑；冲突时可另存副本。

| 操作 | 快捷键 |
| --- | --- |
| 新建 / 打开 | Ctrl+N / Ctrl+O |
| 保存 / 另存为 | Ctrl+S / Ctrl+Shift+S |
| 查找 / 替换 | Ctrl+F / Ctrl+H |
| 粗体 / 斜体 | Ctrl+B / Ctrl+I |
| 侧栏 | Ctrl+Shift+B |
| 切换标签 | Ctrl+Tab / Ctrl+Shift+Tab |

## 数据与安全边界

文档在本机读写；没有遥测、登录、云同步或自动更新。远程图片不自动加载，文档脚本和嵌入网页不执行。HTTPS 链接经确认后交由系统浏览器打开。本机设置会保留路径、授权目录、阅读位置和最近记录，不缓存正文。

支持相对路径的常见位图；SVG 和绝对路径图片不加载。单文档上限 20 MiB，单图片 30 MiB，一次最多打开 100 个文件。

## 已知限制

编辑区是 Markdown 源码，不是所见即所得富文本。选中文字的字号/颜色以受限 HTML span 保存，其他平台可能忽略。没有自动草稿备份，崩溃前未保存内容无法恢复。Windows 安装/卸载、真实输入法、高 DPI 和系统文件关联仍需真机验证。

## 源码开发

需要 Node.js 22.12+。安装依赖及打包需要联网，应用使用无需联网。

```sh
npm ci
npx install-electron
npm run build
npm test
npm start
npm run dist:win
```

单元测试在 `test/`；真实 Electron UI 测试需要图形显示环境。`npm run dist:win` 生成 Windows x64 安装包，默认不上传发布。Linux 交叉打包脚本与 electron-builder 26.15.3 适配。

## 许可

本项目保留既有 [MIT 许可](LICENSE)。第三方组件采用各自许可，见 `THIRD-PARTY-LICENSES.txt`；Electron/Chromium 许可随安装包附带。
