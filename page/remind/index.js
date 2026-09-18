import { createWidget, widget, prop, align, event } from '@zos/ui'
import { home } from '@zos/router'
import { onKey, offKey, KEY_SELECT, KEY_EVENT_CLICK } from '@zos/interaction'
import { Vibrator, VIBRATOR_SCENE_TIMER } from '@zos/sensor'
import { setPageBrightTime, pausePalmScreenOff } from '@zos/display'
import { log } from '@zos/utils'
import { getText } from '@zos/i18n'
import { COLORS, LAYOUT } from './index.style'

const logger = log.getLogger('work-rhythm-remind')

let state = null // 状态机模块，build 时从 globalData 注入
let phase = null
let holdSec = 0

let vibrator = null

// 定时器统一管理，任何退出路径都要清空
const timers = [] // 存放所有 setTimeout/setInterval 的 id
let progressTimer = null // 长按进度刷新定时器（单独引用，便于 reset）
let completed = false // 完成流程防重入标志

// UI 引用
let phaseText = null
let arcWidget = null
let btnWidget = null
let progressText = null

// 长按状态
let pressStartTs = 0

function trackTimer(id) {
  timers.push(id)
  return id
}

function stopTimer(id) {
  if (id === null || id === undefined) {
    return
  }
  const idx = timers.indexOf(id)
  if (idx >= 0) {
    timers.splice(idx, 1)
  }
  clearTimeout(id)
  clearInterval(id)
}

function clearAllTimers() {
  for (let i = 0; i < timers.length; i++) {
    clearTimeout(timers[i])
    clearInterval(timers[i])
  }
  timers.length = 0
  progressTimer = null
}

function startVibrateLoop() {
  // 立即震一次，再进入 2 秒循环
  function pulse() {
    if (!vibrator) {
      return
    }
    try {
      // VIBRATOR_SCENE_TIMER 为闹钟级最高强度连续震动（单次长震 500ms 循环，需手动 stop）。
      // 定时重复 start() 作为保活，防止个别固件长时间后自动停止马达。
      vibrator.setMode(VIBRATOR_SCENE_TIMER)
      vibrator.start()
      logger.log('vibrate pulse TIMER') // 模拟器无马达，以此日志确认震动触发
    } catch (e) {
      logger.log(`vibrator error: ${e}`)
    }
  }
  pulse()
  trackTimer(setInterval(pulse, LAYOUT.vibrateIntervalMs))
}

function updateProgress() {
  if (pressStartTs === 0) {
    return
  }
  if (holdSec <= 0) {
    return
  }

  const elapsed = (Date.now() - pressStartTs) / 1000
  const ratio = Math.min(elapsed / holdSec, 1)

  // 更新 ARC 圆环（从正上方顺时针画）
  const arcEnd = LAYOUT.arcStartAngle + ratio * 360
  if (arcWidget) {
    try {
      arcWidget.setProperty(prop.MORE, {
        end_angle: arcEnd,
        start_angle: LAYOUT.arcStartAngle,
      })
    } catch (e) {
      logger.log(`arc update error: ${e}`)
    }
  }

  // 更新进度秒数文本（保留 1 位小数）
  if (progressText) {
    progressText.setProperty(
      prop.TEXT,
      getText('progress_text').replace('%s', elapsed.toFixed(1)).replace('%d', holdSec)
    )
  }

  // 进度满 → 完成
  if (ratio >= 1) {
    completeFlow()
  }
}

function startProgressRefresh() {
  if (progressTimer !== null) {
    return
  }
  progressTimer = trackTimer(
    setInterval(updateProgress, LAYOUT.progressRefreshMs)
  )
}

function cancelPress() {
  pressStartTs = 0
  if (progressTimer !== null) {
    stopTimer(progressTimer)
    progressTimer = null
  }
}

function completeFlow() {
  if (completed) {
    return
  }
  completed = true
  logger.log(`completeFlow: phase=${phase}`)

  clearAllTimers()
  if (vibrator) {
    try {
      vibrator.stop()
    } catch (e) {
      logger.log(`vibrator stop error: ${e}`)
    }
    vibrator = null
  }

  // 推进状态机并设置下一个 alarm
  try {
    const next = state.completePhase(phase)
    logger.log(`completePhase -> next phase=${next}`)
  } catch (e) {
    logger.log(`completePhase error: ${e}`)
  }

  home()
}

