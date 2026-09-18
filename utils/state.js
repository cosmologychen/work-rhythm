import { log } from '@zos/utils'
import { getText } from '@zos/i18n'
import { set as alarmSet, cancel as alarmCancel, getAllAlarms } from '@zos/alarm'
import { localStorage } from '@zos/storage'

const logger = log.getLogger('work-rhythm-state')

export const PHASE = { WORK: 'work', LOG: 'log', BREAK: 'break' }

// 暂停超过 1.5 小时（5400 秒）后，闹钟唤醒提醒用户是否下班
export const PAUSE_TIMEOUT_SEC = 90 * 60

// ------------------------------------------------------------
// 存储键
// ------------------------------------------------------------
const K = {
  SETTINGS: 'wr_settings', // { cycleMin, logMin, breakMin, hold1Sec, hold2Sec, hold3Sec }
  WORKING: 'wr_working', // boolean
  PAUSED: 'wr_paused', // boolean
  PHASE: 'wr_phase', // 'work' | 'log' | 'break'
  WORK_START: 'wr_work_start', // ts ms
  SEGMENT_START: 'wr_segment_start', // ts ms
  ACCUM: 'wr_accum_ms', // number
  PHASE_REMAIN_SEC: 'wr_phase_remain_sec', // 当前阶段还剩多少秒（运行中动态扣除，暂停时固化）
  PAUSE_START_TS: 'wr_pause_start_ts', // 暂停开始的时间戳 ts ms
  PAUSE_ALARM_ID: 'wr_pause_alarm_id', // 暂停 1.5 小时超时闹钟 ID
  ALARM_ID: 'wr_alarm_id', // 阶段闹钟 ID number
  TODAY_TOTAL: 'wr_today_total_ms', // number
  TODAY_DATE: 'wr_today_date', // 'YYYY-MM-DD'
}

// ------------------------------------------------------------
// 默认设置
// ------------------------------------------------------------
const DEFAULT_SETTINGS = {
  cycleMin: 30,
  logMin: 2,
  breakMin: 5,
  hold1Sec: 10,
  hold2Sec: 5,
  hold3Sec: 10,
}

// ------------------------------------------------------------
// storage 安全读写
// ------------------------------------------------------------
function sGet(key, def) {
  try {
    const v = localStorage.getItem(key)
    return v === null || v === undefined ? def : v
  } catch (e) {
    logger.log(`storage get error ${key}: ${e}`)
    return def
  }
}

function sSet(key, val) {
  try {
    localStorage.setItem(key, val)
  } catch (e) {
    logger.log(`storage set error ${key}: ${e}`)
  }
}

function sRemove(key) {
  try {
    localStorage.removeItem(key)
  } catch (e) {
    logger.log(`storage remove error ${key}: ${e}`)
  }
}

// ------------------------------------------------------------
// 时间工具
// ------------------------------------------------------------
function pad2(n) {
  return n < 10 ? '0' + n : String(n)
}

// 本地时区日期 YYYY-MM-DD
function localDateStr(ts) {
  const d = new Date(ts || Date.now())
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function todayDateStr() {
  return localDateStr(Date.now())
}

// ------------------------------------------------------------
// 设置读写
// ------------------------------------------------------------
function readSettings() {
  const raw = sGet(K.SETTINGS, null)
  if (raw) {
    try {
      const obj = typeof raw === 'object' ? raw : JSON.parse(raw)
      return { ...DEFAULT_SETTINGS, ...obj }
    } catch (e) {
      logger.log(`settings parse error: ${e}`)
    }
  }
  return { ...DEFAULT_SETTINGS }
}

const clampNum = (v, min, max) => {
  const n = Number(v)
  if (typeof n !== 'number' || Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, Math.round(n)))
}

const SETTING_RANGE = {
  cycleMin: [1, 120],
  logMin: [1, 10],
  breakMin: [1, 15],
  hold1Sec: [3, 30],
  hold2Sec: [3, 30],
  hold3Sec: [3, 30],
}

export function getSettings() {
  return readSettings()
}

export function setSetting(key, value) {
  const range = SETTING_RANGE[key]
  if (!range) {
    logger.log(`setSetting unknown key: ${key}`)
    return readSettings()
  }
  const next = readSettings()
  next[key] = clampNum(value, range[0], range[1])
  sSet(K.SETTINGS, JSON.stringify(next))
  return next
}

