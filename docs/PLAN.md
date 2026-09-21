# 系统配置编辑工具 — 实施计划

> 目标:为 `D:\project\work\develpment` 离子注入机系统的 `SystemConfig.json` 提供一个直观、快速、带完整字段说明的桌面编辑工具。

---

## 0. 关键事实(已验证)

| 项目                | 内容                                                                                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 根节点类            | `SystemConfigModel`(不是 `SystemConfigProvider`,后者字段集不一致)                                                                                                                                                                  |
| 顶层子配置数量      | **10 个**(非 11)                                                                                                                                                                                                                   |
| 顶层子配置列表      | `SoftwareConfig` / `LoopMasterConfig` / `DoseControlConfig` / `IonSourceControlConfig` / `PLCControlConfig` / `BokePumpSerialPortConfig` / `TemperatureControllerConfig` / `ChillerConfig` / `IHCConfig` / `WarningSettingsConfig` |
| JSON 序列化器       | Newtonsoft.Json(顶层只用到单值/对象/数组,`JSON.parse` 即可 round-trip)                                                                                                                                                             |
| 文件落盘路径        | `<DataRoot>/Config/SystemConfig.json`,`DataRoot` 由 `<configDir>/path_config.json` 配置,默认 `D:/IonImplantationSystemData`                                                                                                        |
| 只读字段(init-only) | 5 个:`AnalogTypeConfig.MinValue`、`PowerTypeConfig.ControlMinValue/ControlMaxValue/LoadMinValue/LoadMaxValue`、`ControllerTypeConfig.MinValue/MaxValue`                                                                            |
| 空类                | `IonSourceControlConfig`(生成器必须兼容)                                                                                                                                                                                           |
| 字段总数估计        | 500~700(含 `SoftwareConfig` 200+ 字段)                                                                                                                                                                                             |
| 复用子类型          | 7 种:`SwitchTypeConfig` / `AnalogTypeConfig` / `DigitalTypeConfig` / `PowerTypeConfig` / `ControllerTypeConfig` / `FaradayCupTypeConfig` / `TurboPumpTypeConfig`                                                                   |

---

## 1. PRD(产品需求文档)

### 1.1 背景

当前 `SystemConfig.json` 用文本编辑器裸改,痛点:

1. 字段名无自描述性(`V51` / `FilaIHC` / `\\.\MMIPAR0`),新人改不动;
2. 嵌套层级深(`SoftwareConfig` 一个就 200+ 字段),找不到目标;
3. 改完不知道哪些字段变了,容易漏改、误改;
4. 字段间有耦合(如 `IHCConfig.MappingConfigs` 受 `SoftwareConfig.FilaIHC.LoadMaxValue` 约束),单点改可能引发连锁问题;
5. 主程序运行时 JSON 持续被改,工具若并发写入易冲突。

### 1.2 目标用户

- **主要**:离子注入机调试工程师、运维人员(对硬件点位不熟悉,但需要调参)
- **次要**:新加入项目的开发者,需要快速理解每个字段含义

### 1.3 核心功能

1. **可视化树形浏览** `SystemConfig.json`,左侧树 + 右侧编辑面板
2. **每个字段附中文说明**,说明来源 = XML 注释 + 行内注释 + 命名启发 + 引用站点扫描
3. **多种删除能力**:整块删、按模式删、树视图框选
4. **修改高亮**:默认黑、改过橙、删过灰
5. **手动保存 + 变更清单确认 + 自动备份**(只备份真有变化)
6. **磁盘实时监控**(5 秒一次),外部修改时弹窗警告
7. **主程序检测**:运行中则标题栏红字,保存时再次确认
8. **启动密码 `admin123` 写死**
9. **字段校验**:警告但不阻止,规则来自 schema
10. **schema 双轨维护**:工具内置编辑器 + 外部 JSON 编辑器
11. **列表字段表格化**(+/- 增删)
12. **快捷键**:Ctrl+Shift+F 命令面板;显示已修改按钮

