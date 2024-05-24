class Logger {
  /**
   * Log level
   * @type { 'error' | 'info' | 'debug' }
   */
  level = 'info' // Choisir entre error, info et debug

  debug() {
    if (this.level === 'debug') {
      const logDate = new Date()
      console.log('LOG [' + logDate.toString() + ']', arguments)
    }
  }

  info() {
    if (this.level === 'info' || this.level === 'debug') {
      const logDate = new Date()
      console.log('INF [' + logDate.toString() + ']', arguments)
    }
  }

  error() {
    const logDate = new Date()
    console.log('ERR [' + logDate.toString() + ']', arguments)
  }
}

const logger = new Logger()

export default logger