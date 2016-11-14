'use strict';

var readline = require('readline');
var fs = require('fs');
var sqlite3 = require('sqlite3');
var db = new sqlite3.Database('/home/pi/radiateurs/server/radiateurs.db');
var EventEmitter = require('events').EventEmitter;
var log = require('./logger');


const ARRET = 0b01;	// demi pos = arret
const MARCHE = 0b00;	// ni pos ni neg = marche
const ECO = 0b11;		// signal complet = eco
const HORSGEL = 0b10;	// demi neg = hors gel


class I2CController {

	constructor() {
		this.i2cBus = require('i2c-bus').openSync(1);
		this.IODIRA = 0x00;	// Direction du port A (input/output)
		this.IODIRB = 0x01;	// Direction du port B (input/output)
		this.GPIOA = 0x12;   // Adresse du port A en mode input
		this.GPIOB = 0x13;   // Adresse du port B en mode input
		this.OLATA = 0x14;	// Adresse du port A en mode output
		this.OLATB = 0x15;	// Adresse du port B en mode output

		// Initialise les ports A et B de chaque module en mode output
		for (let phase = 1; phase <= 3; phase++) {
			var device = this.getModuleAddress(phase - 1);
			this.i2cBus.writeByteSync(device, this.IODIRA, 0b00000000);
			this.i2cBus.writeByteSync(device, this.IODIRB, 0b00000000);
		}
	}
	// Adresse du module I2C sur lequel communiquer
	// numModule : le numero 0, 1 ou 2
	getModuleAddress(i2cModule) {
		if (i2cModule < 0b000 || i2cModule > 0b010)
			return false;
		// L'adresse du MCP23017 est construite sur 7 bits : 0 1 0 0 A2 A1 A0
		// Le numero de module est egal à son adresse en binaire : A2 A1 A0
		// Par exemple 0x20 pour 000, 0x21 pour 001, Ox22 pour 010, etc...
		// Il suffit donc de faire un bitwise OR de 0 1 0 0 0 0 0 et de A2 A1 A0
		// (Attention sur la carte pilote j'ai inversé, A0 est à gauche et A2 à droite
		// quand les connecteurs I2C sont en haut sur le rail)
		return (0b0100000 | i2cModule);
	}

	// Récupère l'état des 8 radiateurs sur un module donnée
	// module : le numéro du module (0-2)
	// Renvoie un array de 8 valeurs, chacune d'entre elles peut être ARRET, MARCHE, ECO ou HORSGEL

	readStates(phase) {
		var device = this.getModuleAddress(phase - 1);

		// Toutes les broches sont utilisées en output sur le port A et sur le port B
		// Lit les valeurs préexistantes sur le port A et sur le port B
		this.i2cBus.writeByteSync(device, this.IODIRA, 0b00000000);
		var portA = this.i2cBus.readByteSync(device, this.GPIOA);
		this.i2cBus.writeByteSync(device, this.IODIRB, 0b00000000);
		var portB = this.i2cBus.readByteSync(device, this.GPIOB);
		
		var commandsA = [];
		var commandsB = [];

		for (let i=0; i<4; i++) {
			// Lit les 2 derniers bits sur chaque port
			var commandA = portA & 0b00000011;
			var commandB = portB & 0b00000011;

			// Enregistre la commande dans l'array
			commandsA.push(commandA);
			commandsB.push(commandB);

			// Décale les valeurs des registres de 2 bits vers la droite
			portA >>= 2;
			portB >>= 2;
		}

		// Colle les 2 arrays et retourne le résultat
		var wires = commandsA.concat(commandsB);
		log.debug("read phase #" + phase + " and wires " + wires + ": device = " + device + "; portA = " + portA + ", portB = " + portB);
		return wires;
	}