### 1.4 成功标准

- 一个新工程师 5 分钟内能改完任一字段
- 保存后能 100% 还原到保存前的状态(备份机制)
- 字段说明覆盖率 ≥ 80%(自动挖出)
- 误操作可一键从备份回滚
- 单文件加载时间 < 1 秒
- 修改后保存 + 备份生成 < 500ms

---

## 2. 架构

### 2.1 进程模型

```
┌─────────────────────────────────────────────────────────────────┐
│                    Electron 主进程 (Node.js)                       │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────────────────┐ │
│  │ file-handlers │  │ schema-handlers │  │ process-handlers     │ │
│  │ - read JSON   │  │ - load schema   │  │ - scan IonImpl..exe  │ │
│  │ - write JSON  │  │ - reload schema │  │ - return PID list    │ │
│  │ - list bak    │  │ - validate      │  └──────────────────────┘ │
│  │ - restore bak │  └────────────────┘                            │
│  │ - watch disk  │  ┌────────────────┐                            │
│  │ - rotate bak  │  │ auth.ts         │                            │
│  └──────────────┘  │ - check admin123│                            │
                       └────────────────┘                            │
│                                                                   │
│         ▲                                       ▼                  │
│    contextBridge  ←──── IPC ─────→  Renderer (Chromium)           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  Vue 3 渲染端 (Renderer)                          │
│  ┌─────────────────────┐    ┌──────────────────────────────────┐ │
│  │  Pinia Stores       │    │  Views                           │ │
│  │  - config.ts        │    │  - LoginView                     │ │
│  │  - schema.ts        │    │  - FilePickerView                │ │
│  │  - ui.ts            │    │  - EditorView                    │ │
│  └─────────────────────┘    │  - SchemaEditorView              │ │
│                              └──────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Components                                                  │ │
│  │  - ConfigTree, EditPanel, SearchBar, ChangeListDialog,       │ │
│  │  - DeleteConfirmDialog, ArrayTableEditor, CommandPalette    │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Utils (纯函数,可独立单测)                                     │ │
│  │  - json-path, diff, validation, template-merge               │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 IPC 契约(`preload` 暴露给 `window.api`)

```ts
window.api = {
  auth: {
    check(pwd: string): boolean          // 始终返回 true 当 pwd === 'admin123'
  },
  file: {
    pickDirectory(): string | null     // Electron dialog.showOpenDialog
    readJson(path: string): JsonValue
    writeJson(path: string, data: JsonValue): { ok: boolean; backupPath?: string; error?: string }
    listBackups(dir: string): string[]
    restoreBackup(backupPath: string, targetPath: string): { ok: boolean }
    watchStart(path: string): void    // 内部 chokidar
    watchStop(): void    onFileChange(cb: (event) => void): () => void    // 取消订阅函数
  },
  schema: {
    load(toolDir: string): Schema
    save(schema: Schema): void        // 写入 <toolDir>/schema.json
    reload(): Schema
    validate(value: JsonValue, fieldPath: string): ValidationResult[]
  },
  process: {
    detectMainProgram(): { running: boolean; pids: number[] }
  }
}
```

### 2.3 状态管理(Pinia)

- `config.ts`:当前打开的 JSON、原始快照(会话开始时)、变更集合(dirty map by JSONPath)、修改高亮状态
- `schema.ts`:已加载的 schema、当前显示用的合并视图(模板 + 覆盖)
- `ui.ts`:搜索关键词、命令面板开关、对话框栈、当前选中路径、左侧树展开状态

### 2.4 项目结构

```
D:\project\配置文件管理工具\
├── docs\
│   └── PLAN.md                  ← 本文件
├── src\
│   ├── main\
│   │   ├── index.ts             # Electron 入口
│   │   ├── auth.ts              # admin123
│   │   └── ipc\
│   │       ├── file.ts          # read/write/backup/restore/watch
│   │       ├── schema.ts        # load/save/validate
│   │       └── process.ts       # ps-list 检测
│   ├── preload\
│   │   └── index.ts             # contextBridge 暴露 API
│   ├── renderer\
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── views\
│   │   │   ├── LoginView.vue
│   │   │   ├── FilePickerView.vue
│   │   │   ├── EditorView.vue
│   │   │   └── SchemaEditorView.vue
│   │   ├── components\
│   │   │   ├── ConfigTree.vue
│   │   │   ├── EditPanel.vue
│   │   │   ├── SearchBar.vue
│   │   │   ├── CommandPalette.vue
│   │   │   ├── ChangeListDialog.vue
│   │   │   ├── DeleteConfirmDialog.vue
│   │   │   ├── BackupRestoreDialog.vue
│   │   │   ├── ArrayTableEditor.vue
│   │   │   └── TopBar.vue
│   │   ├── stores\
│   │   │   ├── config.ts
│   │   │   ├── schema.ts
│   │   │   └── ui.ts
│   │   ├── utils\
│   │   │   ├── json-path.ts
│   │   │   ├── diff.ts
│   │   │   ├── validation.ts
│   │   │   └── template-merge.ts
│   │   ├── types\
│   │   │   └── config.d.ts
│   │   └── styles\
│   │       └── global.css
├── scripts\
│   └── extract-schema.mjs        # C# 静态分析器(独立脚本,Node 跑)
├── schema.json                  # 生成产物,跟工具一起发布
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── electron-builder.json
├── README.md
└── tests\
    ├── unit\
    │   ├── json-path.test.ts
    │   ├── diff.test.ts
    │   ├── validation.test.ts
    │   └── template-merge.test.ts
    └── e2e\
        ├── login.spec.ts
        ├── edit-save.spec.ts
        └── backup-restore.spec.ts
