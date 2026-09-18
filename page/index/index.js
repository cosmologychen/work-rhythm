/**
 * 工作节奏 · 首页
 * Amazfit Balance / Zepp OS / 480×480 圆屏
 *
 * 视图策略：根据 state.working 在 主视图（未上班） 与 工作视图（上班中） 间切换；
 * 切换通过 router.replace 跳转自身页面重新 build（每次 build 全部重建 widget，天然干净），并清理 interval。
 * 设置入口通过 router.push 进入独立设置页 page/settings/index。
 */
import { createWidget, widget, prop, align, createDialog } from '@zos/ui'
import { onKey, offKey, KEY_SELECT, KEY_EVENT_CLICK } from '@zos/interaction'
import { replace, push } from '@zos/router'
import { log } from '@zos/utils'
import { getText } from '@zos/i18n'
import { COLORS, LAYOUT } from './index.style'

const logger = log.getLogger('work-rhythm-home')

let stateRef = null // 模块内共享的 state 模块引用
let timer = null // 工作视图的每秒刷新定时器

// 工作视图当前 widget 引用（用于每秒更新）
let phaseText = null
let countdownText = null // 大倒计时（距下次提醒 MM:SS）
let subTimeText = null // 本次 HH:MM:SS
let subTodayText = null // 今日累计 HH:MM:SS
let pauseBtnText = null // 暂停/继续独立文字（画在按钮上，向中线收）

// ---------- 工具 ----------
function pad2(n) {
  return String(n).padStart(2, '0')
}

