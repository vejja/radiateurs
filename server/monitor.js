var i2cBus = require('i2c-bus').openSync(1);
var readline = require('readline');
var fs = require('fs');
var sqlite3 = require('sqlite3');
var db = new sqlite3.Database('/home/pi/radiateurs/server/radiateurs.db');
var events = require('events');
var log = require('./logger');

var ARRET = 0b01;	// demi pos = arret
var MARCHE = 0b00;	// ni pos ni neg = marche
var ECO = 0b11;		// signal complet = eco
var HORSGEL = 0b10;	// demi neg = hors gel


function I2CController() {

	var IODIRA = 0x00;	// Direction du port A (input/output)
	var IODIRB = 0x01;	// Direction du port B (input/output)
	var GPIOA = 0x12;   // Adresse du port A en mode input
	var GPIOB = 0x13;   // Adresse du port B en mode input
	var OLATA = 0x14;	// Adresse du port A en mode output
	var OLATB = 0x15;	// Adresse du port B en mode output

	// Adresse du module I2C sur lequel communiquer
	// numModule : le numero 0, 1 ou 2
	var getModuleAddress = function(i2cModule) {
		if (i2cModule < 0b000 || i2cModule > 0b010)
			return false;
		// L'adresse du MCP23017 est construite sur 7 bits : 0 1 0 0 A2 A1 A0
		// Le numero de module est egal à son adresse en binaire : A2 A1 A0
		// Par exemple 0x20 pour 000, 0x21 pour 001, Ox22 pour 010, etc...
		// Il suffit donc de faire un bitwise OR de 0 1 0 0 0 0 0 et de A2 A1 A0
		// (Attention sur la carte pilote j'ai inversé, A0 est à gauche et A2 à droite
		// quand les connecteurs I2C sont en haut sur le rail)
		return (0b0100000 | i2cModule);
	};

	// Récupère l'état des 8 radiateurs sur un module donnée
	// module : le numéro du module (0-2)
	// Renvoie un array de 8 valeurs, chacune d'entre elles peut être ARRET, MARCHE, ECO ou HORSGEL

	this.readStates = function (phase) {
		var device = getModuleAddress(phase - 1);

		// Toutes les broches sont utilisées en output sur le port A et sur le port B
		// Lit les valeurs préexistantes sur le port A et sur le port B
		//i2cBus.writeByteSync(device, IODIRA, 0b00000000);
		var portA = i2cBus.readByteSync(device, GPIOA);
		//i2cBus.writeByteSync(device, IODIRB, 0b00000000);
		var portB = i2cBus.readByteSync(device, GPIOB);
		
		var commandsA = [];
		var commandsB = [];

		for (i=0; i<4; i++) {
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
	};

	// Change l'état des fils pilotes
	// module : le numéro de module (0-2) correspondant aux cavaliers (000, 001, 010)
	// wires : un array avec 8 valeurs, chacune d'entre elles peut être MARCHE, ARRET, ECO ou HORSGEL
	this.writeStates = function(phase, wires) {
		var device = getModuleAddress(phase - 1);

		var portA = 0b00;
		var portB = 0b00;

		for (i=3; i>=0; i--) {
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
		i2cBus.writeByteSync(device, IODIRA, 0b00000000);
		i2cBus.writeByteSync(device, OLATA, portA);
		i2cBus.writeByteSync(device, IODIRB, 0b00000000);
		i2cBus.writeByteSync(device, OLATB, portB);
	}

	// Initialise les ports A et B de chaque module en mode output
	for (phase = 1; phase <= 3; phase++) {
		var device = getModuleAddress(phase - 1);
		i2cBus.writeByteSync(device, IODIRA, 0b00000000);
		i2cBus.writeByteSync(device, IODIRB, 0b00000000);
	}
}

function Teleinfo() {
	events.EventEmitter.call(this); 	// call parent class constructor

	this.savedCommands = [
		[ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET],
		[ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET],
		[ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET, ARRET],
	];
	this.nbrSwitchedOff = [0, 0, 0]; 	// nombre de radiateurs delestés
	
	this.i2cController = new I2CController();
	
	var self = this;

	var switchOneOff = (phase) => {
		var limitIndex = 7 - self.nbrSwitchedOff[phase - 1];
		if (limitIndex >= 0) {
			var savedStates = self.savedCommands[phase - 1];
			var newStates = savedStates.map((state, index) => {
				if (index >= limitIndex) {
					return ARRET;
				} else {
					return state;
				}
			});
			self.i2cController.writeStates(phase, newStates);
			++self.nbrSwitchedOff[phase - 1];
			log.debug('phase ' + phase + '; nbr delestés ' + self.nbrSwitchedOff[phase - 1]);
			var data = {
				phase: phase,
				value: self.nbrSwitchedOff[phase - 1]
			};
			var emitMessage = {
				type: 'switch',
				data: data
			};
			self.emit('notification', emitMessage);
			self.saveMessage(emitMessage);
		}
	};

	var switchOneBack = (phase) => {
		var limitIndex = 8 - self.nbrSwitchedOff[phase - 1];
		if (limitIndex <= 7) {
			var savedStates = self.savedCommands[phase - 1];
			var newStates = savedStates.map((state, index) => {
				if (index > limitIndex) {
					return ARRET;
				} else {
					return state;
				}
			});
			self.i2cController.writeStates(phase, newStates);
			--self.nbrSwitchedOff[phase - 1];
			log.debug('phase ' + phase + '; nbr delestés ' + self.nbrSwitchedOff[phase - 1]);
			var data = {
				phase: phase,
				value: self.nbrSwitchedOff[phase - 1]
			};
			var emitMessage = {
				type: 'switch',
				data: data
			};
			self.emit('notification', emitMessage);
			self.saveMessage(emitMessage);
		}
	};

	// Initialise les ordres GIFAM à partir de la base de données
	var initHeatersFromDatabase = function() {
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
					self.savedCommands[row.phase - 1][row.wire - 1] = row.command;
				});
				
				// Reload les valeurs sur les modules I2C
				// En prenant en compte les radiateurs déjà en cours de délestage
				self.savedCommands.forEach((savedStates, phaseIndex) => {
					var limitIndex = 7 - self.nbrSwitchedOff[phaseIndex];
					var newStates = savedStates.map((state, wireIndex) => {
						if (wireIndex > limitIndex) {
							return ARRET;
						} else {
							return state;
						}
					});
					self.i2cController.writeStates(phaseIndex + 1, newStates);
				});

				for (phase = 1; phase <= 3; ++phase) {
					log.info("read phase #" + phase + " : " + self.i2cController.readStates(phase));
				}
			}
		);
	};

	var getCommandForHeater = function(phase, wire) {
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
	};

	this.getCommandForHeater = getCommandForHeater;

	this.setCommandForHeater = function(command, id) {
		if (command < 0 || command > 3) {
			log.error('setCommandForHeater: wrong command');
			return;
		}
		db.run(
			"UPDATE dashboard SET command = ? WHERE id = ?",
			[command, id],
			(err) => {
				if (!err) {
					initHeatersFromDatabase();
					self.getHeaters()
					.then(function(reply) {
						self.emit('notification', reply);
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
	};

	this.setCommandForAllHeaters = function(command) {
		if (command < 0 || command > 3) {
			log.error('setCommandForAllHeaters: wrong command');
			return;
		}
		db.run(
			"UPDATE dashboard SET command = ?", 
			[command],
			(err) => {
				if (!err) {
					initHeatersFromDatabase();
					self.getHeaters()
					.then(function(reply) {
						self.emit('notification', reply);
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
	};


	this.getHeaters = function() {
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
	};

	this.saveMessage = function(msg) {
		/*
		if (!('type' in msg)) {
			log.error('no type to save message in db');
			return;
		}

		var sqlParams = {
			$type: msg.type,
			$phase: null,
			$period: null,
		};

		switch (msg.type) {
			case 'current':
			case 'switch':
				sqlParams.$phase = msg.data.phase;
			break;
			
			case 'meter':
				sqlParams.$period = msg.data.period; 
			break;

			case 'power':
			break;
		}

		var getQuery = "SELECT value FROM ticks WHERE type = $type AND phase = $phase AND period = $period ORDER BY rowid DESC LIMIT 1;";
		memdb.get(getQuery, sqlParams, (err, row) => {
			if (err) {
				log.error('saveMessage error : SELECT query failed; ' + err);
			} else if ((row == null) || (row.value != msg.value)) {
				var insertQuery = "INSERT INTO ticks (type, phase, period, value) VALUES ($type, $phase, $period, $value);";
				sqlParams.$value = msg.data.value,
				memdb.run(insertQuery, sqlParams, (err) => {
					if (err) {
						log.error('saveMessage error : INSERT query failed; ' + err);
					}
				});
			}
		});	
		*/
	};

	var initMsgMemory = function() {
		/*
		memdb.run("CREATE TABLE ticks(timestamp INTEGER(4) NOT NULL DEFAULT (strftime('%s','now')), type STRING, phase INTEGER, period STRING, value INTEGER);");
		setInterval(() => { 
			memdb.run("DELETE FROM ticks WHERE timestamp < $yesterday", { $yesterday : Date.now() / 1000 - 3600 * 24 }, (err) => {
				if (err) {
					log.error('saveMessage error : DELETE query failed; ' + err);
				}
			});    
		}, 600000);
		*/
	};


	var infiniteReading = function() {
		var lineReader;

		lineReader = readline.createInterface({
			input: fs.createReadStream('/dev/ttyAMA0', {autoClose: false}),
		});

		lineReader.on('close', function() {
			log.info('********** LINE READER CLOSED');
			infiniteReading();
		});

		lineReader.on('line', function(line) {
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
				self.emit('notification', emitMessage);
				self.saveMessage(emitMessage);
				
				if (amperes >= 30) {
					log.info('IINST phase ' + phase + ' : ' + amperes);
					switchOneOff(phase);
				}
				else {
					log.debug('IINST phase ' + phase + ' : ' + amperes);
					switchOneBack(phase);
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
				self.emit('notification', emitMessage); 
				self.saveMessage(emitMessage);
				log.info('ADIR phase ' + phase_dep + ' : ' + amper_dep);
				switchOneOff(phase_dep);
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
				self.emit('notification', emitMessage); 
				self.saveMessage(emitMessage);
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
				self.emit('notification', emitMessage); 
				self.saveMessage(emitMessage);
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
				self.emit('notification', emitMessage);
				self.saveMessage(emitMessage);
				log.debug('watts : ' + watts); 
				return;
			}
		});
	};

	initHeatersFromDatabase();
	initMsgMemory();
	infiniteReading();

}

// subclass Teleinfo extends superclass EventEmitter
Teleinfo.prototype = Object.create(events.EventEmitter.prototype);
Teleinfo.prototype.constructor = Teleinfo;

// exports a single instance
var teleinfo = new Teleinfo();

module.exports = teleinfo;