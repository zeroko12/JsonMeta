#!/usr/bin/env node
/**
 * scripts/generate-system-meta.mjs
 *
 * Reads D:\IonImplantationSystemData\Config\SystemConfig.json
 * Generates comprehensive Chinese descriptions for every property node
 * based on C# models in D:\project\work\develpment.
 * Writes output to:
 * 1) D:\IonImplantationSystemData\Config\SystemConfig.meta.json
 * 2) d:\project\配置文件管理工具\schema.json (updates template and field docs)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SYSTEM_CONFIG_PATH = 'D:/IonImplantationSystemData/Config/SystemConfig.json';
const META_CONFIG_PATH = 'D:/IonImplantationSystemData/Config/SystemConfig.meta.json';
const SCHEMA_PATH = resolve('schema.json');

// 1. 顶层根模块说明
const ROOT_DESCRIPTIONS = {
  SoftwareConfig: '上位机全局点位、量程、工艺参数与联锁逻辑配置',
  LoopMasterConfig: 'LoopMaster 分布式总线端口映射与采集卡配置',
  DoseControlConfig: '剂量控制系统上位机网络通信配置',
  IonSourceControlConfig: '离子源控制系统通信与运行参数配置',
  PLCControlConfig: '倍福 (Beckhoff) PLC 控制系统通信与动作时序配置',
  BokePumpSerialPortConfig: '博开 (Boke) 低温冷泵串口通信配置',
  TemperatureControllerConfig: 'ZTIO 温度控制器串口通信配置',
  ChillerConfig: 'SMC 循环冷水机串口通信与监控配置',
  IHCConfig: 'IHC 阴极与灯丝加热闭环控制系统配置',
  WarningSettingsConfig: '全系统警告矩阵、报警阈值与安全联动动作配置'
};

// 2. 通用字段模板描述字典 (无论位于哪个对象下均适用的字段名定义)
const FIELD_TEMPLATE_DESCRIPTIONS = {
  // SwitchTypeConfig
  IsFirstCtrlInvert: '一控取反 (主控输出信号极性翻转)',
  IsSecondCtrlInvert: '二控取反 (副控输出信号极性翻转)',
  IsFirstFeedbackInvert: '一反馈取反 (主状态回读信号极性翻转)',
  IsSecondFeedbackInvert: '二反馈取反 (副状态回读信号极性翻转)',

  // AnalogTypeConfig / 通用模拟量
  DisplayUnit: '工程显示单位',
  ConvertCoefficient: '显示与原始采集值的转换系数',
  Digits: '显示保留小数位数',
  IsScientificNotation: '是否采用科学计数法显示',
  LowLimit: '下限报警阈值 (Low Alarm)',
  LowWarning: '下限预警阈值 (Low Warning)',
  HighWarning: '上限预警阈值 (High Warning)',
  HighLimit: '上限报警阈值 (High Alarm)',
  MinValue: '传感器或器件量程最小值',
  MaxValue: '传感器或器件量程最大值',

  // DigitalTypeConfig
  IsInvert: '信号极性取反',

  // PowerTypeConfig
  ControlDisplayUnit: '设定值工程显示单位',
  ControlConvertCoefficient: '设定值显示与采集转换系数',
  ControlDigits: '设定值显示保留小数位数',
  IsControlScientificNotation: '设定值是否采用科学计数法',
  ControlMinValue: '设定值量程允许最小值',
  ControlMaxValue: '设定值量程允许最大值',
  LoadDisplayUnit: '实际反馈值工程显示单位',
  LoadConvertCoefficient: '实际反馈值显示与采集转换系数',
  LoadDigits: '实际反馈值显示保留小数位数',
  IsLoadScientificNotation: '实际反馈值是否采用科学计数法',
  LoadMinValue: '实际反馈值量程允许最小值',
  LoadMaxValue: '实际反馈值量程允许最大值',
  IsOpenSetInvert: '开机输出设定信号取反',
  IsOpenFeedbackInvert: '开机反馈输入信号取反',
  IsCloseSetInvert: '关机输出设定信号取反',
  IsCloseFeedbackInvert: '关机反馈输入信号取反',
  IsEnableSetInvert: '电源使能设定信号取反',
  IsEnableFeedbackInvert: '电源使能反馈信号取反',
  IsAlarmFeedbackInvert: '电源报警反馈信号取反',

  // FaradayCupTypeConfig
  IsRange1Invert: '一档量程切换信号取反',
  IsRange2Invert: '二档量程切换信号取反',
  IsRange3Invert: '三档量程切换信号取反',

  // TurboPumpTypeConfig
  IsNormalInvert: '正常运行状态反馈取反',
  IsAlarmInvert: '故障报警状态反馈取反',

  // SpectrumAnalyzeElementConfig
  AtomicMass: '相对原子质量 (amu)',
  Description: '元素同位素描述 (如 B11+, P31+)',
  ChargeNumber: '离子电荷数',
  IsEnabled: '是否启用寻峰与扫描',
  IsShowReferenceLine: '是否在谱图上绘制红色垂直参考线',
  Radius: '该元素精细扫描步长影响半径',
  ScanStep: '该元素对应的精细采样步长',

  // ImplantElementConfig
  Element: '注入工艺元素符号',
  Mass: '元素质量数',
  ChargeNum: '元素电荷数',

  // InterlockConditionConfig
  Effective: '联锁判定条件是否起作用',

  // WarningSettingEntry
  LowBound: '模拟量报警触发下限阈值',
  HighBound: '模拟量报警触发上限阈值',
  SustainMs: '持续触发滤波时间 (ms, 避开瞬态波动)',
  IsUserCustom: '是否为用户自定义新增报警',
  IsShielded: '是否临时屏蔽该报警项',
  SignalKey: '关联监控的硬件信号标识',
  ModuleSource: '数据来源模块 (Beckhoff_PLC / CombineDataProvider 等)',
  DataType: '信号数据类型 (0=模拟量, 1=开关量/布尔)',
  PropertyPath: '数据源内部属性读取路径',
  TriggerType: '报警触发条件类型 (SustainedTrue / Event / OutOfRange 等)',
  AlarmStatusValue: '触发报警的目标状态值',
  Severity: '报警级别 (Alarm=严重停机 / Warning=常规警告 / None=无)',
  HasPrerequisite: '是否启用前置联锁校验',
  PrerequisiteSignalKey: '前置联锁信号键名',
  PrerequisitePropertyPath: '前置联锁属性路径',
  PrerequisiteTargetValue: '前置联锁所需满足的目标值',
  PrerequisiteExpression: '前置联锁动态计算表达式',
  TriggerExpression: '自定义触发逻辑动态计算表达式',

  // LoopMaster / Port / TypeWithConfig
  Value: '当前工程物理值',
  OriginValue: '底层采集卡原始采样码值 (AD/DA)',
  TransWay: '量程转换算法通道 (0=线性, 1=对数LG, 2=HG, 3=差压VS, 4=法拉第杯CUP)',
  boolsDouble: '布尔组合标志浮点编码值',
  Config: '底层采集卡通道硬件地址串 (板卡|槽位|类型|通道)',
  RightPhysicRange: '采集卡原始物理量程上限 (通常 65535)',
  LeftPhysicRange: '采集卡原始物理量程下限 (通常 0)',
  LeftLogicRange: '逻辑工程量程下限',
  RightLogicRange: '逻辑工程量程上限',
  HighLimitValue: '上限报警阈值 (High Alarm)',
  HighWarnningValue: '上限预警阈值 (High Warning)',
  LowWarningValue: '下限预警阈值 (Low Warning)',
  LowLimitValue: '下限报警阈值 (Low Alarm)',
  status: '通信与链路状态 (Norm / Fault / NoLink)',
  transStatus: '数据转换状态 (Norm / OverFlow)'
};

// 3. 动作矩阵 ActionSettings 键名描述
const ACTION_SETTINGS_DESCRIPTIONS = {
  Alarm: '声光报警 / 弹窗告警提示',
  PowerOff: '切断高压/关键电源',
  GasValveOff: '紧急关闭所有工艺气阀',
  BokePumpValveOff: '紧急关闭博开低温冷泵主阀',
  TurboPumpOff: '停止分子泵运行',
  DryPumpOff: '停止机械干泵运行',
  WaterPumpOff: '关闭循环水泵',
  LiquidConductivityOff: '去离子水水质超标保护断电',
  AutoProcessInterrupt: '紧急中断当前自动工艺流程',
  BeamlineOff: '关闭束线快门 / 切断离子束流',
  UnlockAllDoor: '紧急解锁全部区域安全门',
  StopLoadPort: '紧急停止晶圆片盒传输 (LoadPort)'
};

// 4. SoftwareConfig 261 项点位实例语义说明
const SOFTWARE_CONFIG_DESCRIPTIONS = {
  // 安全门禁与联锁
  EnableTermPower: '头部高压机柜总供电使能',
  TerminalPower: '头部高压机柜主电源总开关',
  DoorLock: '总门禁联锁 (一键解锁/锁定全部安全门主控)',
  DoorLock1: '1# 区域安全门禁联锁',
  DoorLock2: '2# 区域安全门禁联锁',
  DoorLock3: '3# 区域安全门禁联锁',
  DoorLock4: '4# 区域安全门禁联锁',
  DoorLock5: '5# 区域安全门禁联锁',
  DoorLock6: '6# 区域安全门禁联锁',
  DoorLock7: '7# 区域安全门禁联锁',
  DoorLock8: '8# 区域安全门禁联锁',
  DoorLock9: '9# 区域安全门禁联锁',
  DoorLock10: '10# 区域安全门禁联锁',
  DoorLock11: '11# 区域安全门禁联锁',
  LeftDoor: '靶台左侧窗口 / 左片库防护门安全状态',
  RightDoor: '靶台右侧窗口 / 右片库防护门安全状态',
  GasboxDoorClose: '气源柜安全门关闭状态信号',
  HighVoltAreaDoorClose: '高压区域安全门关闭状态信号',
  TLLeftDoorClose: '高压仓左侧安全门关闭状态信号',
  TLBackDoorClose: '高压仓后侧安全门关闭状态信号',
  TLRightDoorClose: '高压仓右侧安全门关闭状态信号',
  TLFrontDoorClose: '高压仓前侧安全门关闭状态信号',
  EmoSignal: '全系统急停开关 (EMO) 信号',
  GroundHighPowerOpen: '接地高功率隔离保护开关',
  HighVoltOpen: '高压总电源开启指示',

  // 指示灯与状态
  LampRed: '红灯指示控制 (故障与报警状态)',
  LampGreen: '绿灯指示控制 (正常运行状态)',
  LampYellow: '黄灯指示控制 (待机与提示状态)',
  LampAlarm: '声光蜂鸣报警器控制',

  // 真空阀门
  V13: '工艺气管路截止阀 V13',
  V15: '工艺气管路截止阀 V15',
  V18: '靶室粗抽旁路阀 V18',
  V19: '靶室分子泵前级主阀 V19',
  V21A: '1# 低温冷泵粗抽旁路阀 V21A',
  V22A: '2# 低温冷泵粗抽旁路阀 V22A',
  V41: '束线粗抽旁路阀 V41',
  V42: '束线粗抽隔离阀 V42',
  V43: '束线分子泵前级阀 V43',
  V44: '离子源粗抽旁路阀 V44',
  V48: '左片库分子泵主抽阀 V48',
  V49: '右片库分子泵主抽阀 V49',
  V51: '离子源分子泵主抽阀 V51',
  V53: '气路保护吹扫阀 V53',
  V55: '气路保护吹扫阀 V55',
  V58: '左片库粗抽主阀 V58',
  V59: '右片库粗抽主阀 V59',
  V61: '分析器真空隔离阀 V61',
  V62: '束线真空隔离阀 V62',
  V68A: '左片库 N2 充气阀 V68A',
  V68B: '左片库排气放气阀 V68B',
  V69A: '右片库 N2 充气阀 V69A',
  V69B: '右片库排气放气阀 V69B',
  V71A: '左片库上隔离插板门 V71A (上升开门)',
  V71B: '左片库下隔离门/充气门 V71B',
  V72A: '右片库上隔离插板门 V72A (上升开门)',
  V72B: '右片库下隔离门/充气门 V72B',
  VTP1: '1# 分子泵 (Tp1) 真空隔离阀',
  VTP2: '2# 分子泵 (Tp2) 真空隔离阀',
  VTP3: '3# 分子泵 (Tp3) 真空隔离阀',
  VTP4: '4# 分子泵 (Tp4) 真空隔离阀',
  VTP8: '8# 分子泵 (Tp8) 真空隔离阀',
  VTP9: '9# 分子泵 (Tp9) 真空隔离阀',

  // 气路气源与安全
  PL1: '1# 气源气瓶主供气阀 PL1',
  SI1: '1# 气路安全切断阀 SI1',
  VL1: '1# 气路分流调节阀 VL1',
  PG1: '1# 气路压力检测阀 PG1',
  PL2: '2# 气源气瓶主供气阀 PL2',
  SI2: '2# 气路安全切断阀 SI2',
  VL2: '2# 气路分流调节阀 VL2',
  PG2: '2# 气路压力检测阀 PG2',
  PL3: '3# 气源气瓶主供气阀 PL3',
  SI3: '3# 气路安全切断阀 SI3',
  VL3: '3# 气路分流调节阀 VL3',
  PG3: '3# 气路压力检测阀 PG3',
  PL4: '4# 气源气瓶主供气阀 PL4',
  SI4: '4# 气路安全切断阀 SI4',
  VL4: '4# 气路分流调节阀 VL4',
  PG4: '4# 气路压力检测阀 PG4',
  PG5: '总排气与吹扫管路压力检测阀 PG5',
  Gas1Name: '1# 气路工艺气体名称 (默认 Ar 氩气)',
  Gas2Name: '2# 气路工艺气体名称 (默认 N2 氮气)',
  Gas3Name: '3# 气路工艺气体名称 (默认 BF3 三氟化硼)',
  Gas4Name: '4# 气路工艺气体名称 (默认 PF3 三氟化磷)',
  N2Press: '高纯氮气供应气压正常信号',
  CompressAir: '压缩空气气压正常信号',
  DifferentialPressure: '管路气体压差计监测信号',
  H2Detector: '氢气 (H2) 泄漏检测报警信号',
  PiosonGas: '特种有毒气体泄漏检测报警信号',
  SmokeSignal: '电气柜/工作区烟雾火警探测信号',
  Scrubber: '尾气洗涤塔运行正常信号',

  // 冷却水与水浸泄漏
  WaterPumpEnable: '冷却水循环水泵运行使能',
  CoolingWater: '循环冷却水主管路水流正常信号',
  MainCoolingWaterInOutLeak: '主冷却水管路进出水漏水检测',
  WaterLeak: '全系统总水浸泄漏报警信号',
  FloorWaterLeak: '设备区地面水浸泄漏报警',
  WaterDrainLeak: '排水沟/排水分区水浸泄漏报警',
  WaterFittingLeak: '水管快插接头水浸泄漏报警',
  TargetDrainLeak: '靶台排水水浸泄漏报警',
  TargetFloorLeak: '靶台地面水浸泄漏报警',
  FocusCupLeak: '聚焦法拉第杯处水浸泄漏报警',
  SetUpCupLeak: 'Setup 调试杯处水浸泄漏报警',
  BeamLineLeak: '束线腔体区域水浸泄漏报警',
  HeliumCompressorLeak: '氦气压缩机管路泄漏报警',
  HightPowerAreaLeak: '高功率电气区水浸泄漏报警',
  WaterHigh: '冷却水箱高水位传感器信号',
  WaterMid: '冷却水箱中水位传感器信号',
  WaterLow: '冷却水箱低水位传感器信号',
  DIWaterResistance: '去离子水在线电阻率 (us/cm)',
  DIWaterTemp: '去离子水循环水温 (℃)',
  TargetPanelWater: '靶台冷却水流正常信号',
  PreheatPanelWater: '预热板冷却水流正常信号',
  IonSourceWater: '离子源总冷却水流正常信号',
  IonSourceRoomWater: '离子源放电室腔体水流正常信号',
  IonSourceFlangeWater: '离子源法兰冷却水流正常信号',
  ExtractAndSetupWater: '引出电极与 Setup 杯冷却水流正常信号',
  AnalyzeMagCoilWater: '分析磁铁励磁线圈冷却水流状态',
  SourceMagCoilWater: '源磁铁励磁线圈冷却水流状态',
  MagFourPoleLensWater: '四极透镜励磁线圈冷却水流状态',
  ChangeBarWater: '分析光栏换杆冷却水流信号',
  ParallelLensWater: '平行透镜线圈冷却水流信号',
  FocusFaradWater: '聚焦法拉第杯冷却水流信号',
  ProfileFaradWater: '形貌法拉第杯冷却水流信号',
  AngleFaradWater: '角度法拉第杯冷却水流信号',
  CloseFaradWater: '闭环抑制法拉第杯冷却水流信号',
  Tp1Water: '1# 束线分子泵冷却水流状态',
  BeamTuborWater: '束线分子泵循环冷却水流状态',
  LoadLockTurboWater: '片库分子泵循环冷却水流状态',
  ResinSandWater: '去离子水树脂砂过滤冷却水流',
  CompressorWater: '氦气压缩机冷却水流状态',
  Rp1Water: '1# 机械泵冷却水流状态',

  // 真空泵与机械泵
  Rp1Power: '1# 机械泵 (Rp1) 供电电源控制',
  Rp1Open: '1# 机械泵 (Rp1) 启动运行控制',
  Rp1Warn: '1# 机械泵运行预警信号',
  Rp1Alarm: '1# 机械泵故障报警信号',
  Rp2Enable: '2# 机械泵 (Rp2) 启动使能控制',
  Rp2Alarm: '2# 机械泵故障报警信号',
  Rp3Enable: '3# 机械泵 (Rp3) 启动使能控制',
  Rp3Alarm: '3# 机械泵故障报警信号',
  DFPumpEnable: '机械干泵启动使能控制',
  DryPumpAlarm: '机械干泵故障报警信号',
  Tp1: '1# 分子泵 (Tp1) 控制器参数',
  Tp2: '2# 分子泵 (Tp2) 控制器参数',
  Tp3: '3# 分子泵 (Tp3) 控制器参数',
  Tp4: '4# 分子泵 (Tp4) 控制器参数',
  Tp8: '8# 分子泵 (Tp8) 控制器参数',
  Tp9: '9# 分子泵 (Tp9) 控制器参数',

  // 真空计与压力变送器
  G11: '11# 皮拉尼真空计 (量程 0~760 Torr)',
  G12: '12# 皮拉尼真空计 (量程 0~760 Torr)',
  G13: '13# 皮拉尼真空计 (量程 0~760 Torr)',
  G18: '18# 皮拉尼真空计 (量程 0~760 Torr)',
  G19: '19# 皮拉尼真空计 (量程 0~760 Torr)',
  IG1: '1# 电离高真空计 (IG1, Torr)',
  IG2: '2# 电离高真空计 (IG2, Torr)',
  IG3: '3# 电离高真空计 (IG3, Torr)',
  IG4: '4# 电离高真空计 (IG4, Torr)',
  VS1: '1# 气体管路差压变送器 (VS1)',
  VS2: '2# 气体管路差压变送器 (VS2)',
  VS4: '4# 气体管路差压变送器 (VS4)',
  VS8: '8# 片库/阀门差压变送器 (VS8)',
  VS9: '9# 片库/阀门差压变送器 (VS9)',
  PTE1: '1# 高精度绝对压力变送器 (PTE1, 0~100 Pa)',
  PTE2: '2# 高精度绝对压力变送器 (PTE2, 0~100 Pa)',
  PTE3: '3# 高精度绝对压力变送器 (PTE3, 0~100 Pa)',
  PTE4: '4# 高精度绝对压力变送器 (PTE4, 0~100 Pa)',
  PteResetStabilizationTimeMs: 'PTE 压力传感器校零稳定等待时间 (ms)',
  PteResetStabilizationThreshold: 'PTE 压力传感器校零稳定判定波动阈值',
  PteResetMinPressure: 'PTE 允许校零的最大残余基底气压 (Pa)',
  P1: '1# PLC 压力计通道参数',
  P2: '2# PLC 压力计通道参数',
  P3: '3# PLC 压力计通道参数',
  P4: '4# PLC 压力计通道参数',

  // 机械运动与结构机构
  AnalyzeBar: '分析磁铁狭缝可调光栏杆控制',
  SetUp: 'Setup 调试法拉第杯气缸伸缩控制',
  FocusFarad: '聚焦法拉第杯气缸伸缩控制',
  DischargeRodUp: '放电保护极杆上升到位信号',
  DischargeRodDown: '放电保护极杆下降到位信号',
  GasboxDischageRodDown: '气源柜放电极接地保护杆下降到位信号',
  IonSourDischargeup: '离子源放电保护极杆上升到位信号',
  IonSourDischargedown: '离子源放电保护极杆下降到位信号',
  MoterOpen: '机械手与伺服电机驱动器上电使能',
  Phase: '三相动力电源相序正常信号',
  TLValveIsland: '高压仓气动阀岛电源使能',
  TargetPanelWarm: '靶台加热温控使能',
  Setup: '调试 Setup 状态/杯位模式切换开关',

  // 线包温度
  SourceMagTemp: '源磁铁励磁线圈温度传感器',
  AnalyzeTemp: '分析磁铁励磁线圈温度传感器',
  FocusLensTemp: '四极透镜励磁线圈温度传感器',
  ParallBeamTemp: '平行透镜偏转线包温度传感器',

  // 电源与调节器
  IonSourceEnable: '离子源主供电电源使能开关',
  AccelPowerEnable: '加速高压电源供电使能',
  ScanBackSuppSwitch: '扫描后抑制极电源输出开关',
  AcceSuppSwitch: '加速抑制极电源输出开关',
  ExtractPowerSwtich: '引出高压电源输出开关',
  ExtractSuppPowerSwitch: '引出抑制极高压电源输出开关',
  ExtractPower: '引出高压电源 (Control 0~100 kV, Load 0~20 mA)',
  ExtractPowerEnable: '引出高压电源总输出使能',
  ExtractSuppPower: '引出抑制电源 (Control 0~20 kV, Load 0~10 mA)',
  AccePower: '加速高压电源 (Control 0~350 kV, Load 0~9 mA)',
  AcceSuppPower: '加速抑制电源 (Control 0~10 kV, Load 0~10 mA)',
  FilamentPower: '离子源灯丝供电电源 (Control 0~200 A, Load 0~6 V)',
  AnodePower: '离子源阳极电源 (Control 0~150 V, Load 0~10 A)',
  BiasPower: '离子源阴极偏置电源 (Control 0~600 V, Load 0~5.5 A)',
  AnodeIHC: 'IHC 闭环模式阳极引弧电源 (0~150 V, 0~10 A)',
  BiasIHC: 'IHC 闭环模式阴极偏置电源 (0~600 V, 0~5.5 A)',
  FilaIHC: 'IHC 闭环模式灯丝加热电源 (0~200 A, 0~6 V)',
  SourceMagPower: '源磁铁励磁电源 (Control 0~100 A, Load 0~6 V)',
  AnalyzePower: '分析磁铁励磁电源 (Control 0~240 A, Load 0~35 V)',
  ParallelLens: '平行透镜电源 (Control 0~240 A, Load 0~35 V)',
  ScanBackSuppPower: '扫描后抑制极电源 (Control 0~10 kV, Load 0~12 mA)',
  XFocusPower: 'X 轴磁四极聚焦电源 (Control 0~100 A, Load 0~6 V)',
  YFocusPower: 'Y 轴磁四极聚焦电源 (Control 0~100 A, Load 0~6 V)',
  XPole: 'X 轴极靴位置调整机构 (0~7 mm)',
  YPole: 'Y 轴极靴旋转角度机构 (0~2.12 °)',
  ZPole: 'Z 轴极靴升降行程机构 (0~30 mm)',

  // 控制器与法拉第杯
  Mfc1: '1# 质量流量控制器 MFC1 (0~5 sccm)',
  Mfc2: '2# 质量流量控制器 MFC2 (0~5 sccm)',
  Mfc3: '3# 质量流量控制器 MFC3 (0~5 sccm)',
  Mfc4: '4# 质量流量控制器 MFC4 (0~5 sccm)',
  TargetHeater: '靶台加热控制器 (0~800 ℃)',
  FocusFaradayCup: '聚焦法拉第杯电流采集器 (单位 mA, 三档量程)',
  SetUpCup: 'Setup 调试法拉第杯电流采集器 (单位 mA, 三档量程)',

  // 质谱与束流分析
  AnalyzePowerWaitInterval: '分析磁铁电流检测轮询等待周期 (ms)',
  AnalyzePowerWaitTimeout: '分析磁铁电流调整到位超时时间 (ms)',
  AnalyzePowerSteadyDelay: '分析磁铁电流到位后的稳态等待延迟 (ms)',
  AnalyzePowerFeedbackPrecision: '分析磁铁电流到位允许公差精度',
  AnalyzePowerFactor: '分析磁铁电流与磁场标定校正系数',
  EnableBiDirectionalScan: '是否启用双向正反扫描消除磁滞回线误差',
  EnableGaussianFitting: '寻峰算法: 是否采用高斯拟合寻找物理峰值中心',
  GaussianFitPoints: '高斯拟合采用的数据点数 (推荐 5 或 7 点)',
  PeakDetectionSmoothingWindow: '谱图数据平滑滤波滑动窗口宽度',
  PeakDetectionProminenceThreshold: '谱图波峰识别显著度相对阈值 (0~1)',
  PeakNmsMinSeparationSteps: '非极大值抑制 (NMS) 最小峰间距步长数',
  SpectrumPeakDriftPercent: '允许的质荷比波峰漂移最大百分比 (%)',
  SpectrumPeakAmplitudeMultiplier: '波峰拟合高斯振幅合理倍数限制',
  IsShowPeakLabels: '谱图界面上是否标注识别出的离子成分标签',
  IsShowPeakResolution: '谱图界面上是否显示波峰半高宽 (FWHM) 分辨率',
  UnknownPeakLabel: '未识别杂质峰在图表上的显示文字',
  IsShowSpectrumElementsList: '是否在界面上展示所有预设扫描离子列表',
  SpectrumScanMaxMQ: '质谱扫描质荷比 (M/Q) 最大上限',
  SpectrumScanMinMQ: '质谱扫描质荷比 (M/Q) 最小下限',
  SpectrumScanDefaultStep: '质谱粗扫描默认步长',
  IsShowGaussianCurve: '是否在谱图上叠加高斯拟合平滑曲线',
  IsShowForwardCurve: '是否在谱图上显示正向扫描原始采样曲线',
  IsShowBackwardCurve: '是否在谱图上显示反向扫描原始采样曲线',
  IsShowForwardGaussianCurve: '是否在谱图上显示正向扫描高斯拟合曲线',
  IsShowBackwardGaussianCurve: '是否在谱图上显示反向扫描高斯拟合曲线',
  EnableBeamSettlingDetection: '是否启用基于变异系数的智能束流稳定判定',
  BeamSettlingWindowSize: '束流稳定判定滑动采样窗口大小',
  BeamSettlingSamplingInterval: '束流稳定判定采样周期 (ms)',
  BeamSettlingCvThreshold: '束流稳定变异系数 (CV) 判定阈值',
  BeamSettlingTrendThreshold: 'EMA 斜率趋势稳定判定阈值',
  BeamSettlingEmaAlpha: 'EMA 趋势滤波平滑因子 Alpha (0~1)',
  BeamSettlingTimeout: '等待束流稳定判定的最大超时时间 (ms)',
  BeamSettlingPostDelay: '判定束流稳定后的附加稳态保护延时 (ms)',
  BeamSettlingZeroThreshold: '判定束流接近零值的微小电流阈值',
  BeamSettlingAbsStdThreshold: '微电流状态下的绝对标准差阈值',
  IsPLCDataBooleanInvert: '倍福 PLC 交互布尔数据全局极性取反标志',
  WaferSizeRefLineMap: '晶圆尺寸图表参考线位置映射字典 (如 6寸、8寸)',
  ImplantElementConfigs: '工艺注入元素及其同位素物理参数清单',
  SpectrumAnalyzeElements: '质谱分析扫描元素精细步长与半径配置列表',
  InterlockDics: '全设备动态联锁判定逻辑与条件词典'
};

// 5. 其他顶层模块属性字段字典
const SUB_MODULE_FIELDS = {
  PLCControlConfig: {
    RemoteAdsAddress: '倍福 PLC 远程 ADS 路由网络地址 (默认 169.254.61.78.1.1)',
    RemotePort: 'TwinCAT ADS 通信端口号 (默认 851)',
    TransferTimeMultiplier: '晶圆传输运动时间倍率 (调速缩放因子)'
  },
  BokePumpSerialPortConfig: {
    Pump1Addr: '1# 博开冷泵 Modbus 从站地址 (默认 01)',
    Pump2Addr: '2# 博开冷泵 Modbus 从站地址 (默认 02)',
    PortName: '通信串口号 (默认 COM1)',
    BaudRate: '串口波特率 (默认 9600)',
    ParityStopBitsDataBis: '串口校验位/停止位/数据位配置 (默认 7E1: 7位数据+偶校验+1停止位)'
  },
  TemperatureControllerConfig: {
    IsEnable: '是否启用温控器通信 (默认 true)',
    ControllerType: '温控器硬件型号 (默认 ZTIO)',
    PortName: '通信串口号 (默认 COM3)',
    BaudRate: '串口波特率 (默认 19200)',
    ParityStopBitsDataBis: '串口校验位/停止位/数据位配置 (默认 8N1: 8位数据+无校验+1停止位)',
    SlaveNumber: 'Modbus 从站地址编号 (默认 1)'
  },
  ChillerConfig: {
    IsEnable: '是否启用冷水机通信 (默认 true)',
    ChillerType: '冷水机品牌型号 (默认 SMC)',
    PortName: '通信串口号 (默认 COM4)',
    BaudRate: '串口波特率 (默认 9600)',
    ParityStopBitsDataBits: '串口校验位/停止位/数据位配置 (默认 7E1)',
    SlaveNumber: '冷水机 Modbus 从站编号 (默认 1)',
    PollIntervalMs: '状态数据轮询采样周期 (毫秒, 默认 1000)',
    TimeoutMs: '通信应答超时时间 (毫秒, 默认 2000)'
  },
  DoseControlConfig: {
    RemoteIPAddress: '剂量控制上位机 IP 地址 (默认 192.168.1.16)',
    RemotePort: '网络通信端口号 (默认 12345)',
    MainCupUnit: '主法拉第杯束流显示工程单位 (默认 mA)'
  },
  IonSourceControlConfig: {},
  IHCConfig: {
    DeviceName: 'MMIPAR 并行总线硬件设备路径 (默认 \\\\.\\MMIPAR0)',
    DriverType: 'IHC 驱动模式: LoopMaster (新) 或 Lightlink (原)',
    IsEnable: '是否启用 IHC 闭环自动加热控制',
    Kp: 'PID 比例调节系数 Kp',
    Ki: 'PID 积分调节系数 Ki',
    Kd: 'PID 微分调节系数 Kd',
    ControlInterval: '闭环控制周期 (毫秒)',
    IntegralLimit: '积分限幅最大值',
    DefaultFilaCurrentAdjustAmp: '灯丝加热电流默认单次步进幅度 (A)',
    DefaultFilaCurrentIntegralTime: '灯丝加热电流默认积分时间 (s)',
    DefaultCathodeVolAdjustAmp: '阴极偏置电压默认单次步进幅度 (V)',
    DefaultCathodeVolIntegralTime: '阴极偏置电压默认积分时间 (s)',
    MappingConfigs: 'LoopMaster 模式下动态同步的 IHC 映射参数列表'
  },
  LoopMasterConfig: {
    model: '硬件点位端口名到设备采集卡配置 (DeviceConfig) 的映射表'
  },
  WarningSettingsConfig: {
    ColumnDefinitions: '警告响应处置动作列定义列表 (界面展示与开关矩阵列头)',
    WarningEntries: '全系统警告条目配置矩阵字典 (共收录 139+ 项系统级告警)'
  }
};

// 6. IHC MappingConfig 各属性说明
const IHC_MAPPING_FIELD_DESCRIPTIONS = {
  PropertyName: '绑定的 IHC 物理属性标识 (如 ArcVoltage, FilaCurrent)',
  DisplayName: '参数中文友好显示名称',
  ConvertCoefficient: '原始码值与工程量之间的转换系数',
  RawMin: '硬件采集信号量程下限',
  RawMax: '硬件采集信号量程上限',
  MappedMin: '物理工程量量程下限',
  MappedMax: '物理工程量量程上限',
  Digits: '显示保留小数位数',
  IsScientificNotation: '是否采用科学计数法'
};

// 7. LoopMaster 硬件端口内部子属性说明
const LOOPMASTER_PORT_DESCRIPTIONS = {
  port: '端口配置对象',
  status: '通信与物理链路状态 (Norm / Fault / NoLink)',
  transStatus: '数据转换与传输状态 (Norm / OverFlow)',
  'port.Type': '硬件端口采集驱动类型 (如 AnalogMonitorMatch, SwitchPort 等)',
  'port.Name': '点位名称',
  'port.port': '底层板卡物理通道配置 (TypeWithConfig)',
  'port.HighLimitValue': '上限报警阈值 (High Alarm)',
  'port.HighWarnningValue': '上限预警阈值 (High Warning)',
  'port.LowWarningValue': '下限预警阈值 (Low Warning)',
  'port.LowLimitValue': '下限报警阈值 (Low Alarm)',
  'port.controlSet': '控制器设定值通道',
  'port.controlFdbk': '控制器反馈值通道',
  'port.openSet': '开机设定通道',
  'port.openFdbk': '开机反馈通道',
  'port.closeSet': '关机设定通道',
  'port.closeFdbk': '关机反馈通道',
  'port.enableSet': '使能设定通道',
  'port.enableFdbk': '使能反馈通道',
  'port.alarmFdbk': '报警反馈通道',
  'port.loadSet': '负载设定通道',
  'port.loadFdbk': '负载反馈通道',
  'port.normal': '正常运行状态通道',
  'port.alarm': '故障报警通道',
  'port.range1': '一档量程切换通道',
  'port.range2': '二档量程切换通道',
  'port.range3': '三档量程切换通道',
  'port.current': '法拉第杯微电流采集通道',
  'port.firstCtl': '一控开关量输出通道',
  'port.secondCtl': '二控开关量输出通道',
  'port.firstFbk': '一反馈开关量输入通道',
  'port.secondFbk': '二反馈开关量输入通道'
};

// 主遍历生成逻辑
function generateDescriptions(jsonObj) {
  const descs = {};

  function record(path, text) {
    if (text && typeof text === 'string') {
      descs[path] = text.trim();
    }
  }

  // 1. 根级别
  for (const rootKey of Object.keys(jsonObj)) {
    if (ROOT_DESCRIPTIONS[rootKey]) {
      record(rootKey, ROOT_DESCRIPTIONS[rootKey]);
    }
  }

  // 2. 递归遍历整棵树
  function walk(node, currentPath = '') {
    if (node === null || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const itemPath = `${currentPath}.${i}`;
        const item = node[i];

        // 针对已知列表项赋予业务语义
        if (currentPath === 'SoftwareConfig.SpectrumAnalyzeElements') {
          const name = item.Description || `元素 #${i + 1}`;
          record(itemPath, `质谱分析元素配置项 [${name}]`);
        } else if (currentPath === 'SoftwareConfig.ImplantElementConfigs') {
          const name = item.Element || `元素 #${i + 1}`;
          record(itemPath, `工艺注入元素配置项 [${name}]`);
        } else if (currentPath === 'IHCConfig.MappingConfigs') {
          const name = item.DisplayName || item.PropertyName || `#${i + 1}`;
          record(itemPath, `IHC 映射参数配置项 [${name}]`);
        } else if (currentPath === 'WarningSettingsConfig.ColumnDefinitions') {
          const header = item.Header || item.Key || `#${i + 1}`;
          record(itemPath, `警告动作响应列定义 [${header}]`);
        }

        walk(item, itemPath);
      }
      return;
    }

    // 处理对象
    for (const [key, val] of Object.entries(node)) {
      const fieldPath = currentPath ? `${currentPath}.${key}` : key;
      const parts = fieldPath.split('.');
      const rootModule = parts[0];
      const parentKey = parts[parts.length - 2];

      // A. SoftwareConfig 的直接子节点 (261项)
      if (rootModule === 'SoftwareConfig' && parts.length === 2) {
        if (SOFTWARE_CONFIG_DESCRIPTIONS[key]) {
          record(fieldPath, SOFTWARE_CONFIG_DESCRIPTIONS[key]);
        }
      }

      // B. SoftwareConfig 节点内部属性
      else if (rootModule === 'SoftwareConfig' && parts.length >= 3) {
        if (FIELD_TEMPLATE_DESCRIPTIONS[key]) {
          record(fieldPath, FIELD_TEMPLATE_DESCRIPTIONS[key]);
        }
      }

      // C. 其他模块顶层直接属性
      else if (SUB_MODULE_FIELDS[rootModule] && SUB_MODULE_FIELDS[rootModule][key]) {
        record(fieldPath, SUB_MODULE_FIELDS[rootModule][key]);
      }

      // D. IHC MappingConfigs 内层属性
      else if (fieldPath.startsWith('IHCConfig.MappingConfigs.') && IHC_MAPPING_FIELD_DESCRIPTIONS[key]) {
        record(fieldPath, IHC_MAPPING_FIELD_DESCRIPTIONS[key]);
      }

      // E. LoopMasterConfig.model 节点处理
      else if (rootModule === 'LoopMasterConfig' && fieldPath.startsWith('LoopMasterConfig.model.')) {
        const afterModel = fieldPath.slice('LoopMasterConfig.model.'.length);
        const modelParts = afterModel.split('.');
        const pointName = modelParts[0];

        if (modelParts.length === 1) {
          // 设备映射根项
          const baseName = SOFTWARE_CONFIG_DESCRIPTIONS[pointName] || `${pointName} 点位`;
          record(fieldPath, `${baseName} (LoopMaster 硬件映射配置)`);
        } else {
          // 子属性处理
          const subProp = modelParts.slice(1).join('.');
          if (LOOPMASTER_PORT_DESCRIPTIONS[subProp]) {
            record(fieldPath, LOOPMASTER_PORT_DESCRIPTIONS[subProp]);
          } else if (FIELD_TEMPLATE_DESCRIPTIONS[key]) {
            record(fieldPath, FIELD_TEMPLATE_DESCRIPTIONS[key]);
          }
        }
      }

      // F. WarningSettingsConfig.WarningEntries 处理
      else if (rootModule === 'WarningSettingsConfig' && fieldPath.startsWith('WarningSettingsConfig.WarningEntries.')) {
        const afterEntries = fieldPath.slice('WarningSettingsConfig.WarningEntries.'.length);
        const warnParts = afterEntries.split('.');
        const alarmName = warnParts[0];

        if (warnParts.length === 1) {
          record(fieldPath, `【${alarmName}】系统警告处置规则与联动配置`);
        } else if (warnParts.length === 2 && warnParts[1] === 'ActionSettings') {
          record(fieldPath, `【${alarmName}】报警触发时的应急动作联动矩阵`);
        } else if (warnParts.length === 3 && warnParts[1] === 'ActionSettings') {
          const actionKey = warnParts[2];
          const actionDesc = ACTION_SETTINGS_DESCRIPTIONS[actionKey] || actionKey;
          record(fieldPath, `联动动作: ${actionDesc}`);
        } else if (FIELD_TEMPLATE_DESCRIPTIONS[key]) {
          record(fieldPath, FIELD_TEMPLATE_DESCRIPTIONS[key]);
        }
      }

      // G. 兜底匹配全局通用字段模板
      else if (FIELD_TEMPLATE_DESCRIPTIONS[key]) {
        record(fieldPath, FIELD_TEMPLATE_DESCRIPTIONS[key]);
      }

      // 递归子节点
      walk(val, fieldPath);
    }
  }

  walk(jsonObj);
  return descs;
}

// 执行主任务
function main() {
  console.log(`[generate-meta] Reading ${SYSTEM_CONFIG_PATH}...`);
  const rawText = readFileSync(SYSTEM_CONFIG_PATH, 'utf8');
  const configJson = JSON.parse(rawText);

  console.log(`[generate-meta] Parsing and generating Chinese descriptions...`);
  const descriptions = generateDescriptions(configJson);
  const totalKeys = Object.keys(descriptions).length;
  console.log(`[generate-meta] Successfully generated ${totalKeys} property descriptions!`);

  // 1. 写入伴生元数据文件
  const metaDoc = {
    _version: 1,
    descriptions,
    updatedAt: new Date().toISOString()
  };
  writeFileSync(META_CONFIG_PATH, JSON.stringify(metaDoc, null, 2), 'utf8');
  console.log(`[generate-meta] ✓ Successfully saved to ${META_CONFIG_PATH}`);

  // 2. 验证元数据覆盖情况
  let softwareConfigCount = 0;
  let loopMasterCount = 0;
  let warningCount = 0;
  for (const k of Object.keys(descriptions)) {
    if (k.startsWith('SoftwareConfig')) softwareConfigCount++;
    else if (k.startsWith('LoopMasterConfig')) loopMasterCount++;
    else if (k.startsWith('WarningSettingsConfig')) warningCount++;
  }
  console.log(`[generate-meta] Coverage breakdown:`);
  console.log(`  - SoftwareConfig: ${softwareConfigCount} paths`);
  console.log(`  - LoopMasterConfig: ${loopMasterCount} paths`);
  console.log(`  - WarningSettingsConfig: ${warningCount} paths`);
  console.log(`  - Other submodules: ${totalKeys - softwareConfigCount - loopMasterCount - warningCount} paths`);
}

main();