```

---

## 3. 技术文档

### 3.1 Electron 安全模型

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true` (除 preload 外)
- preload 仅暴露白名单 API(`window.api.*`)
- 渲染端所有文件操作通过 IPC 走主进程
- 远程内容禁用(`webPreferences.allowRunningInsecureContent: false`)

### 3.2 Schema 文件格式

位置:`<tool_install_dir>/schema.json`

**结构示例**:

```json
{
  "_meta": {
    "version": 1,
    "rootClass": "SystemConfigModel",
    "generatedAt": "2026-09-21T10:00:00Z",
    "generatorVersion": "1.0.0"
  },
  "_templates": {
    "SwitchTypeConfig": {
      "_desc": "开关量点位(双控双反馈)",
      "IsFirstCtrlInvert":     { "_type": "bool", "_desc": "一控取反" },
      "IsSecondCtrlInvert":    { "_type": "bool", "_desc": "二控取反" },
      "IsFirstFeedbackInvert": { "_type": "bool", "_desc": "一反馈取反" },
      "IsSecondFeedbackInvert":{ "_type": "bool", "_desc": "二反馈取反" }
    },
    "AnalogTypeConfig": { ... },
    "PowerTypeConfig":   { ... },
    "DigitalTypeConfig": { ... },
    "ControllerTypeConfig": { ... },
    "FaradayCupTypeConfig": { ... },
    "TurboPumpTypeConfig":  { ... }
  },
  "SoftwareConfig": {
    "_category": "上位机点位/量程配置",
    "DoorLock1": {
      "_useTemplate": "SwitchTypeConfig",
      "_instanceDesc": "1#门禁联锁"
    },
    "DoorLock2": { "_useTemplate": "SwitchTypeConfig", "_instanceDesc": "2#门禁联锁" },
    ...
    "Mfc1": {
      "_useTemplate": "ControllerTypeConfig",
      "_instanceDesc": "1#质量流量控制器",
      "_override": {
        "MaxValue": { "_max": 100, "_desc": "1#流量计特殊上限" }
      }
    },
    "ImplantElementConfigs": {
      "_type": "array",
      "_elementTemplate": {
        "Element":     { "_type": "string",  "_desc": "元素符号(如 Al+)" },
        "Mass":        { "_type": "number",  "_desc": "原子质量" },
        "ChargeNum":   { "_type": "int",     "_desc": "电荷数" }
      }
    }
  },
  "LoopMasterConfig": { ... },
  "DoseControlConfig": { ... },
  ...
}
```