	// Change l'état des fils pilotes
	// module : le numéro de module (0-2) correspondant aux cavaliers (000, 001, 010)
	// wires : un array avec 8 valeurs, chacune d'entre elles peut être MARCHE, ARRET, ECO ou HORSGEL
	writeStates(phase, wires) {
		var device = this.getModuleAddress(phase - 1);

		var portA = 0b00;
		var portB = 0b00;

		for (let i=3; i>=0; i--) {
			// Lit les commandes à inscrire sur chaque port en commençant par les fils les plus hauts
			var commandA = wires[i];
			var commandB = wires[i+4];

			// Décale les valeurs des registres de 2 bits vers la gauche
			portA <<= 2;
			portB <<= 2;

			// Enregistre la nouvelle commande dans les 2 bits les plus à droite
			portA |= commandA;
			portB |= commandB;
		}

		// Modifie les valeurs sur le port A et sur le port B
		log.debug("write phase #" + phase + " with wires " + wires + " : device = " + device + "; port A = " + portA + ", port B = " + portB);
		this.i2cBus.writeByteSync(device, this.IODIRA, 0b00000000);
		this.i2cBus.writeByteSync(device, this.OLATA, portA);
		this.i2cBus.writeByteSync(device, this.IODIRB, 0b00000000);
		this.i2cBus.writeByteSync(device, this.OLATB, portB);
	}

}

class Statistics {

	constructor() {
		this.didStartOn = new Date();
		this.willEndOn = new Date(this.didStartOn.getFullYear(), this.didStartOn.getMonth(), this.didStartOn.getDate(), this.didStartOn.getHours(), this.didStartOn.getMinutes() + 1, 0, 0);

		this.secondsSwitchedOff = [0, 0, 0];
		this.timestampLastSwitchedOff = [null, null, null];

		this.secondsXintensity = [0, 0, 0];
		this.timestampLastIntensity = [this.didStartOn, this.didStartOn, this.didStartOn];

		this.secondsXwatts = 0;
		this.timestampLastWatt = this.didStartOn;

		this.startStandardMeter = null;
		this.endStandardMeter = null;
		this.startSavingsMeter = null;
		this.endStandardMeter = null;
	}

	flushToDb() {
		var year = this.didStartOn.getFullYear();
		var month = this.didStartOn.getMonth();
		var date = this.didStartOn.getDate();
		var hour = this.didStartOn.getHours(); 
		var off1 = Math.round(this.secondsSwitchedOff[0]);
		var off2 = Math.round(this.secondsSwitchedOff[1]);
		var off3 = Math.round(this.secondsSwitchedOff[2]);
		var int1 = Math.round(this.secondsXintensity[0] / (this.timestampLastIntensity[0] - this.didStartOn) * 1000);
		var int2 = Math.round(this.secondsXintensity[1] / (this.timestampLastIntensity[1] - this.didStartOn) * 1000);
		var int3 = Math.round(this.secondsXintensity[2] / (this.timestampLastIntensity[2] - this.didStartOn) * 1000);
		var watts = Math.round(this.secondsXwatts / (this.timestampLastWatt - this.didStartOn) * 1000);
		var standardMeterDiff = (this.endStandardMeter !== null && this.startStandardMeter !== null) ? this.endStandardMeter - this.startStandardMeter : 0;
		var savingsMeterDiff = (this.endSavingsMeter !== null && this.startSavingsMeter !== null) ? this.endSavingsMeter - this.startSavingsMeter : 0;
		var meterDiff = standardMeterDiff + savingsMeterDiff;
		db.run("INSERT INTO statistics (year, month, date, hour, off1, off2, off3, int1, int2, int3, watts, meter) VALUES ($year, $month, $date, $hour, $off1, $off2, $off3, $int1, $int2, $int3, $watts, $meter);", {
			$year: year,
			$month: month,
			$date: date,
			$hour: hour,
			$off1 : off1,
			$off2: off2,
			$off3: off3,
			$int1: int1,
			$int2: int2,
			$int3: int3,
			$watts: watts,
			$meter: meterDiff
		}, (err) => {
			if (err) {
				log.error('reset statistics : INSERT query failed; ', err);
			}
		});
	}