// ------------------------------------------------------------
// 阶段时长
// ------------------------------------------------------------
export function phaseDurationSec(phase) {
  const s = readSettings()
  switch (phase) {
    case PHASE.WORK:
      return s.cycleMin * 60
    case PHASE.LOG:
      return s.logMin * 60
    case PHASE.BREAK:
      return s.breakMin * 60
    default:
      logger.log(`phaseDurationSec unknown phase: ${phase}`)
      return 0
  }
}

export function getPhaseLabel(phase) {
  switch (phase) {
    case PHASE.WORK:
    case PHASE.LOG:
    case PHASE.BREAK:
      return getText('phase_' + phase)
    default:
      return ''
  }
}

export function getHoldSec(phase) {
  const s = readSettings()
  switch (phase) {
    case PHASE.WORK:
      return s.hold1Sec
    case PHASE.LOG:
      return s.hold2Sec
    case PHASE.BREAK:
      return s.hold3Sec
    default:
      return 0
  }
}

function nextPhase(phase) {
  switch (phase) {
    case PHASE.WORK:
      return PHASE.LOG
    case PHASE.LOG:
      return PHASE.BREAK
    case PHASE.BREAK:
      return PHASE.WORK
    default:
      return PHASE.WORK
  }
}

// ------------------------------------------------------------
// 闹钟管理
// ------------------------------------------------------------
// 兜底：除指定 id 外，将当前小程序其他残留 alarm 一并 cancel
function cancelAllRemaining(exceptId) {
  let ids = []
  try {
    ids = getAllAlarms() || []
  } catch (e) {
    logger.log(`getAllAlarms error: ${e}`)
    return
  }
  for (const id of ids) {
    if (id === 0) continue
    if (id === exceptId) continue
    try {
      alarmCancel(id)
      logger.log(`cancel residual alarm ${id}`)
    } catch (e) {
      logger.log(`cancel alarm ${id} error: ${e}`)
    }
  }
}

function cancelAlarmStored() {
  const id = Number(sGet(K.ALARM_ID, 0))
  if (id && id !== 0) {
    try {
      alarmCancel(id)
      logger.log(`cancel alarm ${id}`)
    } catch (e) {
      logger.log(`cancel stored alarm error: ${e}`)
    }
    sRemove(K.ALARM_ID)
  }
  // 同时清理暂停超时闹钟（阶段闹钟与暂停闹钟互斥，兜底移除确保状态一致）
  cancelPauseAlarm()
  // 兜底清理当前小程序残留闹钟（不含上面已 cancel 的 id 已在 storage 移除，此处 getAllAlarms 兜底）
  cancelAllRemaining(undefined)
}

function setPhaseAlarm(delaySec) {
  const delay = Math.max(1, Math.floor(Number(delaySec) || 0))
  let id = 0
  try {
    id = alarmSet({
      url: 'page/remind/index',
      delay,
      store: true,
    })
  } catch (e) {
    logger.log(`alarm set error: ${e}`)
    return 0
  }
  logger.log(`alarm set id=${id} delay=${delay}`)
  if (id && id !== 0) {
    sSet(K.ALARM_ID, id)
  } else {
    logger.log('alarm set returned invalid id 0')
    sRemove(K.ALARM_ID)
  }
  return id
}

// 设置 1.5 小时暂停超时闹钟（目标页同为 page/remind/index，按 paused 状态区分场景）
function setPauseAlarm(delaySec) {
  const delay = Math.max(1, Math.floor(Number(delaySec) || 0))
  let id = 0
  try {
    id = alarmSet({
      url: 'page/remind/index',
      delay,
      store: true,
    })
  } catch (e) {
    logger.log(`pause alarm set error: ${e}`)
    return 0
  }
  logger.log(`pause alarm set id=${id} delay=${delay}`)
  if (id && id !== 0) {
    sSet(K.PAUSE_ALARM_ID, id)
  } else {
    logger.log('pause alarm set returned invalid id 0')
    sRemove(K.PAUSE_ALARM_ID)
  }
  return id
}

function cancelPauseAlarm() {
  const id = Number(sGet(K.PAUSE_ALARM_ID, 0))
  if (id && id !== 0) {
    try {
      alarmCancel(id)
      logger.log(`cancel pause alarm ${id}`)
    } catch (e) {
      logger.log(`cancel pause alarm error: ${e}`)
    }
    sRemove(K.PAUSE_ALARM_ID)
  }
}

