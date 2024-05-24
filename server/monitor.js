/* eslint-disable unicorn/no-null */
import readline from 'node:readline'
import fs from 'node:fs'
import sqlite3 from 'sqlite3'
import log from './logger.js'
import { openSync } from 'i2c-bus'

const { Database } = sqlite3
const database = new Database('/home/pi/radiateurs/server/radiateurs.db')


const ARRET = 0b01	// demi pos = arret

// eslint-disable-next-line no-unused-vars
const MARCHE = 0b00	// ni pos ni neg = marche

// eslint-disable-next-line no-unused-vars
const ECO = 0b11		// signal complet = eco

// eslint-disable-next-line no-unused-vars
const HORSGEL = 0b10	// demi neg = hors gel

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


/**
 * Classe pour contrôler les modules I2C
 */
class I2CController {
  IODIRA = 0x00	// Direction du port A (input/output)
  IODIRB = 0x01	// Direction du port B (input/output)
  GPIOA = 0x12   // Adresse du port A en mode input
  GPIOB = 0x13   // Adresse du port B en mode input
  OLATA = 0x14	// Adresse du port A en mode output
  OLATB = 0x15	// Adresse du port B en mode output
  /** @type { ReturnType<openSync>} */
  i2cBus

  constructor() {
    this.i2cBus = openSync(1)
    // Initialise les ports A et B de chaque module en mode output
    for (let phase = 1; phase <= 3; phase++) {
      const device = this.getModuleAddress(phase - 1)
      this.i2cBus.writeByteSync(device, this.IODIRA, 0b0000_0000)
      this.i2cBus.writeByteSync(device, this.IODIRB, 0b0000_0000)
    }
  }
  /**
   * Renvoie l'adresse binaire du module I2C sur lequel communiquer
   * @param { number } numModule le numero 0, 1 ou 2
   */
  getModuleAddress(numModule) {
    if (numModule < 0b000 || numModule > 0b010) {
      throw new Error('Module number must be 0, 1 or 2')
    }
    // L'adresse du MCP23017 est construite sur 7 bits : 0 1 0 0 A2 A1 A0
    // Le numero de module est egal à son adresse en binaire : A2 A1 A0
    // Par exemple 0x20 pour 000, 0x21 pour 001, Ox22 pour 010, etc...
    // Il suffit donc de faire un bitwise OR de 0 1 0 0 0 0 0 et de A2 A1 A0
    // (Attention sur la carte pilote j'ai inversé, A0 est à gauche et A2 à droite
    // quand les connecteurs I2C sont en haut sur le rail)
    return (0b010_0000 | numModule)
  }

  /**
   * Récupère l'état des 8 radiateurs sur une phase donnée
   * @param { number } phase le numéro de phase (1, 2 ou 3)
   * @returns Renvoie un array de 8 valeurs, chacune d'entre elles peut être ARRET, MARCHE, ECO ou HORSGEL
   */
  readStates(phase) {
    const device = this.getModuleAddress(phase - 1)

    // Toutes les broches sont utilisées en output sur le port A et sur le port B
    // Lit les valeurs préexistantes sur le port A et sur le port B
    this.i2cBus.writeByteSync(device, this.IODIRA, 0b0000_0000)
    let portA = this.i2cBus.readByteSync(device, this.GPIOA)
    this.i2cBus.writeByteSync(device, this.IODIRB, 0b0000_0000)
    let portB = this.i2cBus.readByteSync(device, this.GPIOB)
		
    const commandsA = []
    const commandsB = []

    for (let i=0; i<4; i++) {
      // Lit les 2 derniers bits sur chaque port
      const commandA = portA & 0b0000_0011
      const commandB = portB & 0b0000_0011

      // Enregistre la commande dans l'array
      commandsA.push(commandA)
      commandsB.push(commandB)

      // Décale les valeurs des registres de 2 bits vers la droite
      portA >>= 2
      portB >>= 2
    }

    // Colle les 2 arrays et retourne le résultat
    const wires = [...commandsA, ...commandsB]
    log.debug('read phase #' + phase + ' and wires ' + wires + ': device = ' + device + '; portA = ' + portA + ', portB = ' + portB)
    return wires
  }