	resetTimers() {
		this.didStartOn = this.willEndOn;
		this.willEndOn = new Date(this.didStartOn.getFullYear(), this.didStartOn.getMonth(), this.didStartOn.getDate(), this.didStartOn.getHours(), this.didStartOn.getMinutes() + 1, 0, 0);
		
		this.secondsSwitchedOff = [0, 0, 0];
		this.timestampLastSwitchedOff = [null, null, null];

		this.secondsXintensity = [0, 0, 0];
		this.timestampLastIntensity = [this.didStartOn, this.didStartOn, this.didStartOn];

		this.secondsXwatts = 0;
		this.timestampLastWatt = this.didStartOn;

		this.startStandardMeter = this.endStandardMeter;
		this.startSavingsMeter = this.endSavingsMeter;
	}

	getClearTimestamp() {
		var newTimestamp = new Date();
		if (newTimestamp > this.willEndOn) {
			this.flushToDb();
			this.resetTimers();
		}
		return newTimestamp;
	}

	addSwitchOff(phase) {
		var newTimestamp = this.getClearTimestamp();
		var lastTimestamp = this.timestampLastSwitchedOff[phase - 1];
		if (lastTimestamp === null) {
			this.timestampLastSwitchedOff[phase - 1] = newTimestamp;
			return;
		}
		var interval = newTimestamp - lastTimestamp;
		this.secondsSwitchedOff[phase - 1] += (interval / 1000);
		this.timestampLastSwitchedOff[phase - 1] = newTimestamp;
		return;
	}

	rmSwitchOff(phase) {
		var newTimestamp = this.getClearTimestamp();
		var lastTimestamp = this.timestampLastSwitchedOff[phase - 1];
		var interval = newTimestamp - lastTimestamp;
		this.secondsSwitchedOff[phase - 1] += (interval / 1000);
		this.timestampLastSwitchedOff[phase - 1] = null;
	}

	addIntensity(intensity, phase) {
		var newTimestamp = this.getClearTimestamp();
		var lastTimestamp = this.timestampLastIntensity[phase - 1];
		var interval = newTimestamp - lastTimestamp;
		this.secondsXintensity[phase - 1] += (interval / 1000) * intensity;
		this.timestampLastIntensity[phase - 1] = newTimestamp;
		log.debug('stats - total seconds x intensity : ', this.secondsXintensity[phase - 1]);
		log.debug('stats - avg intensity : ', this.secondsXintensity[phase - 1] * 1000 / (newTimestamp - this.didStartOn));
	}

	addPower(watt) {
		var newTimestamp = this.getClearTimestamp();
		var lastTimestamp = this.timestampLastWatt;
		var interval = newTimestamp - lastTimestamp;
		this.secondsXwatts += (interval / 1000) * watt;
		this.timestampLastWatt = newTimestamp;
		log.debug('stats - total seconds x watts : ', this.secondsXwatts);
		log.debug('stats - avg watts : ', this.secondsXwatts * 1000 / (newTimestamp - this.didStartOn));
	}

	addStandardMeter(meter) {
		this.getClearTimestamp();
		if (this.startStandardMeter === null) {
			this.startStandardMeter = meter;
		}
		this.endStandardMeter = meter;
		log.debug('stats - standard meter : ', this.endStandardMeter - this.startStandardMeter);
	}
	
	addSavingsMeter(meter) {
		this.getClearTimestamp();
		if (this.startSavingsMeter === null) {
			this.startSavingsMeter = meter;
		}
		this.endSavingsMeter = meter;
		log.debug('stats - savings meter : ', this.endSavingsMeter - this.startSavingsMeter);
	}
}

class Teleinfo extends EventEmitter {

	constructor() {
		super();
		this.savedCommands = [
			[ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET],
			[ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET],
			[ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET],
		];
		this.nbrSwitchedOff = [0, 0, 0]; 	// nombre de radiateurs delestés

		this.statistics = new Statistics();
		this.i2cController = new I2CController();


		this.initHeatersFromDatabase();
		this.infiniteReading();
	}

