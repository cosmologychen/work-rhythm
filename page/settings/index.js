/**
 * 工作节奏 · 设置列表页
 * Amazfit Balance / Zepp OS / 480×480 圆屏
 *
 * 因 API_LEVEL 3.7 的 SCROLL_LIST 在表冠滚动时不触发任何焦点/按键回调
 * （无按键焦点模式），故改为自绘静态列表：FILL_RECT + TEXT 直接绘制六行，
 * 支持表冠旋转上下移动选中项、表冠按下进入选中项、点击行直接进入该行。
 * 六行全部常驻显示，无需滚动。
 */
import { createWidget, widget, align, prop, event } from '@zos/ui'
import { push } from '@zos/router'
import { setScrollLock } from '@zos/page'
import {
  onKey,
  offKey,
  KEY_SELECT,
  KEY_UP,
  KEY_DOWN,
  KEY_EVENT_CLICK,
  onDigitalCrown,
  offDigitalCrown,
} from '@zos/interaction'
import { log } from '@zos/utils'
import { getText } from '@zos/i18n'

const logger = log.getLogger('work-rhythm-settings')

// 设置项定义：key 对应 state.getSettings() 的字段，顺序即列表顺序
const SETTINGS = [
  { key: 'cycleMin', label: getText('setting_cycle') },
  { key: 'logMin', label: getText('setting_log') },
  { key: 'breakMin', label: getText('setting_break') },
  { key: 'hold1Sec', label: getText('setting_hold1') },
  { key: 'hold2Sec', label: getText('setting_hold2') },
  { key: 'hold3Sec', label: getText('setting_hold3') },
]

// 内联颜色与布局常量（量少，不单独建 style 文件）
const COLORS = {
  textPrimary: 0xffffff, // 标题与条目标签
  accent: 0x00e5ff, // 当前值与选中指示条
  itemBg: 0x1d2a4a, // 普通行背景
  itemSelBg: 0x334155, // 选中行背景
}

const LAYOUT = {
  screenW: 480,
  titleY: 26,
  titleSize: 26,
  // 行区域：x=94 宽 292，行间距 54（高 52，行间留 2px）
  rowX: 94,
  rowW: 292,
  rowH: 52,
  rowGap: 54,
  rowStartY: 78,
  rowRadius: 14,
  // 行内标签
  labelX: 112,
  labelW: 150,
  labelSize: 24,
  // 行内数值
  valueX: 248,
  valueW: 120,
  valueSize: 26,
  // 选中指示条
  indicatorX: 100,
  indicatorW: 6,
  indicatorH: 40,
  indicatorRadius: 3,
  indicatorInsetY: 6, // 相对行顶部的垂直偏移，用于垂直居中
  // 表冠单步触发阈值（度）：设为 6 度，适中灵敏度且绝不连跳
  crownThreshold: 6,
}

let stateRef = null // state 模块引用，build 时从 globalData 注入
let focusIdx = 0 // 选中项索引（0..5），build 开头复位
let accum = 0 // 表冠旋转累计角度（模块级）

// 自绘控件引用（随选中项切换动态更新）
let rowBgRefs = [] // 六行背景 FILL_RECT，用于高亮切换
let indicatorRef = null // 选中指示条
let titleWidget = null // 标题控件

// 更新选中态：切换 rowBgRefs 中受影响行的背景色，并移动指示条
function updateSelection(fromIdx, toIdx) {
  // 修改前后两行的背景色
  if (fromIdx >= 0 && fromIdx < SETTINGS.length && rowBgRefs[fromIdx]) {
    rowBgRefs[fromIdx].setProperty(prop.COLOR, COLORS.itemBg)
  }
  if (toIdx >= 0 && toIdx < SETTINGS.length && rowBgRefs[toIdx]) {
    rowBgRefs[toIdx].setProperty(prop.COLOR, COLORS.itemSelBg)
  }
  // 移动指示条到新选中行
  if (indicatorRef) {
    const y = LAYOUT.rowStartY + toIdx * LAYOUT.rowGap + LAYOUT.indicatorInsetY
    indicatorRef.setProperty(prop.MORE, {
      x: LAYOUT.indicatorX,
      y,
      w: LAYOUT.indicatorW,
      h: LAYOUT.indicatorH,
    })
  }
  if (titleWidget) {
    titleWidget.setProperty(prop.TEXT, `${getText('setting_title')} (${toIdx + 1}/${SETTINGS.length})`)
  }
  logger.log(`select index=${toIdx} key=${SETTINGS[toIdx].key}`)
}