// ------------------------------------------------------------
// 今日累计跨天懒重置
// ------------------------------------------------------------
// 任何 getState/stopWork 时，若存储日期不是今天则今日累计归零
function resetTodayIfStale() {
  const storedDate = sGet(K.TODAY_DATE, null)
  const today = todayDateStr()
  if (storedDate !== today) {
    logger.log(`today reset: ${storedDate} -> ${today}`)
    sSet(K.TODAY_TOTAL, 0)
    sSet(K.TODAY_DATE, today)
  }
}

function isValidPhase(p) {
  return p === PHASE.WORK || p === PHASE.LOG || p === PHASE.BREAK
}

function sGetCurrentPhase() {
  const p = sGet(K.PHASE, PHASE.WORK)
  return isValidPhase(p) ? p : PHASE.WORK
}

// ------------------------------------------------------------
// 状态快照
// ------------------------------------------------------------
export function getState() {
  // 跨天懒重置
  resetTodayIfStale()

  const working = sGet(K.WORKING, false) === 'true' || sGet(K.WORKING, false) === true
  const paused = sGet(K.PAUSED, false) === 'true' || sGet(K.PAUSED, false) === true
  const phase = sGetCurrentPhase()
  const workStartTs = (() => {
    const ts = Number(sGet(K.WORK_START, 0))
    return ts || null
  })()
  const todayTotalMs = Number(sGet(K.TODAY_TOTAL, 0))

  let accumMs = Number(sGet(K.ACCUM, 0))
  let phaseRemainingSec
  if (!working) {
    phaseRemainingSec = 0
  } else if (paused) {
    // 暂停中：accumMs 与 phaseRemainingSec 均为暂停时固化的值，绝对不增加、不倒数
    phaseRemainingSec = Number(sGet(K.PHASE_REMAIN_SEC, 0))
  } else {
    // 运行中：把当前片段实时计入动态计时与阶段剩余
    const segment = Number(sGet(K.SEGMENT_START, 0))
    const runningMs = segment ? Date.now() - segment : 0
    if (segment) accumMs += runningMs
    const remain = Number(sGet(K.PHASE_REMAIN_SEC, 0)) - runningMs / 1000
    phaseRemainingSec = Math.max(0, Math.floor(remain))
  }

  // phaseRemainingSec 若 <= 0（阶段自然到期但未被确认），仅返回 0。
  // 严禁在读方法 getState() 中推进状态或产生任何修改/副作用：
  // 阶段推进只允许由 completePhase 在提醒页长按确认或超时时显式调用。
  if (phaseRemainingSec <= 0) {
    phaseRemainingSec = 0
  }

  // 暂停超过 1.5 小时（提前 10 秒阈值对齐闹钟触发时刻）则标记超时
  const isPauseTimeout =
    paused &&
    Date.now() - Number(sGet(K.PAUSE_START_TS, 0)) >= (PAUSE_TIMEOUT_SEC - 10) * 1000

  return {
    working,
    paused,
    phase,
    workStartTs,
    accumMs,
    todayTotalMs,
    phaseRemainingSec,
    isPauseTimeout,
  }
}

// ------------------------------------------------------------
// 操作
// ------------------------------------------------------------
export function startWork() {
  // 若已有工作会话，先清理（阶段闹钟 + 暂停超时闹钟）
  cancelAlarmStored()
  const now = Date.now()
  sSet(K.WORKING, true)
  sSet(K.PAUSED, false)
  sSet(K.PHASE, PHASE.WORK)
  sSet(K.WORK_START, now)
  const dur = phaseDurationSec(PHASE.WORK)
  sSet(K.PHASE_REMAIN_SEC, dur)
  sSet(K.SEGMENT_START, now)
  sSet(K.ACCUM, 0)
  sRemove(K.PAUSE_START_TS)
  setPhaseAlarm(dur)
  logger.log('startWork')
}