	switchOneOff(phase) {
		var limitIndex = 7 - this.nbrSwitchedOff[phase - 1];
		if (limitIndex >= 0) {
			var savedStates = this.savedCommands[phase - 1];
			var newStates = savedStates.map((state, index) => {
				if (index >= limitIndex) {
					return ARRET;
				} else {
					return state;
				}
			});
			this.i2cController.writeStates(phase, newStates);
			++this.nbrSwitchedOff[phase - 1];
			log.debug('phase ' + phase + '; nbr delestés ' + this.nbrSwitchedOff[phase - 1]);
			var data = {
				phase: phase,
				value: this.nbrSwitchedOff[phase - 1]
			};
			var emitMessage = {
				type: 'switch',
				data: data
			};
			this.emit('notification', emitMessage);
			this.statistics.addSwitchOff(phase);
		}
	}

	switchOneBack(phase) {
		var limitIndex = 8 - this.nbrSwitchedOff[phase - 1];
		if (limitIndex <= 7) {
			var savedStates = this.savedCommands[phase - 1];
			var newStates = savedStates.map((state, index) => {
				if (index > limitIndex) {
					return ARRET;
				} else {
					return state;
				}
			});
			this.i2cController.writeStates(phase, newStates);
			--this.nbrSwitchedOff[phase - 1];
			log.debug('phase ' + phase + '; nbr delestés ' + this.nbrSwitchedOff[phase - 1]);
			var data = {
				phase: phase,
				value: this.nbrSwitchedOff[phase - 1]
			};
			var emitMessage = {
				type: 'switch',
				data: data
			};
			this.emit('notification', emitMessage);
			if (this.nbrSwitchedOff[phase - 1] === 0) {
				this.statistics.rmSwitchOff(phase);
			}
		}
	}

	// Initialise les ordres GIFAM à partir de la base de données
	initHeatersFromDatabase() {
		db.all(
			"SELECT * FROM dashboard ORDER BY phase, wire ASC",
			[], 
			(err, rows) => {
				if (err) {
					log.error('initHeatersFromDatabase : SELECT query failed; ' + err);
					return;
				}

				// Enregistre les valeurs de la DB dans la table en memoire
				rows.forEach(row => {
					this.savedCommands[row.phase - 1][row.wire - 1] = row.command;
				});
				
				// Reload les valeurs sur les modules I2C
				// En prenant en compte les radiateurs déjà en cours de délestage
				this.savedCommands.forEach((savedStates, phaseIndex) => {
					var limitIndex = 7 - this.nbrSwitchedOff[phaseIndex];
					var newStates = savedStates.map((state, wireIndex) => {
						if (wireIndex > limitIndex) {
							return ARRET;
						} else {
							return state;
						}
					});
					this.i2cController.writeStates(phaseIndex + 1, newStates);
				});

				for (let phase = 1; phase <= 3; ++phase) {
					log.info("read phase #" + phase + " : " + this.i2cController.readStates(phase));
				}
			}
		);
	}

	getCommandForHeater(phase, wire) {
		var p = new Promise(function(resolve, reject) {
			db.get(
				"SELECT command FROM dashboard WHERE phase = ? AND wire = ?",
				[phase, wire],
				(err, row) => {
					if (err) {
						log.error('getCommandForHeater : SELECT query failed; ' + err);
						reject(err);
						return;
					}
					if (row === undefined) {
						log.debug('undefined row for phase ' + phase + ' and wire ' + wire);
						reject(row);
						return;
					}
					resolve(row.command);
				}
			);
		});
		return p;
	}

	setCommandForHeater(command, id) {
		if (command < 0 || command > 3) {
			log.error('setCommandForHeater: wrong command');
			return;
		}
		db.run(
			"UPDATE dashboard SET command = ? WHERE id = ?",
			[command, id],
			(err) => {
				if (!err) {
					this.initHeatersFromDatabase();
					this.getHeaters()
					.then(function(reply) {
						this.emit('notification', reply);
					})
					.catch(function(err) {
						log.error('getHeaters promise rejected: ' + err);
					});
				}
				else {
					log.error('setCommandForHeater : UPDATE query failed');
				}
			}
		);
	}

