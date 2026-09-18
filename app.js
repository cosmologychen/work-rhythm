import { log } from '@zos/utils'
import * as state from './utils/state'

const logger = log.getLogger('work-rhythm-app')

App({
  globalData: {
    state,
  },
  onCreate(options) {
    logger.log('app onCreate')
  },
  onDestroy(options) {
    logger.log('app onDestroy')
  },
})