  /**
   * Change l'état des fils pilotes
   * @param { number } phase la phase à modifier
   * @param { PhaseCommands } wires un array avec 8 valeurs, chacune d'entre elles peut être MARCHE, ARRET, ECO ou HORSGEL
  */
  writeStates(phase, wires) {
    const device = this.getModuleAddress(phase - 1)

    let portA = 0b00
    let portB = 0b00

    for (let i=3; i>=0; i--) {
      // Lit les commandes à inscrire sur chaque port en commençant par les fils les plus hauts
      const commandA = wires[i]
      const commandB = wires[i+4]

      // Décale les valeurs des registres de 2 bits vers la gauche
      portA <<= 2
      portB <<= 2

      // Enregistre la nouvelle commande dans les 2 bits les plus à droite
      portA |= commandA
      portB |= commandB
    }

    // Modifie les valeurs sur le port A et sur le port B
    log.debug('write phase #' + phase + ' with wires ' + wires + ' : device = ' + device + '; port A = ' + portA + ', port B = ' + portB)
    this.i2cBus.writeByteSync(device, this.IODIRA, 0b0000_0000)
    this.i2cBus.writeByteSync(device, this.OLATA, portA)
    this.i2cBus.writeByteSync(device, this.IODIRB, 0b0000_0000)
    this.i2cBus.writeByteSync(device, this.OLATB, portB)
  }

}

class Statistics {

  /** 
   * The timer start time, in seconds
   * @type { number } 
   */
  didStartOn = Date.now() / 1000

  /**
   * One hour after the timer start time
   * @type { number } 
   */
  willEndOn = this.didStartOn + 24 * 60 * 60

  /**
   * Number of seconds the radiators have been switched off
   * @type { [ number, number, number ] }
   */
  secondsSwitchedOff = [0, 0, 0]

  /**
   * Number of intensity.seconds for each phase
   * @type { [ number, number, number ] }
   */
  secondsXintensity = [0, 0, 0]

  /**
   * Timestamp of the last intensity reading for each phase
   * @type { [ number, number, number ] }
   */
  timestampLastIntensity = [this.didStartOn, this.didStartOn, this.didStartOn]

  /**
   * Number of watts.seconds in total
   * @type { number }
   */
  secondsXwatts = 0

  /**
   * Timestamp of the last watt reading
   * @type { number }
   */
  timestampLastWatt = this.didStartOn

  /**
   * Standard meter reading at the start of the timer
   * @type { number | null }
   */
  startStandardMeter = null

  /**
   * Standard meter reading at the end of the timer
   * @type { number | null }
   */
  endStandardMeter = null

  /**
   * Savings meter reading at the start of the timer
   * @type { number | null }
   */
  startSavingsMeter = null

  /**
   * Savings meter reading at the end of the timer
   * @type { number | null }
   */
  endSavingsMeter = null


  /** @type { [ number | null, number | null , number | null ] } */
  timestampLastSwitchedOff = [null, null, null]

  /**
   * Flushes the statistics to the database
   */
  flushToDb() {
    const start = this.didStartOn
    const off1 = Math.round(this.secondsSwitchedOff[0])
    const off2 = Math.round(this.secondsSwitchedOff[1])
    const off3 = Math.round(this.secondsSwitchedOff[2])
    const int1 = Math.round(this.secondsXintensity[0] / (this.timestampLastIntensity[0] - this.didStartOn))
    const int2 = Math.round(this.secondsXintensity[1] / (this.timestampLastIntensity[1] - this.didStartOn))
    const int3 = Math.round(this.secondsXintensity[2] / (this.timestampLastIntensity[2] - this.didStartOn))
    const watts = Math.round(this.secondsXwatts / (this.timestampLastWatt - this.didStartOn))
    const standardMeterDiff = (this.endStandardMeter !== null && this.startStandardMeter !== null) ? this.endStandardMeter - this.startStandardMeter : 0
    const savingsMeterDiff = (this.endSavingsMeter !== null && this.startSavingsMeter !== null) ? this.endSavingsMeter - this.startSavingsMeter : 0
    const meterDiff = standardMeterDiff + savingsMeterDiff
    database.run('INSERT INTO statistics (start, off1, off2, off3, int1, int2, int3, watts, meter) VALUES ($start, $off1, $off2, $off3, $int1, $int2, $int3, $watts, $meter);', {
      $start: start,
      $off1 : off1,
      $off2: off2,
      $off3: off3,
      $int1: int1,
      $int2: int2,
      $int3: int3,
      $watts: watts,
      $meter: meterDiff
    }, (error) => {
      if (error) {
        log.error('reset statistics : INSERT query failed; ', error)
      } /* else {

      } */
    })
  }