	setCommandForAllHeaters(command) {
		if (command < 0 || command > 3) {
			log.error('setCommandForAllHeaters: wrong command');
			return;
		}
		db.run(
			"UPDATE dashboard SET command = ?", 
			[command],
			(err) => {
				if (!err) {
					this.initHeatersFromDatabase();
					this.getHeaters()
					.then(function(reply) {
						this.emit('notification', reply);
					})
					.catch(function(err) {
						log.error('getHeaters promise rejected: ' + err);
					});
				}
				else {
					log.error('setCommandForAllHeaters : UPDATE query failed');
				}
			}
		);
	}


	getHeaters() {
		var p = new Promise(function(resolve, reject) {
			db.all(
				"SELECT * FROM dashboard",
				[],
				(err, rows) => {
					if (!err) {
						var reply = {
							type: 'heaters',
							data: rows
						};
						resolve(reply);
					}
					else {
						log.error('getHeaters : SELECT query failed');
						reject(err);
					}
				}
			);
		});
		return p;
	}


	infiniteReading() {
		var lineReader;

		lineReader = readline.createInterface({
			input: fs.createReadStream('/dev/ttyAMA0', {autoClose: false}),
		});

		lineReader.on('close', () => {
			log.info('********** LINE READER CLOSED');
			this.infiniteReading();
		});

		lineReader.on('line', line => {
			var rcvdMessage = '';
			var emitMessage = {};

			rcvdMessage = line.search('IINST');
			if (rcvdMessage !== -1) {
				var phase = parseInt(line.substr(5, 1));
				var amperes = parseInt(line.substr(7, 3));

				emitMessage.type = 'current';
				emitMessage.data = {
					phase: phase,
					value: amperes
				};
				this.emit('notification', emitMessage);
				this.statistics.addIntensity(amperes, phase);
				
				if (amperes >= 30) {
					log.info('IINST phase ' + phase + ' : ' + amperes);
					this.switchOneOff(phase);
				}
				else {
					log.debug('IINST phase ' + phase + ' : ' + amperes);
					this.switchOneBack(phase);
				}
				return;
			}

			rcvdMessage = line.search('ADIR');
			if (rcvdMessage !== -1) {
				var phase_dep = parseInt(line.substr(4, 1));
				var amper_dep = parseInt(line.substr(6, 3));
				emitMessage.type = 'current';
				emitMessage.data = {
					phase: phase_dep,
					value: amper_dep
				};
				this.emit('notification', emitMessage); 
				this.statistics.addIntensity(amper_dep, phase_dep);
				log.info('ADIR phase ' + phase_dep + ' : ' + amper_dep);
				this.switchOneOff(phase_dep);
				return;
			}

			rcvdMessage = line.search('HCHP');
			if (rcvdMessage !== -1) {
				var hp = parseInt(line.substr(5, 10));
				emitMessage.type = 'meter';
				emitMessage.data = {
					period: 'standard',
					value: hp
				};
				this.emit('notification', emitMessage); 
				this.statistics.addStandardMeter(hp);
				log.debug('hp : ' + hp);
				return;
			}

			rcvdMessage = line.search('HCHC');
			if (rcvdMessage !== -1) {
				var hc = parseInt(line.substr(5, 10));
				emitMessage.type = 'meter';
				emitMessage.data = {
					period: 'savings',
					value: hc
				};
				this.emit('notification', emitMessage); 
				this.statistics.addSavingsMeter(hc);
				log.debug('hc : ' + hc);
				return;
			}

			rcvdMessage = line.search('PAPP');
			if (rcvdMessage !== -1) {
				var watts = parseInt(line.substr(5, 5));
				var timestamp = Date.now() / 1000;
				emitMessage.type = 'power';
				emitMessage.data = {
					time: timestamp,
					value: watts
				};
				this.emit('notification', emitMessage);
				this.statistics.addPower(watts);
				log.debug('watts : ' + watts); 
				return;
			}
		});
	}
}

// exports a single instance
var teleinfo = new Teleinfo();
module.exports = teleinfo;