**校验规则字段**:

- `_type`: `bool` | `int` | `double` | `string` | `enum` | `array` | `object`
- `_min` / `_max`:数值范围(仅 `int`/`double`)
- `_pattern`:正则表达式(仅 `string`)
- `_enum`:可选值数组(仅 `enum`)
- `_required`:是否必填(用于嵌套对象内的必填字段)
- `_readOnly`:只读,UI 不允许编辑(给 init-only 字段用)
- `_desc`:中文说明
- `_instanceDesc`:实例特定说明(挂在用了模板的子对象上)
- `_useTemplate`:指向 `_templates` 中的某个键
- `_override`:实例级字段覆盖

### 3.3 C# 静态分析器算法

输入:`D:\project\work\develpment\**\*.cs`
输出:`<output>/schema.json`

**核心流程**:

```
1. 扫描所有 .cs 文件
2. 用正则定位 class 定义 + class 体内大括号范围(配对算法)
3. 在每个 class 体内:
   a. 定位 /// XML 注释块(累积到当前属性)
   b. 定位 [属性] 标注 ([JsonIgnore] / [JsonProperty] 等)
   c. 定位属性声明:
      pattern: (注释|属性)? (修饰符)? 类型 _?名称 { get; (set|init)?; } [= 默认值];(注释)?
   d. 提取:字段名、类型、是否 init-only、默认值
4. 应用命名启发:
   - `Is*Enable` / `IsEnable*` → "{name}使能"
   - `*MinValue` → "{字段}最小值"
   - `*MaxValue` → "{字段}最大值"
   - `*DisplayUnit` → 自动保留单位字符串
   - `*IPAddress` → "{字段}IP 地址"
5. 引用站点扫描:
   a. 对每个未识别的字段(无 XML 注释、命名启发失效)
   b. grep `\.字段名` 在整个 solution 找引用点
   c. 取每个引用点的上下文(±3 行)
   d. 简单启发:出现 "IPAddress.Parse"、"new IPEndPoint" → "网络地址"
                  出现 "modbus"、"serial" → "串口配置"
                  出现 "TcpClient" → "TCP 地址"
6. 输出 schema.json
7. 用示例数据验证:对 SoftwareConfig 已有默认值,核对 schema 生成的字段集合与 JSON 反序列化后的字段集合一致
```

**正则片段**(示意):

```js
// 匹配 /// 注释块
/(?:\s*\/\/\/\s*(.*?)\n)+/g

// 匹配属性 [属性]
/\s*\[(Json\w+|Description\([^)]+\))\]/g

// 匹配属性声明
/(?:public|private|internal)\s+(readonly\s+)?(\w+(?:\?|<[^>]+>)?)\s+_?(\w+)\s*\{\s*get;\s*(set|init)?\s*;\s*\}\s*(=\s*([^;]+))?\s*;/g
```

### 3.4 删除机制

**三种删除模式的统一抽象**:

```
delete(targetPath, mode) where mode ∈ { block, pattern, multiSelect }
→ 返回: 被删字段路径列表 + 实际影响行数
→ 用户在弹窗里确认 → 确认后执行删除 → 标黄/灰色高亮
```

`multiSelect` 模式:用户在树视图里 shift+click 范围选择 或 cmd/ctrl+click 多选,工具累积一个 `selectedPaths: Set<string>`,删除时取这些路径。