Page({
  build() {
    // 进入页面先重置并清理之前的监听，防止重复注册导致真机监听失败
    try {
      offKey()
      offDigitalCrown()
      setScrollLock({ lock: true })
    } catch (e) {
      logger.log(`pre-cleanup error: ${e}`)
    }

    focusIdx = 0
    accum = 0
    rowBgRefs = []
    indicatorRef = null
    titleWidget = null

    // 获取状态机模块（由 app 注入 globalData.state），与 remind 页取法一致
    try {
      stateRef = (getApp()._options.globalData || {}).state || null
    } catch (e) {
      stateRef = null
    }
    if (!stateRef || typeof stateRef.getSettings !== 'function') {
      logger.log('state module missing')
      return
    }

    // 顶部标题（动态显示当前选中的序号，真机转动立刻能看到数字变化）
    titleWidget = createWidget(widget.TEXT, {
      x: 0,
      y: LAYOUT.titleY,
      w: LAYOUT.screenW,
      h: 40,
      text_size: LAYOUT.titleSize,
      text: `${getText('setting_title')} (1/${SETTINGS.length})`,
      color: COLORS.textPrimary,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
    })

    // 六项参数及其当前值
    const st = stateRef.getSettings()

    // 自绘六行：每行背景 FILL_RECT + 标签 TEXT + 数值 TEXT
    for (let i = 0; i < SETTINGS.length; i++) {
      const y = LAYOUT.rowStartY + i * LAYOUT.rowGap
      const isSel = i === focusIdx

      // 行背景
      const row = createWidget(widget.FILL_RECT, {
        x: LAYOUT.rowX,
        y,
        w: LAYOUT.rowW,
        h: LAYOUT.rowH,
        radius: LAYOUT.rowRadius,
        color: isSel ? COLORS.itemSelBg : COLORS.itemBg,
      })
      rowBgRefs[i] = row

      // 标签（setEnable(false) 避免遮挡行点击穿透）
      createWidget(widget.TEXT, {
        x: LAYOUT.labelX,
        y,
        w: LAYOUT.labelW,
        h: LAYOUT.rowH,
        text_size: LAYOUT.labelSize,
        text: SETTINGS[i].label,
        color: COLORS.textPrimary,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
      }).setEnable(false)

      // 数值（setEnable(false) 同上）
      createWidget(widget.TEXT, {
        x: LAYOUT.valueX,
        y,
        w: LAYOUT.valueW,
        h: LAYOUT.rowH,
        text_size: LAYOUT.valueSize,
        text: String(st[SETTINGS[i].key]),
        color: COLORS.accent,
        align_h: align.RIGHT,
        align_v: align.CENTER_V,
      }).setEnable(false)

      // 点击行：直接进入该行详情（不改变选中态）
      row.addEventListener(event.CLICK_DOWN, () => {
        const item = SETTINGS[i]
        logger.log(`click settings item index=${i} key=${item.key}`)
        push({ url: 'page/detail/index', params: 'key=' + item.key })
      })
    }

    // 选中指示条（单个实例，随选中行移动）
    indicatorRef = createWidget(widget.FILL_RECT, {
      x: LAYOUT.indicatorX,
      y: LAYOUT.rowStartY + LAYOUT.indicatorInsetY,
      w: LAYOUT.indicatorW,
      h: LAYOUT.indicatorH,
      radius: LAYOUT.indicatorRadius,
      color: COLORS.accent,
    })

    // 表冠旋转（模拟器通过 onDigitalCrown 触发）
    const crownCallback = (a, b) => {
      let deg = 0
      if (typeof b === 'number') {
        deg = b
      } else if (typeof a === 'number') {
        deg = a
      } else if (a && typeof a.degree === 'number') {
        deg = a.degree
      } else {
        return
      }

      accum += deg
      const TH = LAYOUT.crownThreshold

      // 顺时针旋转（负数，向下选择）
      if (accum <= -TH) {
        accum = 0
        if (focusIdx < SETTINGS.length - 1) {
          const from = focusIdx
          focusIdx += 1
          updateSelection(from, focusIdx)
        }
      }
      // 逆时针旋转（正数，向上选择）
      else if (accum >= TH) {
        accum = 0
        if (focusIdx > 0) {
          const from = focusIdx
          focusIdx -= 1
          updateSelection(from, focusIdx)
        }
      }
    }

    try {
      onDigitalCrown({
        callback: crownCallback,
      })
    } catch (e) {
      logger.log(`onDigitalCrown register error: ${e}`)
    }

    // 按键事件（真机表冠旋转派发为 KEY_UP=38 / KEY_DOWN=40，表冠按下派发为 KEY_SELECT）
    onKey({
      callback: (k, ev) => {
        logger.log(`settings key: k=${k} ev=${ev} focus=${focusIdx}`)
        if (ev === KEY_EVENT_CLICK) {
          // 向下转动表冠（真机 k=40 或 KEY_DOWN）
          if (k === KEY_DOWN || k === 40) {
            if (focusIdx < SETTINGS.length - 1) {
              const from = focusIdx
              focusIdx += 1
              updateSelection(from, focusIdx)
            }
            return true
          }

          // 向上转动表冠（真机 k=38 或 KEY_UP）
          if (k === KEY_UP || k === 38) {
            if (focusIdx > 0) {
              const from = focusIdx
              focusIdx -= 1
              updateSelection(from, focusIdx)
            }
            return true
          }

          // 按下表冠（KEY_SELECT）：进入当前选中的详情
          if (k === KEY_SELECT) {
            const item = SETTINGS[focusIdx]
            logger.log(`crown enter select index=${focusIdx} key=${item.key}`)
            push({ url: 'page/detail/index', params: 'key=' + item.key })
            return true
          }
        }
        return false // 其余按键（含返回键）一律放行
      },
    })
  },
  onDestroy() {
    try {
      offKey()
      offDigitalCrown()
      setScrollLock({ lock: false })
    } catch (e) {
      logger.log(`onDestroy cleanup error: ${e}`)
    }
  },
})