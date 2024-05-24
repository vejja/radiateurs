/* eslint-disable unicorn/no-null */
import readline from 'node:readline'
import fs from 'node:fs'
import Statistics from './statistics.js'
import I2CController from './i2c.js'
import log from './logger.js'
import database from './database.js'

/**
 * @typedef { Array<number> } PhaseCommands
 * @typedef { [ PhaseCommands, PhaseCommands, PhaseCommands ] } Commands
 * @typedef { '24h' | '7j' | '1m' | '12m' | 'inf' } HistoryRange
 */


/**
 * @typedef { { phase: number, value: number } } CurrentData
 * @typedef { { period: 'standard' | 'savings', value: number } } MeterData
 * @typedef { { time: number, value: number } } PowerData
 * @typedef { { phase: number, value: number } } SwitchData
 * @typedef { { type: 'current', data: CurrentData } } CurrentNotification
 * @typedef { { type: 'meter', data: MeterData } } MeterNotification
 * @typedef { { type: 'power', data: PowerData } } PowerNotification
 * @typedef { { type: 'switch', data: SwitchData } } SwitchNotification
 * @typedef { CurrentNotification | MeterNotification | PowerNotification | SwitchNotification } Notification
 **/


const ARRET = 0b01	// demi pos = arret

// eslint-disable-next-line no-unused-vars
const MARCHE = 0b00	// ni pos ni neg = marche

// eslint-disable-next-line no-unused-vars
const ECO = 0b11		// signal complet = eco

// eslint-disable-next-line no-unused-vars
const HORSGEL = 0b10	// demi neg = hors gel


class Teleinfo extends EventTarget {

  /** @type { Commands } */
  savedCommands = [
    [ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET],
    [ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET],
    [ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET],
  ]
  nbrSwitchedOff = [0, 0, 0] 	// nombre de radiateurs delestés
  /** @type { Statistics } */
  statistics
  /** @type { I2CController } */
  i2cController

  constructor() {
    super()
    this.statistics = new Statistics()
    this.i2cController = new I2CController()
    this.initHeatersFromDatabase()
    this.infiniteReading()
  }

  /**
   * Dispatches an event to the listeners
   * @param { Notification } message 
   */
  dispatch(message) {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    this.dispatchEvent(new CustomEvent('notification', { detail: message }))
  }

  /**
   * 
   * @param { number } phase 
   */
  switchOneOff(phase) {
    const limitIndex = 7 - this.nbrSwitchedOff[phase - 1]
    if (limitIndex >= 0) {
      const savedStates = this.savedCommands[phase - 1]
      const newStates = savedStates.map((state, index) => {
        return index >= limitIndex ? ARRET : state
      })
      this.i2cController.writeStates(phase, newStates)
      ++this.nbrSwitchedOff[phase - 1]
      log.debug('phase ' + phase + '; nbr delestés ' + this.nbrSwitchedOff[phase - 1])
      const data = {
        phase: phase,
        value: this.nbrSwitchedOff[phase - 1]
      }
      /** @type { SwitchNotification } */
      const emitMessage = {
        type: 'switch',
        data: data
      }
      this.dispatch(emitMessage)
      this.statistics.addSwitchOff(phase)
    }
  }

  /**
   * 
   * @param { number } phase 
   */
  switchOneBack(phase) {
    const limitIndex = 8 - this.nbrSwitchedOff[phase - 1]
    if (limitIndex <= 7) {
      const savedStates = this.savedCommands[phase - 1]
      const newStates = savedStates.map((state, index) => {
        return index > limitIndex ? ARRET : state
      })
      this.i2cController.writeStates(phase, newStates)
      --this.nbrSwitchedOff[phase - 1]
      log.debug('phase ' + phase + '; nbr delestés ' + this.nbrSwitchedOff[phase - 1])
      const data = {
        phase: phase,
        value: this.nbrSwitchedOff[phase - 1]
      }
      /** @type { SwitchNotification } */
      const emitMessage = {
        type: 'switch',
        data: data
      }
      this.dispatch(emitMessage)
      if (this.nbrSwitchedOff[phase - 1] === 0) {
        this.statistics.rmSwitchOff(phase)
      }
    }
  }

