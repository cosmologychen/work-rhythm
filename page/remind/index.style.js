export const COLORS = {
  bg: 0x1a1a2e,
  primary: 0x00e676,
  accent: 0x00bcd4,
  arcRing: 0x00e676,
  arcTrack: 0x2a2a3e,
  white: 0xffffff,
  black: 0x000000,
  textPrimary: 0xffffff,
  textSecondary: 0xaaaaaa,
  // 长按按钮无底色（黑底=无底色），只留白字，进度由外围 ARC 圆环表达
  btnNormal: 0x000000,
  btnPress: 0x000000,
  // 暂停 1.5 小时超时提醒
  pauseTitle: 0xffb300, // 暂停标题黄
  pauseStop: 0xf44336, // 下班红
  pauseStopPress: 0xd32f2f,
  pauseResume: 0x4caf50, // 继续绿
  pauseResumePress: 0x388e3c,
}

// 各阶段顶部提示文案已迁移至 page/i18n 词条（remind_prompt_work/log/break），
// 由 remind/index.js 通过 getText 读取。

export const LAYOUT = {
  screenW: 480,
  screenH: 480,
  centerX: 240,

  phaseTextY: 90,
  phaseTextSize: 30,
  phaseTextH: 48,

  // 圆形长按按钮
  btnDiameter: 200,
  btnX: 140, // centerX - diameter/2
  btnY: 140, // centerY - diameter/2
  btnTextSize: 32,

  // 叠加在按钮上方的圆环进度 ARC（比按钮略大）
  arcSize: 220,
  arcX: 130, // centerX - arcSize/2
  arcY: 130,
  arcLineWidth: 8,
  arcStartAngle: -90, // 从正上方开始，0 度为三点钟方向

  progressTextY: 382,
  progressTextSize: 22,
  progressTextH: 32,

  // ===== 暂停 1.5 小时超时提醒 =====
  pauseTitleY: 140,
  pauseTitleSize: 28,
  pauseTitleH: 44,
  pauseSubTitleY: 196,
  pauseSubTitleSize: 24,
  pauseSubTitleH: 40,
  // 两枚圆角按钮水平并排（圆屏安全区内）
  pauseBtnW: 180,
  pauseBtnH: 70,
  pauseBtnGap: 24,
  pauseBtnX0: 48, // (480 - 180*2 - 24) / 2
  pauseBtnX1: 252, // x0 + w + gap
  pauseBtnY: 300,
  pauseBtnRadius: 18,
  pauseBtnTextSize: 28,

  // 震动节奏（毫秒）
  vibrateIntervalMs: 2000,
  // 长按进度刷新间隔（毫秒）
  progressRefreshMs: 50,
  // 超时自动完成（毫秒），与提醒页 3 分钟高亮/息屏保护对齐
  timeoutMs: 3 * 60 * 1000,
}