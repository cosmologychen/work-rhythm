/**
 * 工作节奏 · 参数详情页
 * Amazfit Balance / Zepp OS / 480×480 圆屏
 *
 * 使用官方 WIDGET_PICKER（API 3.0+ 原生滚轮选择器）调节单个参数。
 * 确认语义：滚动仅实时跟踪选中值、不落盘；仅两条路径保存并返回——
 * ① 点击 PICKER 对钩（真机触发 picker_cb event_type=2）；② 表冠按压（KEY_SELECT 单击）。
 * 右滑/BACK 返回视为放弃修改、不保存（设置页重建时显示旧值）。
 */
import { createWidget, widget } from '@zos/ui'
import { onKey, offKey, KEY_SELECT, KEY_EVENT_CLICK } from '@zos/interaction'
import { back } from '@zos/router'
import { log } from '@zos/utils'
import { getText } from '@zos/i18n'

const logger = log.getLogger('work-rhythm-detail')

// 参数定义：label 展示名 + 取值范围（与 utils/state.js 的 SETTING_RANGE 一致）
const PARAMS = {
  cycleMin: { label: getText('setting_cycle'), min: 1, max: 120, step: 1 },
  logMin: { label: getText('setting_log'), min: 1, max: 10, step: 1 },
  breakMin: { label: getText('setting_break'), min: 1, max: 15, step: 1 },
  hold1Sec: { label: getText('setting_hold1'), min: 3, max: 30, step: 1 },
  hold2Sec: { label: getText('setting_hold2'), min: 3, max: 30, step: 1 },
  hold3Sec: { label: getText('setting_hold3'), min: 3, max: 30, step: 1 },
}

let stateRef = null // state 模块引用，build 时从 globalData 注入
let key = null // 当前调节的参数 key（onInit 从路由 params 解析）

// 按 [min, max] 以 step 生成数据数组
function buildParamArray(min, max, step) {
  const arr = []
  for (let v = min; v <= max; v += step) {
    arr.push(v)
  }
  return arr
}

Page({
  onInit(options) {
    // 解析路由 params：'key=xxx'，非法 key 置空，build 时兜底返回
    key = null
    if (options && typeof options === 'string') {
      const m = options.match(/[?&]?key=([^&]+)/)
      if (m && PARAMS[m[1]]) {
        key = m[1]
      }
    }
    logger.log(`detail onInit options=${options} key=${key}`)
  },

  build() {
    // 非法 key 或状态模块缺失：直接返回上一页
    if (!key) {
      logger.log('invalid detail key, back to settings')
      back()
      return
    }
    try {
      stateRef = (getApp()._options.globalData || {}).state || null
    } catch (e) {
      stateRef = null
    }
    if (!stateRef || typeof stateRef.setSetting !== 'function') {
      logger.log('state module missing, back to settings')
      back()
      return
    }

    const def = PARAMS[key]
    const arr = buildParamArray(def.min, def.max, def.step)
    // 定位当前值在数组中的索引；找不到时回退到 0
    const cur = Number(stateRef.getSettings()[key])
    let initIdx = arr.indexOf(cur)
    if (initIdx < 0) {
      initIdx = 0
    }
    // 滚动时实时跟踪的当前选中索引（不落盘）；hasExited 防止确认或退出重复触发 back
    let selIdx = initIdx
    let hasExited = false
    logger.log(`detail build key=${key} cur=${cur} initIdx=${initIdx}`)

    createWidget(widget.WIDGET_PICKER, {
      title: def.label,
      nb_of_columns: 1,
      data_config: [
        {
          data_array: arr,
          init_val_index: initIdx,
          support_loop: true,
          font_size: 26,
          select_font_size: 44,
        },
      ],
      picker_cb: (picker, event_type, column_index, select_index) => {
        logger.log(
          `picker ev=${event_type} col=${column_index} idx=${select_index}`
        )
        // 任何带有效索引的事件：实时跟踪当前选中索引（滚动用），不落盘
        if (
          typeof select_index === 'number' &&
          select_index >= 0 &&
          arr[select_index] !== undefined
        ) {
          selIdx = select_index
        }

        if (hasExited) {
          return
        }

        // 选中事件(2)（真机点对钩/点中数值）：确认保存并返回
        if (event_type === 2) {
          hasExited = true
          const val = arr[selIdx]
          if (val !== undefined) {
            const next = stateRef.setSetting(key, val)
            logger.log(`picker confirm ${key}=${val} -> ${next[key]}`)
          }
          back()
          return
        }

        // 失焦事件(0)（右滑返回/按物理下键/点空白取消）：放弃修改，直接返回上一页
        if (event_type === 0) {
          hasExited = true
          logger.log(`picker cancel/blur without saving`)
          back()
        }
      },
    })

    // 按键交互：
    // ① 表冠按压（KEY_SELECT + 单击）= 确认修改：保存当前选中值并返回设置页
    // ② 下键/返回键（KEY_DOWN / KEY_SHORTCUT / KEY_BACK + 单击）= 取消修改：不保存直接返回
    onKey({
      callback: (k, ev) => {
        logger.log(`detail key event: key=${k} ev=${ev}`)
        if (hasExited) {
          return false
        }
        // 表冠单击：保存并返回
        if (k === KEY_SELECT && ev === KEY_EVENT_CLICK) {
          hasExited = true
          const v = arr[selIdx]
          if (v !== undefined) {
            stateRef.setSetting(key, v)
            logger.log(`crown confirm ${key}=${v}`)
          }
          back()
          return true
        }
        return false // 其余按键放行给系统（系统会触发 PICKER 失焦或系统返回）
      },
    })
  },

  onDestroy() {
    // onKey 全局仅允许注册一个，离开页面必须注销，避免按键回调泄漏到其他页面
    offKey()
  },
})