`pattern` 模式:用户输入 `DoorLock*`,工具在树视图里 fuzzy 匹配所有以 `DoorLock` 开头的字段路径,列出供用户确认(默认全选,可手动剔)。

### 3.5 备份与恢复

**保存时**:

```
1. 计算 JSON 字符串(indent=2)
2. 比对与磁盘当前内容是否一致
   - 一致 → 不备份,不写入
   - 不一致 → 继续
3. 生成备份文件名:SystemConfig.YYYYMMDD_HHmmss.bak.json
4. 复制当前磁盘内容 → 备份文件
5. 写入新内容到原文件
6. 清理:删除超过 10 份的最旧备份
```

**恢复时**:

```
1. 列出目录下所有 .bak.json
2. 用户选一个
3. 把选中的 .bak 内容写回 SystemConfig.json
4. 同时为这次恢复本身生成一份备份(以防恢复错了)
```

### 3.6 磁盘监控

主进程用 `chokidar.watch(path, { usePolling: false, awaitWriteFinish: true })`,渲染端订阅 `onFileChange` 事件:

```
收到 external_modified 事件:
  - 弹窗:"⚠️ 磁盘文件已被外部修改"
  - 选项:[重新加载(丢弃当前未保存修改)] [忽略(继续编辑,标题栏红字)]
  - "重新加载" → 重新读 JSON,重置内存快照,清空 dirty 标记
  - "忽略" → 标题栏加红字"⚠️ 磁盘与内存不同步"
  - 若之后用户点保存,弹窗"磁盘已变,你的保存会覆盖外部改动,继续吗?"
```

### 3.7 主程序检测

主进程用 `ps-list` 或 `tasklist /FI "IMAGENAME eq IonImplantationSystem.exe"`:

```ts
import psList from 'ps-list'
const procs = await psList()
const running = procs.some((p) => p.name === 'IonImplantationSystem.exe')
```

> 注:实际进程名可能不一样,需要 grep 一下 `*.csproj` / `*.exe.config` / 解决方案中的 Program 类来确认确切名。

---

## 4. 任务清单(8 阶段,共 60+ 子任务)

每任务 1 commit,提交前必须有测试 + 通过 lint。

### Phase 1 — 基础设施(5 天)

- [ ] T1.1 初始化 `package.json`,安装 Electron + electron-vite + Vue 3 + TS + Naive UI + Pinia
- [ ] T1.2 配置 `electron.vite.config.ts`(主/preload/renderer 三段)
- [ ] T1.3 配 `tsconfig.json`(主/preload/renderer 分开)
- [ ] T1.4 配 ESLint + Prettier + lint-staged + husky
- [ ] T1.5 配 Vitest + Playwright
- [ ] T1.6 写 `electron-builder.json`(Windows nsis + 便携版双产物)
- [ ] T1.7 创建 README + 目录结构占位
- [ ] T1.8 写 CI 脚本(GitHub Actions:lint + build + test)

### Phase 2 — 纯函数工具库(3 天)

- [ ] T2.1 `json-path.ts` + 单测: get(path) / has(path) / set(path) / delete(path) / walk(path, fn)
- [ ] T2.2 `diff.ts` + 单测: diff(original, current) → Map<path, { oldValue, newValue, type: 'modify'|'delete' }>
- [ ] T2.3 `validation.ts` + 单测: validate(value, schemaField) → ValidationResult[];覆盖 5 种类型 + min/max/pattern/enum/required
- [ ] T2.4 `template-merge.ts` + 单测: mergeTemplate(instanceSchema, templates) → 展开后的实例 schema;支持 `_override`
- [ ] T2.5 工具库覆盖率验证 ≥ 90%

### Phase 3 — C# Schema 分析器(4 天)