// ---------- 暂停 1.5 小时超时提醒 ----------
function buildPauseUI() {
  // 顶部标题
  createWidget(widget.TEXT, {
    x: 0,
    y: LAYOUT.pauseTitleY,
    w: LAYOUT.screenW,
    h: LAYOUT.pauseTitleH,
    text_size: LAYOUT.pauseTitleSize,
    text: getText('pause_timeout_title'),
    color: COLORS.pauseTitle,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
  })
  // 副标题
  createWidget(widget.TEXT, {
    x: 0,
    y: LAYOUT.pauseSubTitleY,
    w: LAYOUT.screenW,
    h: LAYOUT.pauseSubTitleH,
    text_size: LAYOUT.pauseSubTitleSize,
    text: getText('pause_timeout_sub'),
    color: COLORS.textPrimary,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
  })
  // 下班（红，圆角矩形）
  createWidget(widget.BUTTON, {
    x: LAYOUT.pauseBtnX0,
    y: LAYOUT.pauseBtnY,
    w: LAYOUT.pauseBtnW,
    h: LAYOUT.pauseBtnH,
    radius: LAYOUT.pauseBtnRadius,
    text: getText('btn_stop'),
    text_size: LAYOUT.pauseBtnTextSize,
    color: COLORS.white,
    normal_color: COLORS.pauseStop,
    press_color: COLORS.pauseStopPress,
    click_func: stopAndHome,
  })
  // 继续工作（绿，圆角矩形）
  createWidget(widget.BUTTON, {
    x: LAYOUT.pauseBtnX1,
    y: LAYOUT.pauseBtnY,
    w: LAYOUT.pauseBtnW,
    h: LAYOUT.pauseBtnH,
    radius: LAYOUT.pauseBtnRadius,
    text: getText('btn_continue_work'),
    text_size: LAYOUT.pauseBtnTextSize,
    color: COLORS.white,
    normal_color: COLORS.pauseResume,
    press_color: COLORS.pauseResumePress,
    click_func: resumeAndHome,
  })
}

// 下班并返回：停止震动，调用 state.stopWork() 保存有效工作时长（暂停期间不计入）
function stopAndHome() {
  if (completed) {
    return
  }
  completed = true
  logger.log('pause remind -> stop work')
  clearAllTimers()
  if (vibrator) {
    try {
      vibrator.stop()
    } catch (e) {
      logger.log(`vibrator stop error: ${e}`)
    }
    vibrator = null
  }
  try {
    state.stopWork()
  } catch (e) {
    logger.log(`stopWork error: ${e}`)
  }
  home()
}

// 继续工作并返回：调用 state.resumeWork() 重设阶段闹钟
function resumeAndHome() {
  if (completed) {
    return
  }
  completed = true
  logger.log('pause remind -> resume work')
  clearAllTimers()
  if (vibrator) {
    try {
      vibrator.stop()
    } catch (e) {
      logger.log(`vibrator stop error: ${e}`)
    }
    vibrator = null
  }
  try {
    state.resumeWork()
  } catch (e) {
    logger.log(`resumeWork error: ${e}`)
  }
  home()
}

// 3 分钟超时保护：未操作自动下班（帮忘记关表的用户保存之前有效工作时长）
function completePauseTimeout() {
  logger.log('pause remind timeout -> auto stop work')
  stopAndHome()
}

Page({
  build() {
    // 获取状态机模块（由 app 注入 globalData.state）
    try {
      const st = (getApp()._options.globalData || {}).state
      state = st || null
    } catch (e) {
      state = null
    }

    if (!state || typeof state.getState !== 'function') {
      logger.log('state module missing, exit')
      home()
      return
    }

    const cur = state.getState()
    // 未在工作：异常状态直接退出
    if (!cur.working) {
      logger.log(`not working: working=${cur.working}, exit`)
      home()
      return
    }

    // 暂停 1.5 小时超时唤醒：提醒用户是否下班，绝不能直接 home() 退出
    if (cur.paused) {
      logger.log('pause timeout wake-up, show pause remind')
      // 3 分钟高亮不熄屏，保证震动覆盖整个提醒窗口，并防止误碰息屏
      try {
        setPageBrightTime({ brightTime: LAYOUT.timeoutMs })
        pausePalmScreenOff({ duration: LAYOUT.timeoutMs })
      } catch (e) {
        logger.log(`display bright/palm keep-on error: ${e}`)
      }

      buildPauseUI()

      // 初始化震动并开始循环
      vibrator = new Vibrator()
      startVibrateLoop()

      // 表冠单击 = 下班（与超时自动下班行为一致）
      onKey({
        callback: (k, ev) => {
          if (k === KEY_SELECT && ev === KEY_EVENT_CLICK) {
            stopAndHome()
            return true
          }
          return false
        },
      })

      // 超时保护：3 分钟未操作自动下班（保存之前有效工作时长）
      trackTimer(setTimeout(completePauseTimeout, LAYOUT.timeoutMs))
      return
    }

    phase = cur.phase
    holdSec = state.getHoldSec(phase)
    if (!holdSec || holdSec <= 0) {
      logger.log(`invalid holdSec=${holdSec}, exit`)
      home()
      return
    }
    logger.log(`remind build: phase=${phase}, holdSec=${holdSec}`)

    // 提醒页保持 3 分钟高亮不熄屏（保证震动持续覆盖整个提醒窗口），并防止误碰息屏。
    try {
      setPageBrightTime({ brightTime: LAYOUT.timeoutMs })
      pausePalmScreenOff({ duration: LAYOUT.timeoutMs })
    } catch (e) {
      logger.log(`display bright/palm keep-on error: ${e}`)
    }

    createUI()

    // 初始化震动并开始循环
    vibrator = new Vibrator()
    startVibrateLoop()

    // 超时保护：5 分钟未操作视为完成
    trackTimer(setTimeout(completeFlow, LAYOUT.timeoutMs))
  },

  onDestroy() {
    logger.log('onDestroy, cleanup')
    clearAllTimers()
    if (vibrator) {
      try {
        vibrator.stop()
      } catch (e) {
        logger.log(`vibrator stop error: ${e}`)
      }
      vibrator = null
    }
    offKey()
  },
})

