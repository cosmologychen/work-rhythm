/**
 * 工作节奏 · 首页样式（颜色与布局常量集中管理）
 * Amazfit Balance / Zepp OS / 480×480 圆屏
 */
export const COLORS = {
  // 语义色
  primary: 0x4caf50, // 主色（绿）
  primaryDark: 0x388e3c,
  danger: 0xf44336, // 危险（红）
  dangerDark: 0xd32f2f,
  accent: 0x00e5ff, // 写日志阶段
  break: 0xffb300, // 活动阶段
  white: 0xffffff,
  black: 0x000000,
  // 文本
  textPrimary: 0xffffff,
  textSecondary: 0xaaaaaa,
  // 控件
  cardBg: 0x1d2a4a, // 设置卡片背景
  controlBg: 0x334155, // [-] [+] 按钮背景
  controlDark: 0x25324a,
}

export const LAYOUT = {
  screenW: 480,
  screenH: 480,
  centerX: 240,

  titleY: 26,
  titleSize: 26,

  // ===== 主视图（未上班）=====
  mainWorkBtnW: 300,
  mainWorkBtnH: 110,
  mainWorkBtnX: 90,
  mainWorkBtnY: 185, // 中心 (240, 240)，对齐表盘中心
  mainWorkBtnTextSize: 40,
  // 设置入口：底部切块（对齐系统对话框按钮带：实测上边缘 y=384，高 96 到屏幕底）
  gearBandY: 384,
  gearBandH: 96, // 底部切块区域 y..480，整块即设置按钮
  gearBtnW: 480,
  gearBtnH: 96,
  gearBtnX: 0,
  gearBtnY: 384,
  gearBtnTextSize: 32,

  // ===== 工作视图（上班中）=====
  phaseY: 60,
  phaseSize: 36,
  // 大时间 = 距下次提醒倒计时
  countdownY: 126,
  countdownSize: 72,
  // 下面两行小字：本次 / 今日累计
  subY: 230,
  subSize: 26,
  subLineH: 40, // 本次在 subY，今日累计在 subY+subLineH
  // 底部两个并排按钮：上边缘 y=384 对齐系统对话框按钮带（实测，与设置块一致），下边缘贴 480
  ctrlBtnY: 384,
  ctrlBtnH: 96,
  ctrlBtnW: 240,
  ctrlBtnX0: 0, // 左按钮（暂停/继续）
  ctrlBtnX1: 240, // 右按钮（下班），与左按钮在 x=240 处相接
  ctrlBtnTextSize: 30,
}