export function pauseWork() {
  // 仅上班且未暂停时有效
  const working = sGet(K.WORKING, false) === 'true' || sGet(K.WORKING, false) === true
  const paused = sGet(K.PAUSED, false) === 'true' || sGet(K.PAUSED, false) === true
  if (!working || paused) {
    logger.log('pauseWork ignored: not working or already paused')
    return
  }
  // 取消阶段闹钟
  cancelAlarmStored()
  const now = Date.now()
  // 固化工作时长
  const seg = Number(sGet(K.SEGMENT_START, 0))
  const accum = Number(sGet(K.ACCUM, 0)) + (seg ? now - seg : 0)
  sSet(K.ACCUM, accum)
  // 固化当前阶段剩余秒数（暂停期间不再倒数）
  let remain = Number(sGet(K.PHASE_REMAIN_SEC, 0)) - (seg ? (now - seg) / 1000 : 0)
  remain = Math.max(0, Math.floor(remain))
  sSet(K.PHASE_REMAIN_SEC, remain)
  // 移除当前片段起点
  sRemove(K.SEGMENT_START)
  // 标记暂停
  sSet(K.PAUSED, true)
  sSet(K.PAUSE_START_TS, now)
  // 设置 1.5 小时暂停超时闹钟
  setPauseAlarm(PAUSE_TIMEOUT_SEC)
  logger.log(`pauseWork accum=${accum} remain=${remain}`)
}

export function resumeWork() {
  // 取消 1.5 小时暂停超时闹钟
  cancelPauseAlarm()
  const working = sGet(K.WORKING, false) === 'true' || sGet(K.WORKING, false) === true
  if (!working) {
    logger.log('resumeWork ignored: not working')
    return
  }
  sRemove(K.PAUSE_START_TS)
  // 读出暂停时固化的阶段剩余秒数；若已耗尽则按当前阶段满时长重置
  let remain = Number(sGet(K.PHASE_REMAIN_SEC, 0))
  if (!(remain > 0)) {
    remain = phaseDurationSec(sGetCurrentPhase())
    sSet(K.PHASE_REMAIN_SEC, remain)
  }
  const now = Date.now()
  sSet(K.PAUSED, false)
  sSet(K.SEGMENT_START, now)
  setPhaseAlarm(remain)
  logger.log(`resumeWork remain=${remain}`)
}

export function stopWork() {
  // 取消阶段闹钟与暂停超时闹钟
  cancelAlarmStored()
  // accumMs 累加后并入 todayTotalMs
  resetTodayIfStale()
  const paused = sGet(K.PAUSED, false) === 'true' || sGet(K.PAUSED, false) === true
  const segment = Number(sGet(K.SEGMENT_START, 0))
  const now = Date.now()
  // 暂停状态下点击下班：暂停期间时长绝不计入，仅取固化 accum
  const accumMs = Number(sGet(K.ACCUM, 0)) + (!paused && segment ? now - segment : 0)
  const todayTotalMs = Number(sGet(K.TODAY_TOTAL, 0)) + accumMs
  sSet(K.TODAY_TOTAL, todayTotalMs)
  // 清除上班/暂停相关全部存储键
  sSet(K.WORKING, false)
  sSet(K.PAUSED, false)
  sRemove(K.PHASE)
  sRemove(K.WORK_START)
  sRemove(K.SEGMENT_START)
  sRemove(K.ACCUM)
  sRemove(K.PHASE_REMAIN_SEC)
  sRemove(K.PAUSE_START_TS)
  sRemove(K.PAUSE_ALARM_ID) // cancelPauseAlarm 已 sRemove，幂等
  logger.log(`stopWork total=${todayTotalMs}`)
  return accumMs
}

export function completePhase(phase) {
  // 提醒页长按完成/超时后调用：推进到下一阶段。
  // phase 为当前刚完成的阶段；非法时取当前存储阶段推进。
  const cur = isValidPhase(phase) ? phase : sGetCurrentPhase()
  const next = nextPhase(cur)
  const nextDurSec = phaseDurationSec(next)

  // 若会话仍在工作中，累加刚结束片段的时长、重置片段起点并设置下一阶段闹钟；
  // 若已停止（alarm 唤醒且未被 stopWork 清理），仅推进 phase 记录。
  const working = sGet(K.WORKING, false) === 'true' || sGet(K.WORKING, false) === true
  if (working) {
    cancelAlarmStored()
    const now = Date.now()
    const segment = Number(sGet(K.SEGMENT_START, 0))
    sSet(K.ACCUM, Number(sGet(K.ACCUM, 0)) + (segment ? now - segment : 0))
    sSet(K.PHASE, next)
    sSet(K.PHASE_REMAIN_SEC, nextDurSec)
    sSet(K.SEGMENT_START, now)
    setPhaseAlarm(nextDurSec)
  } else {
    sSet(K.PHASE, next)
  }
  logger.log(`completePhase ${cur}->${next}`)
  return next
}