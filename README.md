# 系统配置编辑工具

针对离子注入机控制软件 `SystemConfig.json` 的可视化编辑桌面工具。

## 功能特性

- ✅ **可视化树形浏览** 500+ 字段(左侧树 + 右侧编辑面板)
- ✅ **每个字段附中文说明**(来源:C# XML 注释 + 行内注释 + 命名启发)
- ✅ **多种删除能力**:整块删 / 按模式删 / 框选
- ✅ **修改高亮**(默认黑 / 改过橙 / 删过灰)
- ✅ **手动保存 + 强制变更清单确认 + 自动备份**(只备份真有变化)
- ✅ **磁盘实时监控**(5 秒一次),外部修改时弹窗警告
- ✅ **主程序检测**:运行中则标题栏红字,保存时再次确认
- ✅ **字段校验**:警告但不阻止,规则来自 schema
- ✅ **schema 双轨维护**:内置编辑器 + 外部 JSON 编辑器
- ✅ **启动密码**:`admin123`
- ✅ **Ctrl+Shift+F 命令面板**(快捷命令):打开文件 / 保存 / 撤销 / 仅显示已修改 / 备份 / 重载 / schema 编辑器等

## 技术栈

- Electron 33 + electron-vite 2 + Vue 3 + TypeScript 5
- Pinia
- chokidar(文件监控)+ ps-list(进程检测)
- Vitest(单元)+ Playwright(E2E)

## 安装依赖

```bash
npm install
```

## 开发

```bash
npm run dev                 # 启动 Electron 开发模式(HMR)
npm run typecheck           # vue-tsc 类型检查
npm run test                # 单元测试 (vitest, 127 tests)
npm run test:coverage       # 覆盖率
npm run test:e2e            # Playwright E2E (需先 npm run dev)
npm run lint                # ESLint
npm run format              # Prettier
npm run extract-schema      # 从 .NET 项目重新生成 schema.json
npm run audit-schema        # 统计字段说明覆盖率
```

## 构建 / 打包

```bash
npm run build               # 仅编译 out/ 目录
npm run build:win           # Windows nsis + portable 双产物(在 release/ 下)
```

## 使用流程

1. **登录**:启动后输入密码 `admin123`
2. **选目录**:点击"浏览",选择 SystemConfig.json 所在目录(默认 `D:/IonImplantationSystemData/Config/`)
3. **浏览**:左侧树显示 10 个顶层 sub-config(SoftwareConfig / IHCConfig 等),可展开
4. **搜索**:顶部搜索框(Ctrl+F 聚焦)按字段名/说明过滤
5. **修改**:点击字段 → 右侧编辑面板 → 修改 → 树节点变橙
6. **删除**:选中字段 → 点删除按钮 → 三种模式(整块 / 模式 / 框选)确认
7. **保存**:顶部"💾 保存" → 弹出变更清单 → 确认 → 自动备份 → 写盘
8. **恢复**:点"备份"按钮 → 列所有 `.bak.json` → 选一个恢复
9. **编辑 schema**:Ctrl+Shift+F → "打开字段说明编辑器" → 编辑说明并保存

## 目录结构

```
src/
  main/                 # Electron 主进程
  preload/              # preload 脚本(contextBridge)
  renderer/             # Vue 3 渲染端
    views/              # LoginView / FilePickerView / EditorView / SchemaEditorView
    components/         # ConfigTree / EditPanel / *Dialog / TopBar / SearchBar / CommandPalette
    stores/             # Pinia: config / schema / ui
  shared/               # 主进程与渲染端共享
    utils/              # json-path / diff / validation / template-merge
    csharp-parser/      # C# 源码静态分析器(tokenizer + schema-builder)
scripts/
  extract-schema.mjs    # C# Schema 提取脚本
schema.json             # 字段说明元数据(随工具发布)
tests/
  unit/                 # 单元测试
  e2e/                  # E2E 测试
  manual/               # 手动审计脚本
docs/
  PLAN.md               # 实施计划(8 阶段 / 60+ 任务)
```

## 字段说明覆盖率

`schema.json` 由 C# 源码自动生成,初始覆盖率约 15-20%。**剩余 80% 通过内置 schema 编辑器补充**:

1. 启动工具 → 登录 → 选文件
2. `Ctrl+Shift+F` 打开命令面板
3. 选择"打开字段说明编辑器"
4. 左侧选 sub-config 或模板 → 右侧填写 `_desc`(中文说明)
5. 点击"保存 schema"

可以反复 `npm run audit-schema` 跟踪覆盖率。

## 风险与限制

- 仅 Windows 平台(NSIS + portable 双打包格式)
- 密码硬编码(非真实认证,仅作轻量门槛)
- 字段说明覆盖率初始低,需要通过 schema 编辑器人工补充
- C# 解析器仅支持 .NET 6/8 写法,简化可见度(getter/setter body 等)

## 实施状态

| Phase | 内容                                                                                                   | 状态 |
| ----- | ------------------------------------------------------------------------------------------------------ | ---- |
| 1     | 基础设施                                                                                               | ✅   |
| 2     | 纯函数工具库(json-path / diff / validation / template-merge)                                           | ✅   |
| 3     | C# Schema 分析器 + extract-schema.mjs                                                                  | ✅   |
| 4     | 主进程 IPC(file / schema / auth / watch / process)                                                     | ✅   |
| 5     | 渲染端基础 UI(Login / FilePicker / Editor + Tree / Edit / Search / TopBar / CommandPalette)            | ✅   |
| 6     | 对话框 + 关键交互(ChangeListDialog / DeleteConfirmDialog / BackupRestoreDialog / ExternalChangeDialog) | ✅   |
| 7     | Schema 编辑器                                                                                          | ✅   |
| 8     | 收尾(E2E / 审计 / build)                                                                               | ✅   |

详见 [docs/PLAN.md](docs/PLAN.md)。
