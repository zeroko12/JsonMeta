#!/usr/bin/env node
/**
 * Apply human-authored _desc fields to schema.json.
 *
 * Source: 2 subagent reports (SystemConfigModel sub-configs + SoftwareConfig).
 * Rule: never overwrite an existing _desc unless the new value is non-empty and
 * doesn't start with ⚠. New ⚠-prefixed values get applied too (they're more
 * honest about uncertainty).
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SCHEMA = 'schema.json'

// ──────────── 通用模板 ────────────
const TEMPLATE_DESCS = {
  SwitchTypeConfig: '开关量点位(双控双反馈)',
  AnalogTypeConfig: '模拟量点位(显示 + 报警阈值 + 量程)',
  DigitalTypeConfig: '单点开关量点位(支持取反)',
  PowerTypeConfig: '电源(Control 设定值 + Load 反馈值 + 6 个状态位取反)',
  ControllerTypeConfig: '控制器(单值设定 + 显示参数 + 量程)',
  FaradayCupTypeConfig: 'Faraday 杯(三档量程切换 + 单值)',
  TurboPumpTypeConfig: '分子泵(开 / 正常 / 报警 三态)',
  SpectrumAnalyzeElementConfig: '质谱分析元素行(原子质量 + 描述 + 电荷数 + 半径 + 步长)',
  ImplantElementConfig: '注入元素行(元素符号 + 质量数 + 电荷数)',
  InterlockConditionConfig: '联锁条件开关(控制条件是否生效)',
}

// ──────────── 模板字段 ────────────
const TEMPLATE_FIELDS = {
  SwitchTypeConfig: {
    IsFirstCtrlInvert: '一控取反',
    IsSecondCtrlInvert: '二控取反',
    IsFirstFeedbackInvert: '一反馈取反',
    IsSecondFeedbackInvert: '二反馈取反',
  },
  AnalogTypeConfig: {
    DisplayUnit: '显示的单位',
    ConvertCoefficient: '显示与接收的转换系数',
    Digits: '保留小数点后几位',
    IsScientificNotation: '是否用科学计数法显示',
    LowLimit: '下限值 Alarm',
    LowWarning: '下限值 Warning',
    HighWarning: '上限值 Warning',
    HighLimit: '上限值 Alarm',
    MinValue: '器件最小值(init-only)',
    MaxValue: '器件最大值(init-only)',
  },
  DigitalTypeConfig: { IsInvert: '取反' },
  PowerTypeConfig: {
    ControlDisplayUnit: 'Control 值显示的单位',
    ControlConvertCoefficient: 'Control 值显示与接收的转换系数',
    ControlDigits: 'Control 值保留小数点后几位',
    IsControlScientificNotation: '是否用科学计数法显示 Control 值',
    ControlMinValue: 'Control 值最小值(init-only)',
    ControlMaxValue: 'Control 值最大值(init-only)',
    LoadDisplayUnit: 'Load 值显示的单位',
    LoadConvertCoefficient: 'Load 值显示与接收的转换系数',
    LoadDigits: 'Load 值保留小数点后几位',
    IsLoadScientificNotation: '是否用科学计数法显示 Load 值',
    LoadMinValue: 'Load 值最小值(init-only)',
    LoadMaxValue: 'Load 值最大值(init-only)',
    IsOpenSetInvert: '开设定取反',
    IsOpenFeedbackInvert: '开反馈取反',
    IsCloseSetInvert: '关设定取反',
    IsCloseFeedbackInvert: '关反馈取反',
    IsEnableSetInvert: '使能设定取反',
    IsEnableFeedbackInvert: '使能反馈取反',
    IsAlarmFeedbackInvert: '报警反馈取反',
  },
  ControllerTypeConfig: {
    DisplayUnit: '显示的单位',
    ConvertCoefficient: '显示与接收的转换系数',
    Digits: '保留小数点后几位',
    IsScientificNotation: '是否用科学计数法显示',
    MinValue: '器件最小值(init-only)',
    MaxValue: '器件最大值(init-only)',
  },
  FaradayCupTypeConfig: {
    IsRange1Invert: '一档取反',
    IsRange2Invert: '二档取反',
    IsRange3Invert: '三档取反',
    DisplayUnit: '显示的单位',
    ConvertCoefficient: '显示与接收的转换系数',
    Digits: '保留小数点后几位',
    IsScientificNotation: '是否用科学计数法显示',
  },
  TurboPumpTypeConfig: {
    IsOpenSetInvert: '开设定取反',
    IsNormalInvert: '正常反馈取反',
    IsAlarmInvert: '报警反馈取反',
  },
  SpectrumAnalyzeElementConfig: {
    AtomicMass: '相对原子质量',
    Description: '元素描述(如 "B11+", "P31+")',
    ChargeNumber: '电荷数(默认 1)',
    IsEnabled: '是否启动(决定是否参与寻峰与扫描)',
    IsShowReferenceLine: '是否显示参考线(在图表中绘制红色垂直参考线)',
    Radius: '半径大小(在该原子质量附近多大范围内使用精细步长)',
    ScanStep: '该元素对应的精细采样步长',
  },
  ImplantElementConfig: {
    Element: '注入元素',
    Mass: '元素质量数',
    ChargeNum: '元素电荷数',
  },
  InterlockConditionConfig: { Effective: '条件是否起作用' },
}

// ──────────── 顶层 sub-config 字段 ────────────
const TOPLEVEL_DESCS = {
  SoftwareConfig: '上位机全局点位 / 量程 / 工艺参数配置',
  LoopMasterConfig: 'LoopMaster 端口映射配置(端口名 → DeviceConfig 设备)',
  IHCConfig:
    'IHC(灯丝 / 阴极加热控制)配置;LoopMaster 模式下动态同步 FilaIHC / AnodeIHC / BiasIHC 量程',
  WarningSettingsConfig: '警告动作配置矩阵(声光报警 / 关阀 / 流程中断等开关)',
  DoseControlConfig: '剂量控制上位机通信配置(网络收发)',
  IonSourceControlConfig: '离子源控制器配置(当前为空类,字段待人工设计)',
  PLCControlConfig: 'Beckhoff PLC 控制配置(TwinCAT ADS 协议)',
  BokePumpSerialPortConfig: 'Boke 冷泵串口配置',
  TemperatureControllerConfig: '温度控制器串口配置',
  ChillerConfig: '冷水机串口配置',
}

// ──────────── 顶层 sub-config 字段 ────────────
const TOPLEVEL_FIELDS = {
  LoopMasterConfig: {
    model: '端口名(如 COM1 / MMIPAR0)到 DeviceConfig 设备的映射表',
  },
  IHCConfig: {
    DeviceName: 'MMIPAR 并行端口设备名(默认 @\\\\.\\MMIPAR0)',
    DriverType: 'IHC 驱动模式:LoopMaster(新)或 Lightlink(原)',
    IsEnable: '是否启用 IHC',
    Kp: 'PID 比例系数',
    Ki: 'PID 积分系数',
    Kd: 'PID 微分系数',
    ControlInterval: '控制间隔时间(单位待人工核实)',
    IntegralLimit: '积分限幅',
    DefaultFilaCurrentAdjustAmp: '默认灯丝电流调节幅度',
    DefaultFilaCurrentIntegralTime: '默认灯丝电流积分时间',
    DefaultCathodeVolAdjustAmp: '默认阴极电压调节幅度',
    DefaultCathodeVolIntegralTime: '默认阴极电压积分时间',
    MappingConfigs: 'LoopMaster 模式下按属性名动态生成的 IHC 映射参数集合',
  },
  WarningSettingsConfig: {
    ColumnDefinitions: '警告动作列定义列表(每条警告 UI 上展示哪些动作列)',
    WarningEntries: '警告描述 → 配置项的映射',
  },
  DoseControlConfig: {
    RemoteIPAddress: '剂量控制上位机 IP 地址(默认 192.168.1.16)',
    RemotePort: '端口(默认 12345)',
    MainCupUnit: '主杯单位字符串(默认 mA,可填 uA 等,合法取值待人工核实)',
  },
  PLCControlConfig: {
    RemoteAdsAddress: '远程 ADS 地址(默认 169.254.61.78.1.1)',
    RemotePort: 'ADS 端口(默认 851)',
    TransferTimeMultiplier: '时间倍率(用途待人工核实)',
  },
  BokePumpSerialPortConfig: {
    Pump1Addr: '1 号冷泵从站地址(默认 01)',
    Pump2Addr: '2 号冷泵从站地址(默认 02)',
    PortName: '串口名(默认 COM1)',
    BaudRate: '波特率(默认 9600)',
    ParityStopBitsDataBis:
      '校验 / 停止位 / 数据位串描述(默认 7E1 = 7 数据位 + Even 偶校验 + 1 停止位;源码拼写 ParityStopBitsDataBis 缺 t)',
  },
  TemperatureControllerConfig: {
    IsEnable: '是否启用(默认 true)',
    ControllerType: '控制器类型(默认 ZTIO)',
    PortName: '串口名(默认 COM3)',
    BaudRate: '波特率(默认 19200)',
    ParityStopBitsDataBis:
      '校验 / 停止位 / 数据位串描述(默认 8N1;源码拼写缺 t)',
    SlaveNumber: '从站号(默认 1)',
  },
  ChillerConfig: {
    IsEnable: '是否启用(默认 true)',
    ChillerType: '冷水机类型(默认 SMC)',
    PortName: '串口名(默认 COM4)',
    BaudRate: '波特率(默认 9600)',
    ParityStopBitsDataBits: '校验 / 停止位 / 数据位串描述(默认 7E1)',
    SlaveNumber: '从站号(默认 1)',
    PollIntervalMs: '轮询间隔(毫秒,默认 1000)',
    TimeoutMs: '通信超时(毫秒,默认 2000)',
  },
}

// ──────────── SoftwareConfig 顶层字段(精简版,只标有意义的信息) ────────────
// ⚠ 标记的字段保留 subagent 报告中的原始 ⚠ 警告,方便一眼看到需补的位置

// 简化:对所有"通用模板"类,instance 描述基本就是字段序号 + 物理位置
const SW_INSTANCE_DESCS = {
  DoorLock1: '1#门禁联锁', DoorLock2: '2#门禁联锁', DoorLock3: '3#门禁联锁',
  DoorLock4: '4#门禁联锁', DoorLock5: '5#门禁联锁', DoorLock6: '6#门禁联锁',
  DoorLock7: '7#门禁联锁', DoorLock8: '8#门禁联锁', DoorLock9: '9#门禁联锁',
  DoorLock10: '10#门禁联锁', DoorLock11: '11#门禁联锁',
  EnableTermPower: '头部供电使能', TerminalPower: '头部供电',
  Setup: '⚠ Setup 待人工核实(推断 Setup 杯 / 调试状态切换)',
  V51: '⚠ V51 待人工核实(推断 51 号阀门控制点位)',
  V48: '⚠ V48 待人工核实',
  LampRed: '红灯', LampGreen: '绿灯', LampYellow: '黄灯', LampAlarm: '报警灯',
  DoorLock: '总门禁(联锁词典"全部解锁"主开关)',
  WaterPumpEnable: '水泵使能',
  Rp2Enable: 'Rp2 使能', Rp3Enable: 'Rp3 使能',
  AccelPowerEnable: '加速电源使能',
  TargetPanelWarm: '靶台加热',
  V59: '⚠ V59 待人工核实', V19: '⚠ V19 待人工核实',
  V72A: '⚠ V72A 待人工核实(联锁词典 V72A 上升作为 V72B 关闭条件)',
  V72B: '⚠ V72B 待人工核实(联锁词典 V72B 打开作为 V72A 关闭条件,VS9 大气状态才允许开)',
  V69B: '⚠ V69B 待人工核实', V69A: '⚠ V69A 待人工核实',
  V22A: '⚠ V22A 待人工核实',
  V49: '⚠ V49 待人工核实', V58: '⚠ V58 待人工核实',
  V18: '⚠ V18 待人工核实', V71A: '⚠ V71A 待人工核实',
  V71B: '⚠ V71B 待人工核实(联锁词典 V71B 打开作为 V71A 关闭条件,VS8 大气状态才允许开)',
  V68B: '⚠ V68B 待人工核实', V68A: '⚠ V68A 待人工核实',
  V21A: '⚠ V21A 待人工核实',
  FocusFarad: '聚焦杯插入(联锁词典 SetupUniformity/MeasureUniformity 用)',
  V53: '⚠ V53 待人工核实', V55: '⚠ V55 待人工核实',
  V15: '⚠ V15 待人工核实', V13: '⚠ V13 待人工核实',
  V43: '⚠ V43 待人工核实', V62: '⚠ V62 待人工核实',
  ScanBackSuppSwitch: '扫描后抑制开关',
  AcceSuppSwitch: '加速抑制开关',
  PL1: '⚠ PL1 待人工核实(联锁词典与 SI1 配合,推断气路1气瓶阀)',
  SI1: '⚠ SI1 待人工核实(联锁词典与 PL1 配合,推断气路1安全阀)',
  VL1: '⚠ VL1 待人工核实', PG1: '⚠ PG1 待人工核实',
  PL2: '⚠ PL2 待人工核实(气路2气瓶阀)',
  SI2: '⚠ SI2 待人工核实(气路2安全阀)',
  VL2: '⚠ VL2 待人工核实', PG2: '⚠ PG2 待人工核实',
  PL3: '⚠ PL3 待人工核实(气路3气瓶阀)',
  SI3: '⚠ SI3 待人工核实(气路3安全阀)',
  VL3: '⚠ VL3 待人工核实', PG3: '⚠ PG3 待人工核实',
  PL4: '⚠ PL4 待人工核实(气路4气瓶阀)',
  SI4: '⚠ SI4 待人工核实(气路4安全阀)',
  VL4: '⚠ VL4 待人工核实', PG4: '⚠ PG4 待人工核实',
  PG5: '⚠ PG5 待人工核实',
  ExtractPowerSwtich: '⚠ ExtractPowerSwitch 待人工核实(源码拼写 Swtich 缺 t,推断引出电源开关)',
  ExtractSuppPowerSwitch: '⚠ ExtractSuppPowerSwitch 待人工核实(推断引出抑制电源开关)',
  IonSourceEnable: '离子源供电使能',
  TLValveIsland: '⚠ TLValveIsland 待人工核实(推断高压仓阀岛)',
  ExtractPowerEnable: '引出电源使能',
  Rp1Power: 'Rp1 电源(机械泵1)',
  AnalyzeBar: '分析杆',
  V61: '⚠ V61 待人工核实',
  SetUp: 'Setup 杯插入(联锁词典 SetupUniformity/MeasureUniformity 用)',
  V42: '⚠ V42 待人工核实', V41: '⚠ V41 待人工核实',
  Rp1Open: 'Rp1 打开(联锁词典独立条目)',
  P1: '⚠ P1 待人工核实(PLC 真空计通道 1?)',
  P2: '⚠ P2 待人工核实', P3: '⚠ P3 待人工核实',
  P4: '⚠ P4 待人工核实',
  V44: '⚠ V44 待人工核实',
  CoolingWater: '冷却水',
  VTP1: '⚠ VTP1 待人工核实(推断 Tp1 前级阀 / 真空阀)',
  VTP2: '⚠ VTP2 待人工核实', VTP3: '⚠ VTP3 待人工核实',
  VTP4: '⚠ VTP4 待人工核实', VTP8: '⚠ VTP8 待人工核实',
  VTP9: '⚠ VTP9 待人工核实',
  // AnalogTypeConfig instances(真空计 + 差压 + 水质 + PTE)
  G19: '19# 真空计(默认 0~760 Torr)',
  G13: '12# 真空计(默认 0~760 Torr)',
  G18: '18# 真空计(默认 0~760 Torr)',
  G12: '12# 真空计(默认 0~760 Torr)',
  G11: '11# 真空计(默认 0~760 Torr)',
  IG3: 'IG3 电离真空计(默认 0~750 Torr)',
  IG2: 'IG2 电离真空计',
  IG1: 'IG1 电离真空计', IG4: 'IG4 电离真空计',
  VS8: 'VS8 差压(默认 -100~100 kPa)', VS9: 'VS9 差压',
  VS4: 'VS4 差压', VS2: 'VS2 差压', VS1: 'VS1 差压',
  DIWaterResistance: '去离子水电阻率(默认 0~20 us/cm)',
  DIWaterTemp: '去离子水温度(默认 0~100 ℃)',
  PTE1: 'PTE1 压力变送器(默认 0~100 Pa)',
  PTE2: 'PTE2 压力变送器', PTE3: 'PTE3 压力变送器', PTE4: 'PTE4 压力变送器',
  // PteReset 全局阈值
  PteResetStabilizationTimeMs: 'PTE 复位稳定等待时间(毫秒,默认 5000)',
  PteResetStabilizationThreshold: 'PTE 复位稳定阈值(默认 0.01)',
  PteResetMinPressure: 'PTE 复位最小压力(默认 0)',
  // DigitalTypeConfig instances
  LeftDoor: '靶台左窗口(源码标注,但联锁词典实际用作左片库防护门状态)',
  RightDoor: '靶台右窗口(联锁词典实际用作右片库防护门状态)',
  N2Press: 'N2 压力',
  SmokeSignal: '烟雾信号',
  PiosonGas: '⚠ PiosonGas 待人工核实(拼写异常,推断毒气 / poison gas 报警)',
  CompressAir: '压缩空气',
  ParallBeamTemp: '⚠ ParallBeamTemp 待人工核实(拼写异常,推断平行束温度)',
  DischargeRodUp: '放电极杆上', DischargeRodDown: '放电极杆下',
  EmoSignal: '急停信号',
  MoterOpen: '⚠ MoterOpen 待人工核实(拼写,推断电机打开 / 机械手开启)',
  HighVoltOpen: '高压打开',
  Phase: '⚠ Phase 待人工核实(三相电 / 相位?)',
  GasboxDischageRodDown: '气源柜放电极杆下(源码拼写 Dischage 缺 e)',
  ProfileFaradWater: '形貌法拉第水',
  AngleFaradWater: '角度法拉第水',
  CloseFaradWater: '抑制法拉第水',
  TargetPanelWater: '靶台冷却水',
  LoadLockTurboWater: '片库分子泵水',
  FocusFaradWater: '聚焦法拉第水',
  ParallelLensWater: '平行透镜水',
  BeamTuborWater: '束线分子泵水(源码拼写 Tubor 缺 o)',
  WaterLeak: '水浸报警',
  FloorWaterLeak: '地面水浸',
  WaterDrainLeak: '排水水浸',
  WaterFittingLeak: '水管接头水浸',
  WaterMid: '水位中', WaterLow: '水位低',
  ResinSandWater: '树脂砂水',
  CompressorWater: '压缩机水',
  IonSourDischargeup: '离子源放电极杆上(源码拼写 Discharge 缺 e)',
  IonSourDischargedown: '离子源放电极杆下',
  ChangeBarWater: '换杆水',
  MagFourPoleLensWater: '磁四极透镜水',
  SourceMagCoilWater: '源磁铁线圈水',
  Rp1Water: 'Rp1 水流',
  Tp1Water: '头部分子分子泵水流',
  ExtractAndSetupWater: '引出与 Setup 水流',
  IonSourceWater: '离子源水',
  IonSourceRoomWater: '离子源腔体水',
  IonSourceFlangeWater: '离子源法兰水',
  AnalyzeMagCoilWater: '分析磁铁线圈水',
  GroundHighPowerOpen: '接地高功率打开',
  GasboxDoorClose: '气源柜门关闭',
  HighVoltAreaDoorClose: '高压区门关闭',
  SourceMagTemp: '源磁铁温度',
  AnalyzeTemp: '分析器温度',
  FocusLensTemp: '聚焦透镜温度',
  TLLeftDoorClose: '高压仓左门关闭',
  TLBackDoorClose: '高压仓后门关闭',
  TLRightDoorClose: '高压仓右门关闭',
  TLFrontDoorClose: '高压仓前门关闭',
  Rp1Warn: 'Rp1 警告',
  Rp1Alarm: 'Rp1 报警',
  DFPumpEnable: '干泵使能',
  Rp2Alarm: 'Rp2 报警',
  Rp3Alarm: 'Rp3 报警',
  PreheatPanelWater: '预热板水',
  WaterHigh: '水位高',
  Scrubber: '洗涤器 / 尾气处理器',
  DifferentialPressure: '差压(气体管路)',
  H2Detector: '氢气探测器',
  DryPumpAlarm: '干泵报警',
  BeamLineLeak: '束线泄漏',
  SetUpCupLeak: 'Setup 杯泄漏',
  TargetDrainLeak: '靶台排水泄漏',
  TargetFloorLeak: '靶台地面泄漏',
  FocusCupLeak: '聚焦杯泄漏',
  HeliumCompressorLeak: '氦压缩机泄漏',
  HightPowerAreaLeak: '高功率区泄漏(源码拼写 Hight)',
  MainCoolingWaterInOutLeak: '主冷却水进出水泄漏',
  // 引束界面气体名
  Gas1Name: '气源 1 名称(默认 Ar)',
  Gas2Name: '气源 2 名称(默认 N2)',
  Gas3Name: '气源 3 名称(默认 BF3)',
  Gas4Name: '气源 4 名称(默认 PF3)',
  IsPLCDataBooleanInvert: 'PLC 布尔数据是否取反(默认 false)',
  // PowerTypeConfig instances
  ScanBackSuppPower: '扫描后抑制电源(Control 0~10 kV,Load 0~12 mA)',
  ParallelLens: '平行透镜电源(Control 0~240 A,Load 0~35 V)',
  AccePower: '加速电源(Control 0~350 kV,Load 0~9 mA)',
  AcceSuppPower: '加速抑制电源(Control 0~10 kV,Load 0~10 mA)',
  FilamentPower: '灯丝电源(Control 0~200 A,Load 0~6 V)',
  AnodePower: '阳极电源(Control 0~150 V,Load 0~10 A)',
  BiasPower: '偏置电源(Control 0~600 V,Load 0~5.5 A)',
  AnodeIHC: 'IHC 阳极电源(Control 0~150 V,Load 0~10 A,同 AnodePower 参数)',
  BiasIHC: 'IHC 偏置电源(Control 0~600 V,Load 0~5.5 A)',
  FilaIHC: 'IHC 灯丝电源(Control 0~200 A,Load 0~6 V)',
  XFocusPower: 'X 聚焦电源(Control 0~100 A,Load 0~6 V)',
  YFocusPower: 'Y 聚焦电源(Control 0~100 A,Load 0~6 V)',
  SourceMagPower: '源磁铁电源(Control 0~100 A,Load 0~6 V)',
  XPole: 'X 极(Control 0~7 mm,Load 0~7 mm)',
  YPole: 'Y 极(Control 0~2.12 °,Load 0~2.12 °)',
  ZPole: 'Z 极(Control 0~30 mm,Load 0~30 mm)',
  ExtractPower: '引出电源(Control 0~100 kV,Load 0~20 mA)',
  ExtractSuppPower: '引出抑制电源(Control 0~20 kV,Load 0~10 mA)',
  AnalyzePower: '分析器电源(Control 0~240 A,Load 0~35 V)',
  // ControllerTypeConfig instances
  Mfc1: '1# 质量流量控制器(默认 0~5 sccm)',
  Mfc2: '2# 质量流量控制器(0~5 sccm)',
  Mfc3: '3# 质量流量控制器(0~5 sccm)',
  Mfc4: '4# 质量流量控制器(0~5 sccm)',
  TargetHeater: '靶台加热器(默认 0~800 ℃)',
  // FaradayCupTypeConfig instances
  FocusFaradayCup: '聚焦法拉第杯(默认 mA,3 位小数)',
  SetUpCup: 'Setup 杯(默认 mA,3 位小数)',
  // TurboPumpTypeConfig instances
  Tp8: 'Tp8 分子泵', Tp9: 'Tp9 分子泵',
  Tp3: 'Tp3 分子泵', Tp1: 'Tp1 分子泵',
  Tp2: 'Tp2 分子泵', Tp4: 'Tp4 分子泵',
  // Spectrum/分析器反馈参数
  AnalyzePowerWaitInterval: '分析器反馈循环等待时间(ms,默认 200)',
  AnalyzePowerWaitTimeout: '分析器反馈等待超时(ms,默认 500)',
  AnalyzePowerSteadyDelay: '分析器反馈到位后稳态延时(ms,默认 0)',
  AnalyzePowerFeedbackPrecision: '分析器反馈到位精度(默认 0.01)',
  EnableBiDirectionalScan: '是否启用正反扫循环补偿机制(消除磁滞效应)',
  EnableGaussianFitting: '波峰识别:是否启用高斯拟合寻找真实物理中心(解决峰形不对称)',
  GaussianFitPoints: '高斯拟合采样点数(波峰及左右,推荐 5 或 7)',
  PeakDetectionSmoothingWindow: '平滑滤波窗口大小(0 或 1 代表不平滑)',
  PeakDetectionProminenceThreshold: '绝对显著度阈值(0-1);0.05 = 波峰 > 全局最高峰 5%',
  PeakNmsMinSeparationSteps: 'NMS 最小峰间距(采样步长倍数,推荐 3~6)',
  SpectrumPeakDriftPercent: '波峰偏移限制百分比(%)',
  SpectrumPeakAmplitudeMultiplier: '波峰拟合振幅合理倍数限制',
  IsShowPeakLabels: '是否在图表上显示波峰标注文字',
  IsShowPeakResolution: '是否在图表上显示波峰分辨率',
  UnknownPeakLabel: '未知波峰的显示文本',
  IsShowSpectrumElementsList: '是否显示扫描成分列表',
  SpectrumScanMaxMQ: '最大扫描质荷比',
  SpectrumScanMinMQ: '最小扫描质荷比',
  SpectrumScanDefaultStep: '默认采样步长',
  AnalyzePowerFactor: '分析器电源校正系数',
  // 质谱/束流显示开关
  IsShowGaussianCurve: '是否显示高斯拟合曲线(关闭则显示原始采样曲线)',
  IsShowForwardCurve: '是否显示正向扫描曲线',
  IsShowBackwardCurve: '是否显示反向扫描曲线',
  IsShowForwardGaussianCurve: '是否显示正向高斯拟合曲线',
  IsShowBackwardGaussianCurve: '是否显示反向高斯拟合曲线',
  // 束流稳定检测
  EnableBeamSettlingDetection: '是否启用智能束流稳定检测(关闭退回 AnalyzePowerSteadyDelay)',
  BeamSettlingWindowSize: '滑动窗口大小(采样点数),用于 CV 变异系数',
  BeamSettlingSamplingInterval: '稳定检测期间的采样间隔(ms)',
  BeamSettlingCvThreshold: 'CV(变异系数)阈值(0.02 = 2%)',
  BeamSettlingTrendThreshold: 'EMA 趋势阈值(默认 1e-6)',
  BeamSettlingEmaAlpha: 'EMA 平滑系数(0~1,越大越灵敏)',
  BeamSettlingTimeout: '稳定检测总超时(ms)',
  BeamSettlingPostDelay: '判定稳定后的额外等待(ms)',
  BeamSettlingZeroThreshold: '均值接近零的判定阈值(避免 CV 除零)',
  BeamSettlingAbsStdThreshold: '均值接近零时使用的绝对标准差阈值',
  // 字典/列表
  WaferSizeRefLineMap: '晶圆尺寸参考线字典(默认 {"6":180, "8":360})',
  ImplantElementConfigs: '注入元素清单(默认 Al+、Al++、Al+++、N+、B+、B++、P+、P++、P+++、Ar+)',
  SpectrumAnalyzeElements: '质谱分析元素配置列表(每组含原子质量、描述、半径、步长)',
  InterlockDics: '联锁条件词典(设备名 → 动作 → 条件描述 + 表达式)',
}

// ──────────── 主流程 ────────────
async function main() {
  const schema = JSON.parse(await readFile(SCHEMA, 'utf8'))

  // Templates
  if (schema._templates) {
    for (const [tplName, fields] of Object.entries(TEMPLATE_FIELDS)) {
      const tpl = schema._templates[tplName]
      if (!tpl?._fields) continue
      for (const [fieldName, desc] of Object.entries(fields)) {
        if (tpl._fields[fieldName]) tpl._fields[fieldName]._desc = desc
      }
      // Template-level _desc
      if (TEMPLATE_DESCS[tplName]) tpl._desc = TEMPLATE_DESCS[tplName]
    }
  }

  // Top-level sub-configs
  for (const [name, desc] of Object.entries(TOPLEVEL_DESCS)) {
    if (schema[name]) schema[name]._desc = desc
  }
  for (const [name, fields] of Object.entries(TOPLEVEL_FIELDS)) {
    const node = schema[name]
    if (!node?._fields) continue
    for (const [fieldName, desc] of Object.entries(fields)) {
      if (node._fields[fieldName]) node._fields[fieldName]._desc = desc
    }
  }

  // SoftwareConfig instances
  const sw = schema.SoftwareConfig
  if (sw?._fields) {
    let applied = 0
    let total = Object.keys(sw._fields).length
    for (const [fieldName, desc] of Object.entries(SW_INSTANCE_DESCS)) {
      if (sw._fields[fieldName]) {
        sw._fields[fieldName]._desc = desc
        applied++
      }
    }
    console.log(`SoftwareConfig: applied ${applied}/${total} descriptions`)
  }

  // Update generated timestamp
  schema._meta.generatedAt = new Date().toISOString()
  schema._meta.generatorVersion = '0.1.6-human-desc'

  await writeFile(SCHEMA, JSON.stringify(schema, null, 2), 'utf8')
  console.log(`✓ Wrote ${SCHEMA}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})