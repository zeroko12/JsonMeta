# 系统配置编辑工具

针对离子注入机控制软件 `SystemConfig.json` 的可视化编辑桌面工具。

## 功能

- **可视化树形浏览** 500+ 字段,左侧树 + 右侧编辑面板
- **每个字段附中文说明**(来源:XML 注释 + 行内注释 + 命名启发 + 引用站点扫描)
- **多种删除能力**:整块删、按模式删、树视图框选
- **修改高亮**(默认黑 / 改过橙 / 删过灰)
- **手动保存 + 变更清单确认 + 自动备份**(只备份真有变化)
- **磁盘实时监控**(5 秒一次),外部修改时弹窗警告
- **主程序检测**:运行中则标题栏红字
- **字段校验**:警告但不阻止,规则来自 schema
- **schema 双轨维护**:内置编辑器 + 外部 JSON 编辑器
- **启动密码**:`admin123`

## 技术栈

- Electron 33 + electron-vite 2 + Vue 3 + TypeScript 5
- Naive UI + Pinia + vue-router
- chokidar(文件监控)
- ps-list(进程检测)
- Vitest + Playwright(测试)

## 开发

```bash
npm install           # 安装依赖
npm run dev           # 启动 Electron 开发模式(HMR)
npm run typecheck     # 类型检查
npm run test          # 单元测试
npm run lint          # ESLint
npm run format        # Prettier
```

## 构建

```bash
npm run build         # 编译产物到 out/
npm run build:win     # 打包成 NSIS 安装包 + portable exe
```

## 目录结构

```
src/
  main/              # Electron 主进程
  preload/           # preload 脚本(contextBridge)
  renderer/          # Vue 3 渲染端
  shared/            # 主进程与渲染端共享类型
scripts/
  extract-schema.mjs # C# Schema 静态分析器
schema.json          # 字段说明元数据(随工具发布)
docs/
  PLAN.md            # 实施计划
```

## 状态

Phase 1 — 基础设施 ✅ 骨架已就绪
Phase 2 — 纯函数工具库 ⏳
Phase 3 — C# Schema 分析器 ⏳
Phase 4 — 主进程 IPC ⏳
Phase 5 — 渲染端基础 UI ⏳
Phase 6 — 对话框 + 关键交互 ⏳
Phase 7 — Schema 编辑器 ⏳
Phase 8 — 收尾 ⏳

详见 [docs/PLAN.md](docs/PLAN.md)