function createUI() {
  // 顶部阶段提示
  const phaseInfo = getText('remind_prompt_' + phase) || ''
  phaseText = createWidget(widget.TEXT, {
    x: 0,
    y: LAYOUT.phaseTextY,
    w: LAYOUT.screenW,
    h: LAYOUT.phaseTextH,
    text_size: LAYOUT.phaseTextSize,
    text: phaseInfo,
    color: COLORS.textPrimary,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
  })
  if (!phaseInfo) {
    phaseText.setProperty(prop.COLOR, COLORS.textSecondary)
  }

  // 长按热区：BUTTON 不设背景色时默认按压变灰，故显式设黑底使按压不变色（黑=与页面背景一致，视觉无底框）
  btnWidget = createWidget(widget.BUTTON, {
    x: LAYOUT.btnX,
    y: LAYOUT.btnY,
    w: LAYOUT.btnDiameter,
    h: LAYOUT.btnDiameter,
    normal_color: 0x000000,
    press_color: 0x000000,
    click_func: () => {},
  })
  // 提示文字：独立 TEXT，白色、无底色，画在热区中心（后画，确保不被 BUTTON 遮住）
  // 上层 TEXT 会遮挡下层 BUTTON 的手势事件，必须 setEnable(false) 让长按事件穿透到 btnWidget
  const hintText = createWidget(widget.TEXT, {
    x: LAYOUT.btnX,
    y: LAYOUT.btnY,
    w: LAYOUT.btnDiameter,
    h: LAYOUT.btnDiameter,
    text_size: LAYOUT.btnTextSize,
    text: getText('hold_btn_text').replace('%d', holdSec),
    color: COLORS.white,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
  })
  hintText.setEnable(false)

  // 下方进度秒数
  progressText = createWidget(widget.TEXT, {
    x: 0,
    y: LAYOUT.progressTextY,
    w: LAYOUT.screenW,
    h: LAYOUT.progressTextH,
    text_size: LAYOUT.progressTextSize,
    text: getText('progress_text').replace('%s', '0.0').replace('%d', holdSec),
    color: COLORS.textSecondary,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
  })

  // 长按进度圆环：最后绘制置于最上层（盖住 BUTTON 黑底），setEnable(false) 穿透触摸不挡长按手势
  arcWidget = createWidget(widget.ARC, {
    x: LAYOUT.arcX,
    y: LAYOUT.arcY,
    w: LAYOUT.arcSize,
    h: LAYOUT.arcSize,
    radius: LAYOUT.arcSize / 2,
    start_angle: LAYOUT.arcStartAngle,
    end_angle: LAYOUT.arcStartAngle, // 初始 0 进度
    line_width: LAYOUT.arcLineWidth,
    color: COLORS.arcRing,
  })
  arcWidget.setEnable(false)

  // 长按自实现检测
  btnWidget.addEventListener(event.CLICK_DOWN, () => {
    pressStartTs = Date.now()
    startProgressRefresh()
  })
  btnWidget.addEventListener(event.CLICK_UP, () => {
    cancelPress()
  })
  btnWidget.addEventListener(event.MOVE_OUT, () => {
    cancelPress()
  })
}