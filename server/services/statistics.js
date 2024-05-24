/* eslint-disable unicorn/no-null */
import log from './logger.js'
import database from './database.js'


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

export default Statistics