  /** 
   * Initialise les ordres GIFAM à partir de la base de données
   * 
   */
  initHeatersFromDatabase() {
    database.all(
      'SELECT * FROM dashboard ORDER BY phase, wire ASC',
      [], 
      (error, rows) => {
        if (error) {
          log.error('initHeatersFromDatabase : SELECT query failed; ' + error)
          return
        }

        // Enregistre les valeurs de la DB dans la table en memoire
        for (const row of rows) {
          this.savedCommands[row.phase - 1][row.wire - 1] = row.command
        }
				
        // Reload les valeurs sur les modules I2C
        // En prenant en compte les radiateurs déjà en cours de délestage
        for (const [phaseIndex, savedStates] of this.savedCommands.entries()) {
          const limitIndex = 7 - this.nbrSwitchedOff[phaseIndex]
          const newStates = savedStates.map((state, wireIndex) => {
            return wireIndex > limitIndex ? ARRET : state
          })
          this.i2cController.writeStates(phaseIndex + 1, newStates)
        }

        for (let phase = 1; phase <= 3; ++phase) {
          log.info('read phase #' + phase + ' : ' + this.i2cController.readStates(phase))
        }
      }
    )
  }

  /**
   * 
   * @param { number } phase 
   * @param { number } wire 
   * @returns 
   */
  getCommandForHeater(phase, wire) {
    const p = new Promise(function(resolve, reject) {
      database.get(
        'SELECT command FROM dashboard WHERE phase = ? AND wire = ?',
        [phase, wire],
        (error, row) => {
          if (error) {
            log.error('getCommandForHeater : SELECT query failed; ' + error)
            reject(error)
            return
          }
          if (row === undefined) {
            log.debug('undefined row for phase ' + phase + ' and wire ' + wire)
            reject(row)
            return
          }
          resolve(row.command)
        }
      )
    })
    return p
  }

  /**
   * 
   * @param { number } command 
   * @param {*} id 
   * @returns 
   */
  setCommandForHeater(command, id) {
    if (command < 0 || command > 3) {
      log.error('setCommandForHeater: wrong command')
      return
    }
    database.run(
      'UPDATE dashboard SET command = ? WHERE id = ?',
      [command, id],
      (error) => {
        if (error) {
          log.error('setCommandForHeater : UPDATE query failed')
        }
        else {
          this.initHeatersFromDatabase()
          this.getHeaters()
            .then(reply => {
              this.dispatch(reply)
            })
            .catch(error_ => {
              log.error('getHeaters promise rejected: ' + error_)
            })
        }
      }
    )
  }

  /**
   * 
   * @param { number } command 
   * @returns 
   */
  setCommandForAllHeaters(command) {
    if (command < 0 || command > 3) {
      log.error('setCommandForAllHeaters: wrong command')
      return
    }
    database.run(
      'UPDATE dashboard SET command = ?', 
      [command],
      (error) => {
        if (error) {
          log.error('setCommandForAllHeaters : UPDATE query failed')
        }
        else {
          this.initHeatersFromDatabase()
          this.getHeaters()
            .then(reply => {
              this.dispatch(reply)
            })
            .catch(error_ => {
              log.error('getHeaters promise rejected: ' + error_)
            })
        }
      }
    )
  }


  getHeaters() {
    const p = new Promise(function(resolve, reject) {
      database.all(
        'SELECT * FROM dashboard',
        [],
        (error, rows) => {
          if (error) {
            log.error('getHeaters : SELECT query failed')
            reject(error)
          }
          else {
            const reply = {
              type: 'heaters',
              data: rows
            }
            resolve(reply)
          }
        }
      )
    })
    return p
  }