- [ ] T3.1 `scripts/extract-schema.mjs` 框架(扫描 + 输出)
- [ ] T3.2 class 边界识别(class 定义 + 嵌套大括号配对)
- [ ] T3.3 XML 注释累积与归属
- [ ] T3.4 属性声明正则与字段提取(name, type, default, init-only)
- [ ] T3.5 `[JsonIgnore]` 处理(标记只读或不收录)
- [ ] T3.6 命名启发(中段翻译规则集)
- [ ] T3.7 引用站点扫描(对未识别字段 grep `.字段名`)
- [ ] T3.8 复用类型识别 → `_templates`(7 个子类型)
- [ ] T3.9 输出 schema.json
- [ ] T3.10 与现有 SystemConfig.json(若可访问)对比字段集合
- [ ] T3.11 手工校对未识别字段说明(我写一遍 README + script)

### Phase 4 — 主进程 IPC(3 天)

- [ ] T4.1 `auth.ts`:admin123 校验 + 启动密码框
- [ ] T4.2 `file.ts`:`pickDirectory`(Electron dialog)
- [ ] T4.3 `file.ts`:`readJson` / `writeJson`(fs.promises)
- [ ] T4.4 `file.ts`:备份生成 + 轮转(只保留 10)
- [ ] T4.5 `file.ts`:`listBackups` / `restoreBackup`
- [ ] T4.6 `file.ts`:`watchStart` / `watchStop` + `onFileChange` 订阅(chokidar)
- [ ] T4.7 `process.ts`:`detectMainProgram`(ps-list)
- [ ] T4.8 `schema.ts`:`load` / `save` / `reload` / `validate`
- [ ] T4.9 `preload/index.ts`:contextBridge 暴露白名单 API
- [ ] T4.10 启动 Electron 主进程 + 测试 IPC 双向通信

### Phase 5 — 渲染端基础 UI(5 天)

- [ ] T5.1 `App.vue` + 路由(vue-router)
- [ ] T5.2 `LoginView.vue`(密码输入 + admin123 校验)
- [ ] T5.3 `FilePickerView.vue`(选目录 + 记住上次路径)
- [ ] T5.4 `stores/config.ts`:打开/读取/快照/dirty 标记
- [ ] T5.5 `stores/schema.ts`:加载 + 模板合并
- [ ] T5.6 `stores/ui.ts`:搜索词 / 命令面板 / 对话框栈
- [ ] T5.7 `ConfigTree.vue`:左侧树(支持 10 个 sub-config)
- [ ] T5.8 `EditPanel.vue`:右侧编辑(单值 + 复杂类型)
- [ ] T5.9 `SearchBar.vue`:顶部搜索(中英文)
- [ ] T5.10 `CommandPalette.vue`:Ctrl+Shift+F 弹窗
- [ ] T5.11 修改高亮(默认黑/改过橙/删过灰)
- [ ] T5.12 "显示已修改"按钮
- [ ] T5.13 树虚拟滚动(vue-virtual-scroller,500+ 节点性能)

### Phase 6 — 对话框 + 关键交互(4 天)

- [ ] T6.1 `ChangeListDialog.vue`:保存前强制展示
- [ ] T6.2 `DeleteConfirmDialog.vue`:列出被删字段 + 二次确认
- [ ] T6.3 `BackupRestoreDialog.vue`:列 .bak + 选一个恢复
- [ ] T6.4 `ArrayTableEditor.vue`:列表字段表格 + +/-
- [ ] T6.5 "未识别字段"⚠️ 标签显示逻辑
- [ ] T6.6 "未收录字段"(JSON 有但 schema 没有)处理
- [ ] T6.7 "新增字段"操作(从 schema 选,直接用默认)
- [ ] T6.8 主程序运行检测 → 标题栏红字
- [ ] T6.9 磁盘监控弹窗(外部修改告警)
- [ ] T6.10 保存流程编排(变更清单 → 备份 → 写入)

### Phase 7 — Schema 编辑器(3 天)