  /**
   * Resets the timers
   */
  resetTimers() {
    this.didStartOn = this.willEndOn
    this.willEndOn = this.didStartOn + 24 * 60 * 60
		
    this.secondsSwitchedOff = [0, 0, 0]
    this.timestampLastSwitchedOff = [null, null, null]

    this.secondsXintensity = [0, 0, 0]
    this.timestampLastIntensity = [this.didStartOn, this.didStartOn, this.didStartOn]

    this.secondsXwatts = 0
    this.timestampLastWatt = this.didStartOn

    this.startStandardMeter = this.endStandardMeter
    this.startSavingsMeter = this.endSavingsMeter
  }

  getClearTimestamp() {
    const newTimestamp = Date.now() / 1000
    if (newTimestamp > this.willEndOn) {
      this.flushToDb()
      this.resetTimers()
    }
    return newTimestamp
  }

  /**
   * 
   * @param { number } phase 
   */
  addSwitchOff(phase) {
    const newTimestamp = this.getClearTimestamp()
    const lastTimestamp = this.timestampLastSwitchedOff[phase - 1]
    if (lastTimestamp === null) {
      this.timestampLastSwitchedOff[phase - 1] = newTimestamp
      return
    }
    const interval = newTimestamp - lastTimestamp
    this.secondsSwitchedOff[phase - 1] += interval
    this.timestampLastSwitchedOff[phase - 1] = newTimestamp
    return
  }

  /**
   * 
   * @param { number } phase 
   */
  rmSwitchOff(phase) {
    const newTimestamp = this.getClearTimestamp()
    const lastTimestamp = this.timestampLastSwitchedOff[phase - 1]
    const interval = newTimestamp - (lastTimestamp ?? 0)
    this.secondsSwitchedOff[phase - 1] += interval
    this.timestampLastSwitchedOff[phase - 1] = null
  }

  /**
   * 
   * @param { number } intensity
   * @param { number } phase 
   */
  addIntensity(intensity, phase) {
    const newTimestamp = this.getClearTimestamp()
    const lastTimestamp = this.timestampLastIntensity[phase - 1]
    const interval = newTimestamp - lastTimestamp
    this.secondsXintensity[phase - 1] += interval * intensity
    this.timestampLastIntensity[phase - 1] = newTimestamp
    log.debug('stats - total seconds x intensity : ', this.secondsXintensity[phase - 1])
    log.debug('stats - avg intensity : ', this.secondsXintensity[phase - 1] / (newTimestamp - this.didStartOn))
  }

  /**
   * 
   * @param { number } watt 
   */
  addPower(watt) {
    const newTimestamp = this.getClearTimestamp()
    const lastTimestamp = this.timestampLastWatt
    const interval = newTimestamp - lastTimestamp
    this.secondsXwatts += interval * watt
    this.timestampLastWatt = newTimestamp
    log.debug('stats - total seconds x watts : ', this.secondsXwatts)
    log.debug('stats - avg watts : ', this.secondsXwatts / (newTimestamp - this.didStartOn))
  }

  /**
   * 
   * @param { number } meter 
   */
  addStandardMeter(meter) {
    this.getClearTimestamp()
    if (this.startStandardMeter === null) {
      this.startStandardMeter = meter
    }
    this.endStandardMeter = meter
    log.debug('stats - standard meter : ', this.endStandardMeter - this.startStandardMeter)
  }
	
  /**
   * 
   * @param { number } meter 
   */
  addSavingsMeter(meter) {
    this.getClearTimestamp()
    if (this.startSavingsMeter === null) {
      this.startSavingsMeter = meter
    }
    this.endSavingsMeter = meter
    log.debug('stats - savings meter : ', this.endSavingsMeter - this.startSavingsMeter)
  }
}



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