  /**
   * 
   * @param { HistoryRange } historyRange 
   * @returns 
   */
  getHistory(historyRange) {
    let range = null
    switch (historyRange) {
    case '24h':
      range = '-24 hours'
      break
    

    case '7j':
      range = '-7 days'
      break
    

    case '1m':
      range = '-1 month'
      break
    

    case '12m':
      range = '-12 months'
      break

    case 'inf':
      break
    default:
      break
    }
    let query = 'SELECT * FROM statistics ORDER BY start'
    if (range !== null) {
      query = 'SELECT * FROM statistics WHERE datetime(start, \'unixepoch\') >= datetime(\'now\', \'' + range + '\') ORDER BY start;'
    }
    const p = new Promise(function(resolve, reject) {
      database.all(
        query,
        [],
        (error, rows) => {
          if (error) {
            log.error('getHistory : SELECT query failed')
            reject(error)
          }
          else {
            const reply = {
              type: 'history',
              data: {
                range: historyRange,
                history: rows
              }
            }
            resolve(reply)
          }
        }
      )
    })
    return p
  }

  infiniteReading() {
    const lineReader = readline.createInterface({
      input: fs.createReadStream('/dev/ttyAMA0', 
        { autoClose: false }
      ),
    })

    lineReader.on('close', () => {
      log.info('********** LINE READER CLOSED')
      this.infiniteReading()
    })

    lineReader.on('line', line => {
      let rcvdMessage = -1

      rcvdMessage = line.search('IINST')
      if (rcvdMessage !== -1) {
        const phase = Number.parseInt(line.slice(5, 6))
        const amperes = Number.parseInt(line.slice(7, 10))

        /** @type { CurrentNotification } */
        const emitMessage = {
          type: 'current',
          data: {
            phase: phase,
            value: amperes
          }
        }
        this.dispatch(emitMessage)
        this.statistics.addIntensity(amperes, phase)
				
        if (amperes >= 30) {
          log.info('IINST phase ' + phase + ' : ' + amperes)
          this.switchOneOff(phase)
        }
        else {
          log.debug('IINST phase ' + phase + ' : ' + amperes)
          this.switchOneBack(phase)
        }
        return
      }

      rcvdMessage = line.search('ADIR')
      if (rcvdMessage !== -1) {
        const phase_dep = Number.parseInt(line.slice(4, 5))
        const amper_dep = Number.parseInt(line.slice(6, 9))
        
        /** @type { CurrentNotification } */
        const emitMessage = { 
          type: 'current',
          data: {
            phase: phase_dep,
            value: amper_dep
          }
        }
        this.dispatch(emitMessage) 
        this.statistics.addIntensity(amper_dep, phase_dep)
        log.info('ADIR phase ' + phase_dep + ' : ' + amper_dep)
        this.switchOneOff(phase_dep)
        return
      }

      rcvdMessage = line.search('HCHP')
      if (rcvdMessage !== -1) {
        const hp = Number.parseInt(line.slice(5, 15))

        /** @type { MeterNotification} */
        const emitMessage = {
          type: 'meter',
          data: {
            period: 'standard',
            value: hp
          }
        }
        this.dispatch(emitMessage) 
        this.statistics.addStandardMeter(hp)
        log.debug('hp : ' + hp)
        return
      }

      rcvdMessage = line.search('HCHC')
      if (rcvdMessage !== -1) {
        const hc = Number.parseInt(line.slice(5, 15))
        
        /** @type { MeterNotification} */
        const emitMessage = {
          type: 'meter',
          data: {
            period: 'savings',
            value: hc
          }
        }
        this.dispatch(emitMessage) 
        this.statistics.addSavingsMeter(hc)
        log.debug('hc : ' + hc)
        return
      }

      rcvdMessage = line.search('PAPP')
      if (rcvdMessage !== -1) {
        const watts = Number.parseInt(line.slice(5, 10))
        const timestamp = Date.now() / 1000

        /** @type { PowerNotification} */
        const emitMessage = {
          type: 'power',
          data: {
            time: timestamp,
            value: watts
          }
        }
        
        this.dispatch(emitMessage)
        this.statistics.addPower(watts)
        log.debug('watts : ' + watts) 
        return
      }
    })
  }
}

// exports a single instance
const teleinfo = new Teleinfo()
export default teleinfo