- [ ] T7.1 `SchemaEditorView.vue`:左右分栏(模板列表 / 当前选中)
- [ ] T7.2 模板编辑 UI(`_templates` 中某项的字段增删改)
- [ ] T7.3 实例编辑 UI(某 sub-config 下挂的字段)
- [ ] T7.4 `_useTemplate` 选择器
- [ ] T7.5 `_override` 编辑器
- [ ] T7.6 校验规则 UI(_min / _max / _pattern / _enum / _required)
- [ ] T7.8 重载按钮 + 启动时加载

### Phase 8 — 收尾(2 天)

- [ ] T8.1 字段说明覆盖率审计:统计 ⚠️ 字段占比
- [ ] T8.2 整体 E2E 测试(打开 → 编辑 → 删除 → 备份 → 恢复)
- [ ] T8.3 性能测试(打开 500+ 字段 < 1s)
- [ ] T8.4 electron-builder 打包测试(产出 .exe)
- [ ] T8.5 桌面图标 + 安装程序截图
- [ ] T8.6 README 完善(用户使用手册)
- [ ] T8.7 提交首个 v0.1.0 tag

---

## 5. 风险登记表

| #   | 风险                                                                         | 等级 | 缓解                                                                                |
| --- | ---------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- |
| 1   | C# 正则分析器漏匹配复杂语法(嵌套泛型、Linq 表达式)                           | 中   | 限制输入:只匹配 `public T Name { get; set; }` 模式;失败字段标 ⚠️ 不收录             |
| 2   | 引用站点扫描误识别(如 `IsEnable` 在多处被读到,语义不一)                      | 中   | 只看同命名空间下的引用;阈值:出现 ≥ 3 处一致上下文才采纳                             |
| 3   | Electron 体积过大                                                            | 低   | electron-builder 配置 `asar` + 不打包 `node_modules` 中的 dev deps                  |
| 4   | 字段数 500+, 树渲染卡顿                                                      | 中   | vue-virtual-scroller 虚拟滚动;Pinia getter 缓存                                     |
| 5   | 主程序进程名猜测错                                                           | 中   | grep solution 的 `*.exe` + `.csproj` + Program.cs,实际验证                          |
| 6   | Newtonsoft.Json 序列化特殊格式(如 `ObservableCollection` 序列化为对象非数组) | 中   | 读取时 `JSON.parse` 试一遍,若失败回退到 `json5`;schema 标记特殊字段                 |
| 7   | 系统 JSON 中存在 BOM/非 UTF-8                                                | 低   | `fs.readFile` 用 `utf8` 选项,失败则 `utf16le` 重试                                  |
| 8   | 备份文件与原 JSON 命名冲突                                                   | 中   | 时间戳精确到秒 + 进程 PID 后缀(极端情况)                                            |
| 9   | 同时被两个工具实例打开                                                       | 低   | 工具启动时检测其他实例(读 .lock 文件或 Electron single-instance),若有则聚焦已有窗口 |
| 10  | chokidar 触发过于频繁                                                        | 中   | `awaitWriteFinish: { stabilityThreshold: 200 }` 防止边写边触发                      |
| 11  | JSON 文件极大导致 Electron dialog 卡顿                                       | 低   | 实测文件 ~50KB,远低于 Electron 单文件读取阈值                                       |
| 12  | 字段说明 80% 覆盖率难达到                                                    | 中   | 引用站点扫描 + 命名启发 + 我手工补一批关键字段说明;剩余 20% 用 ⚠️ 兜底              |
| 13  | 用户在 schema 编辑器里把 schema 改坏了,工具起不来                            | 中   | 工具启动时校验 schema JSON 合法性,失败则用上次正常 schema                           |
| 14  | `IonSourceControlConfig` 是空类,生成器生成空 sub-config                      | 低   | UI 提示"该大类暂无字段"                                                             |
| 15  | C# 源码扫描扫到 `bin/` `obj/` 中的副本                                       | 低   | `glob` 排除 `**/{bin,obj}/**`                                                       |
| 16  | `IHCConfig` 通过反射读 `SoftwareConfig`,删除字段可能破坏运行时               | 中   | 删除时弹窗明确提示"该字段被 IHCConfig 引用,删除会破坏运行时依赖";用户自决           |
| 17  | 工具启动后被 Windows Defender 误杀                                           | 低   | electron-builder 代码签名(后续);先 release unsigned                                 |
| 18  | macOS / Linux 兼容(用户当前仅 Windows)                                       | 低   | 暂只构建 Windows nsis;Linux 后续                                                    |
| 19  | 工具更新后旧 schema.json 不兼容                                              | 中   | schema 增加 `version` 字段;加载时检查版本,旧版做 migration                          |
| 20  | 备份累积满 10 份后用户想看历史                                               | 低   | 提供"备份列表"窗口,所有历史可查阅                                                   |