// HH:MM:SS
function fmtHMS(ms) {
  const t = Math.max(0, Math.floor((ms || 0) / 1000))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

// MM:SS（传入秒）
function fmtMS(sec) {
  const s = Math.max(0, Math.floor(sec || 0))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${pad2(m)}:${pad2(r)}`
}

// 人类可读时长：X小时Y分 / Y分
function fmtHuman(ms) {
  const t = Math.max(0, Math.floor((ms || 0) / 1000))
  const h = Math.floor(t / 3600)
  const m = Math.round((t % 3600) / 60)
  if (h > 0) return `${h}${getText('time_h')}${m}${getText('time_m')}`
  return `${m}${getText('time_m')}`
}

// 阶段对应颜色
function phaseColor(phase) {
  if (phase === stateRef.PHASE.BREAK) return COLORS.break
  if (phase === stateRef.PHASE.LOG) return COLORS.accent
  return COLORS.primary
}

function stopTimer() {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

// ---------- 视图一：主视图（未上班默认）----------
function buildMainView() {
  logger.log('build main view (not working)')
  // 顶部标题
  createWidget(widget.TEXT, {
    x: 0,
    y: LAYOUT.titleY,
    w: LAYOUT.screenW,
    h: 40,
    text_size: LAYOUT.titleSize,
    text: getText('app_name'),
    color: COLORS.textPrimary,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
  })

  // 大号"上班"按钮：高频操作
  createWidget(widget.BUTTON, {
    x: LAYOUT.mainWorkBtnX,
    y: LAYOUT.mainWorkBtnY,
    w: LAYOUT.mainWorkBtnW,
    h: LAYOUT.mainWorkBtnH,
    text_size: LAYOUT.mainWorkBtnTextSize,
    text: getText('btn_start'),
    color: COLORS.white,
    normal_color: COLORS.primary,
    press_color: COLORS.primaryDark,
    click_func: () => {
      logger.log('start work')
      stateRef.startWork()
      replace({ url: 'page/index/index' })
    },
  })

  // 设置入口：底部切块本身即设置按钮（文字天然居中，无需图片定位），点击进入设置页
  createWidget(widget.BUTTON, {
    x: LAYOUT.gearBtnX,
    y: LAYOUT.gearBtnY,
    w: LAYOUT.gearBtnW,
    h: LAYOUT.gearBtnH,
    text: getText('btn_settings'),
    text_size: LAYOUT.gearBtnTextSize,
    color: COLORS.white,
    normal_color: 0x1d2a4a,
    press_color: 0x2a3a5a,
    click_func: () => {
      logger.log('open settings page')
      push({ url: 'page/settings/index' })
    },
  })
}

// ---------- 视图二：上班中 ----------
function refreshView2() {
  const st = stateRef.getState()
  if (st.paused) {
    // 暂停：阶段文案带"已暂停"后缀、暂停黄；倒计时变暗表示已冻结
    phaseText.setProperty(prop.TEXT, stateRef.getPhaseLabel(st.phase) + getText('phase_paused_suffix'))
    phaseText.setProperty(prop.COLOR, 0xffb300)
    countdownText.setProperty(prop.COLOR, COLORS.textSecondary)
  } else {
    // 正常运行：恢复正常阶段文案与颜色
    phaseText.setProperty(prop.TEXT, stateRef.getPhaseLabel(st.phase))
    phaseText.setProperty(prop.COLOR, phaseColor(st.phase))
    countdownText.setProperty(prop.COLOR, COLORS.textPrimary)
  }
  countdownText.setProperty(prop.TEXT, fmtMS(st.phaseRemainingSec))
  subTimeText.setProperty(prop.TEXT, `${getText('label_session')} ${fmtHMS(st.accumMs)}`)
  subTodayText.setProperty(prop.TEXT, `${getText('label_today')} ${fmtHMS(st.todayTotalMs)}`)
  pauseBtnText.setProperty(prop.TEXT, st.paused ? getText('btn_resume') : getText('btn_pause'))
}

function handleTimerTick() {
  const st = stateRef.getState()
  if (!st.working) {
    // 异常退出：清理定时器并切回主视图
    logger.log('working became false, back to main view')
    stopTimer()
    replace({ url: 'page/index/index' })
    return
  }
  refreshView2()
}

function togglePause() {
  const st = stateRef.getState()
  if (st.paused) {
    stateRef.resumeWork()
    logger.log('resume work')
  } else {
    stateRef.pauseWork()
    logger.log('pause work')
  }
  if (pauseBtnText) {
    pauseBtnText.setProperty(
      prop.TEXT,
      stateRef.getState().paused ? getText('btn_resume') : getText('btn_pause')
    )
  }
}

function buildView2() {
  const st = stateRef.getState()
  logger.log(
    `build view2 (working), phase=${st.phase}, paused=${st.paused}, accumMs=${st.accumMs}`
  )

  createWidget(widget.TEXT, {
    x: 0,
    y: LAYOUT.titleY,
    w: LAYOUT.screenW,
    h: 40,
    text_size: LAYOUT.titleSize,
    text: getText('app_name'),
    color: COLORS.textPrimary,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
  })

  // 当前阶段
  phaseText = createWidget(widget.TEXT, {
    x: 0,
    y: LAYOUT.phaseY,
    w: LAYOUT.screenW,
    h: 50,
    text_size: LAYOUT.phaseSize,
    text: st.paused
      ? stateRef.getPhaseLabel(st.phase) + getText('phase_paused_suffix')
      : stateRef.getPhaseLabel(st.phase),
    color: st.paused ? 0xffb300 : phaseColor(st.phase),
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
  })

  // 距下次提醒倒计时（大字号）
  countdownText = createWidget(widget.TEXT, {
    x: 0,
    y: LAYOUT.countdownY,
    w: LAYOUT.screenW,
    h: 84,
    text_size: LAYOUT.countdownSize,
    text: fmtMS(st.phaseRemainingSec),
    color: st.paused ? COLORS.textSecondary : COLORS.textPrimary,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
  })

  // 本次上班已计时（小字）
  subTimeText = createWidget(widget.TEXT, {
    x: 0,
    y: LAYOUT.subY,
    w: LAYOUT.screenW,
    h: LAYOUT.subLineH,
    text_size: LAYOUT.subSize,
    text: `${getText('label_session')} ${fmtHMS(st.accumMs)}`,
    color: COLORS.textSecondary,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
  })

  // 今日累计（小字，位于 subY+subLineH）
  subTodayText = createWidget(widget.TEXT, {
    x: 0,
    y: LAYOUT.subY + LAYOUT.subLineH,
    w: LAYOUT.screenW,
    h: LAYOUT.subLineH,
    text_size: LAYOUT.subSize,
    text: `${getText('label_today')} ${fmtHMS(st.todayTotalMs)}`,
    color: COLORS.textSecondary,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
  })

  // 暂停/继续（左侧按钮）
  // BUTTON 无 padding 属性，采用独立 TEXT 方案：BUTTON 保留底色作热区，文字单独画并靠右向中线收
  createWidget(widget.BUTTON, {
    x: LAYOUT.ctrlBtnX0,
    y: LAYOUT.ctrlBtnY,
    w: LAYOUT.ctrlBtnW,
    h: LAYOUT.ctrlBtnH,
    normal_color: COLORS.controlBg, // 与右侧"下班"红色区分
    press_color: COLORS.controlDark,
    click_func: togglePause,
  })
  // 左按钮文字：靠右（align.RIGHT），右边缘距中线 30px
  // 上层 TEXT 会遮挡下层 BUTTON 手势，setEnable(false) 让点击穿透到按钮
  pauseBtnText = createWidget(widget.TEXT, {
    x: LAYOUT.ctrlBtnX0,
    y: LAYOUT.ctrlBtnY,
    w: LAYOUT.ctrlBtnW - 30,
    h: LAYOUT.ctrlBtnH,
    text_size: LAYOUT.ctrlBtnTextSize,
    text: st.paused ? getText('btn_resume') : getText('btn_pause'),
    color: COLORS.white,
    align_h: align.RIGHT,
    align_v: align.CENTER_V,
  })
  pauseBtnText.setEnable(false)

  // 下班（右侧按钮，带确认框）
  // 同上独立 TEXT 方案：BUTTON 保留底色作热区，文字单独画并靠左向中线收
  createWidget(widget.BUTTON, {
    x: LAYOUT.ctrlBtnX1,
    y: LAYOUT.ctrlBtnY,
    w: LAYOUT.ctrlBtnW,
    h: LAYOUT.ctrlBtnH,
    normal_color: COLORS.danger,
    press_color: COLORS.dangerDark,
    click_func: () => {
      const cur = stateRef.getState()
      const dialog = createDialog({
        title: getText('confirm_stop_title').replace('%s', fmtHuman(cur.accumMs)),
        auto_hide: false,
        click_listener: ({ type }) => {
          if (type === 1) {
            const dur = stateRef.stopWork()
            logger.log(`stop work, duration=${dur}ms`)
            stopTimer()
            dialog.show(false)
            replace({ url: 'page/index/index' })
          } else {
            dialog.show(false)
          }
        },
      })
      dialog.show(true)
    },
  })
  // 右按钮文字：靠左（align.LEFT），左边缘距中线 30px
  // 上层 TEXT 会遮挡下层 BUTTON 手势，setEnable(false) 让点击穿透到按钮
  const stopBtnText = createWidget(widget.TEXT, {
    x: LAYOUT.ctrlBtnX1 + 30,
    y: LAYOUT.ctrlBtnY,
    w: LAYOUT.ctrlBtnW - 30,
    h: LAYOUT.ctrlBtnH,
    text_size: LAYOUT.ctrlBtnTextSize,
    text: getText('btn_stop'),
    color: COLORS.white,
    align_h: align.LEFT,
    align_v: align.CENTER_V,
  })
  stopBtnText.setEnable(false)

  // 启动每秒刷新
  stopTimer()
  timer = setInterval(handleTimerTick, 1000)
}

Page({
  build() {
    const { state } = getApp()._options.globalData
    stateRef = state
    // 兜底清理旧定时器
    stopTimer()

    if (state.getState().working) {
      buildView2()
    } else {
      buildMainView()
    }

    // 表冠按压：未上班时 = 确认"上班"；上班中不响应（返回 false 不拦截默认行为）
    // 调用序列与主视图"上班"按钮 click_func 完全一致（startWork + replace 重建页面）
    onKey({
      callback: (k, ev) => {
        if (k === KEY_SELECT && ev === KEY_EVENT_CLICK) {
          const st = stateRef.getState()
          if (!st.working) {
            logger.log('crown confirm -> start work')
            stateRef.startWork()
            replace({ url: 'page/index/index' })
            return true
          }
        }
        return false
      },
    })
  },
  onDestroy() {
    stopTimer()
    offKey() // onKey 全局仅允许一个，离开页面注销，避免按键回调泄漏
    logger.log('page destroyed, timer cleaned')
  },
})