---

## 6. 明确不做(Out of Scope)

1. **多文件同时编辑**(Q14 选了 C = 一次一个文件)
2. **出厂默认对比**(Q9b 不要)
3. **运行时 IPC 热替换配置**(Q1 选了 B,不要 IPC)
4. **拖拽排序 / 拖拽移动字段**
5. **JSON Schema 标准兼容**(自己定义的格式,不做 Draft 7 compat)
6. **多语言 UI**(Q16b 中文为主)
7. **远程访问工具**
8. **Git 集成**(不依赖 git,只用 .bak 备份)
9. **macOS / Linux 构建**(Windows only)
10. **代码签名证书**(先 unsigned)
11. **自动更新机制**(用户手动下载新版)

---

## 7. 验证门(每个阶段必须通过的检查)

| 阶段    | 必须通过的验证                                                                |
| ------- | ----------------------------------------------------------------------------- |
| Phase 1 | `npm run dev` 能启动空白 Electron 窗口 + main/preload/renderer 三进程通信成功 |
| Phase 2 | 4 个工具库单测覆盖率 ≥ 90%;`npm run test` 全绿                                |
| Phase 3 | 生成的 schema.json 字段集合与 SystemConfigModel 反射字段一致(误差 < 2%)       |
| Phase 4 | IPC 单测 + 手工测试 9 个 IPC 通道                                             |
| Phase 5 | E2E 测试:登录 → 选目录 → 打开 JSON → 树视图正确(10 个顶层) → 搜索能搜到字段   |
| Phase 6 | E2E:编辑 → 保存 → 备份生成 → 恢复;删除三种模式各跑一遍                        |
| Phase 7 | 在工具内改 schema → 重载 → UI 反映新说明                                      |
| Phase 8 | electron-builder 产出 .exe + 启动 + 完整 E2E 一遍                             |

---

## 8. 时间估算

| Phase                       | 天数                  |
| --------------------------- | --------------------- |
| Phase 1 — 基础设施          | 5                     |
| Phase 2 — 纯函数工具库      | 3                     |
| Phase 3 — C# Schema 分析器  | 4                     |
| Phase 4 — 主进程 IPC        | 3                     |
| Phase 5 — 渲染端基础 UI     | 5                     |
| Phase 6 — 对话框 + 关键交互 | 4                     |
| Phase 7 — Schema 编辑器     | 3                     |
| Phase 8 — 收尾              | 2                     |
| **合计**                    | **29 工作日(≈ 6 周)** |

每个 Phase 之间留 1 天缓冲,合计 ~6.5 周。

---

## 9. 下一步

按 Phase 1 开始:初始化项目、配置工具链、跑通空白 Electron 窗口。每个 commit 都附带测试 + 通过 lint。

完成后我会:

1. 把 `D:\project\配置文件管理工具\schema.json` 第一版挖出来,
2. 让你过目字段说明覆盖情况,
3. 然后逐 Phase 推进。

> 状态:**计划已就绪,等待 Phase 1 启动信号**。
