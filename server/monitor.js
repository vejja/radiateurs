var i2cBus = require('i2c-bus').openSync(1);
var readline = require('readline');
var fs = require('fs');
var sqlite3 = require('sqlite3');
var db = new sqlite3.Database('/home/pi/radiateurs/server/radiateurs.db');
var events = require('events');
var log = require('./logger');


var ARRET = 0;
var MARCHE = 1;
var ECO = 2;
var HORSGEL = 3;


function I2CController() {

	var IODIRA = 0x00;	// Direction du port A (input/output)
	var IODIRB = 0x01;	// Direction du port B (input/output)
	var OLATA = 0x14;	// Valeurs du port A en mode output
	var OLATB = 0x15;	// Valeurs du port B en mode output


	// Adresse du module I2C sur lequel communiquer
	// numModule : le numero 0, 1 ou 2
	var getModuleAddress = function(module) {
		if (module < 0b000 || module > 0b010)
			return false;
		// L'adresse du MCP23017 est construite sur 7 bits : 0 1 0 0 A2 A1 A0
		// Le numero de module est egal à son adresse en binaire : A2 A1 A0
		// Par exemple 0x20 pour 000, 0x21 pour 001, Ox22 pour 010, etc...
		// Il suffit donc de faire un bitwise OR de 0 1 0 0 0 0 0 et de A2 A1 A0
		// (Attention sur la carte pilote j'ai inversé, A0 est à gauche et A2 à droite
		// quand les connecteurs I2C sont en haut sur le rail)
		return (0b0100000 | module);
	};

	// Helper. Renvoie le registre IODIR correspondant à un fil pilote
	// wire : numero de fil pilote entre 1 et 8
	var getIodirRegister = function(wire) {
		// Le registre IODIR determine le sens d'écriture des Ports GPIO (output ou input)
		// Les fils pilotes 1 à 4 sont commandés par le port A
		// et les fils pilotes 5 à 9 sont commandés par le port B
		if (wire <= 4) {
			return IODIRA;
		}
		return IODIRB;
	};

	// Helper. Renvoie le registre OLAT correspondant à un fil pilote
	// wire : numero de fil pilote entre 1 et 8
	var getOlatRegister = function(wire) {
		// Le registre OLAT détermine la valeur à écrire sur le port GPIO qaund celui-ci est en mode output
		// Les fils pilotes 1 à 4 sont commandés par le port A
		// et les fils pilotes 5 à 9 sont commandés par le port B
		if (wire <= 4) {
			return OLATA;
		}
		return OLATB;
	};

	// Helper. Masque construit avec des 00 sur l'emplacement des bits significatifs
	var getPinMask = function(wire) {
		if (wire === 1 || wire === 5)
			return 0b11111100;

		else if (wire === 2 || wire === 6)
			return 0b11110011;

		else if (wire === 3 || wire === 7)
			return 0b11001111;

		else if (wire === 4 || wire === 8)
			return 0b00111111;

		return false; // erreur de numero de fil pilote
	};

	// Encrypte la commande GIFAM à transmettre
	// command : 0 pour arret, 1 pour marche, 2 pour eco, 3 pour hors-gel
	var getOrderMask = function(command) {
		if (command === ARRET)   // ordre d'arret
			return 0b01010101; // demi pos

		else if (command === MARCHE) // ordre de marche
			return 0b00000000; // ni pos, ni neg

		else if (command === ECO) // ordre de eco
			return 0b11111111; // signal complet

		else if (command === HORSGEL) // ordre de hors-gel
			return 0b10101010; // demi neg

		return false;    // erreur de numero d'ordre
	};

	// Helper. Sert à calculer le nombre de bits qu'il faut déplacer vers la droite
	// wire : numero de fil pilote entre 1 et 8
	var getShiftPlaces = function(wire) {
		if (wire === 1 || wire === 5)
			return 0;

		else if (wire === 2 || wire === 6)
			return 2;

		else if (wire === 3 || wire === 7)
			return 4;

		else if (wire === 4 || wire === 8)
			return 6;

		return false; // erreur de fil pilote
	};

	// Récupère l'état actuel d'un fil pilote 
	// module : le numéro du module (0-2)
	// wire : le numéro du fil pilote (1-8)
	this.readState = function (module, wire) {
		var device = getModuleAddress(module);
		var iodir = getIodirRegister(wire);
		var olat = getOlatRegister(wire);
		var shift = getShiftPlaces(wire);

		if (device === false || shift === false)
			return false;

		// Toutes les broches sont utilisées en output
		i2cBus.writeByteSync(device, iodir, 0b00000000);

		// Lit la valeur pre-existante sur le port
		var state = i2cBus.readByteSync(device, olat); // Lit les 8 broches du registre de sortie
		state = state >> shift; // ramene les 2 broches significatives sur les 2 positions les plus à droite
		state = state & 0b00000011; // ne garde que ces 2 derniers bits

		if (state === 0b00)			// ni pos ni neg = marche
			return MARCHE;
		else if (state === 0b01)	// demi pos = arret
			return ARRET;
		else if (state === 0b10)	// demi neg = hors gel
			return HORSGEL;
		else if (state === 0b11)	// signal complet = eco
			return ECO;

		return false;
	};

	// Change l'etat d'un fil pilote
	// module : le numero de modile (0-2) correspondant aux cavaliers (000, 001, 010)
	// wire : numero du fil pilote, compris entre 1 et 8
	// command : ordre a transmettre, c'est a dire 0 pour arret, 1 pour marche, 2 pour eco, 3 pour hors-gel
	this.writeState = function(module, wire, command) {
		//	# Encrypte le module I2C sur lequel communiquer
		var device = getModuleAddress(module);
		var iodir = getIodirRegister(wire);
		var olat = getOlatRegister(wire);
		var mask = getPinMask(wire);
		var order = getOrderMask(command);

		if (device === false || mask === false || order === false)
			return false;

		// Toutes les broches sont utlisées en output
		i2cBus.writeByteSync(device, iodir, 0b00000000);

		// Ne garde que les 2 broches à modifier sur l'ordre
		order = order & (~mask);

		// Lit la valeur pre-existante sur le port
		var current_state = i2cBus.readByteSync(device, olat); // lit les 8 broches du registre de sortie
		current_state = current_state & mask; // efface les 2 broches à modifier

		// Modifie la valeur de l'ordre sur les broches de sortie
		order = current_state | order; // Modifie les 2 broches en y inscrivant l'ordre	
		i2cBus.writeByteSync(device, olat, order); // ecrit les 8 broches du registre de sortie

		return;
	};
}

function Teleinfo() {
	events.EventEmitter.call(this); 	// call parent class constructor

	this.nbrSwitchedOff = [0, 0, 0]; 	// nombre de radiateurs delestés
	this.i2cController = new I2CController();
	var self = this;

	function nextSwitchOff(phase) {
		return (8 - self.nbrSwitchedOff[phase - 1]);
	}

	var switchOneOff = function(phase) {
		var wire = nextSwitchOff(phase);
		if (wire > 0) {
			self.i2cController.writeState(phase - 1, wire, ARRET);
			++self.nbrSwitchedOff[phase - 1];
			log.debug('phase ' + phase + ': delestage du fil #' + wire);
			var data = {
				phase: phase,
				value: self.nbrSwitchedOff[phase - 1]
			};
			var emitMessage = {
				type: 'switch',
				data: data
			};
			self.emit('notification', emitMessage);
		}
	};

	function nextSwitchBack(phase) {
		return (9 - self.nbrSwitchedOff[phase - 1]);
	}

	var switchOneBack = (phase) => {
		var wire = nextSwitchBack(phase);
		if (wire < 9) {
			self.getCommandForHeater(phase, wire)
			.then((command) => {
				self.i2cController.writeState(phase - 1, wire, command);
				--self.nbrSwitchedOff[phase - 1];
				log.debug('phase ' + phase + ': relestage du fil #' + wire);
				var data = {
					phase: phase,
					value: self.nbrSwitchedOff[phase - 1]
				};
				var emitMessage = {
					type: 'switch',
					data: data
				};
				self.emit('notification', emitMessage);
			})
			.catch((err) => {
				if (err === undefined) {
					--self.nbrSwitchedOff[phase - 1];
					log.debug('phase ' + phase + ': relestage virtuel du fil #' + wire);
					var data = {
						phase: phase,
						value: self.nbrSwitchedOff[phase - 1]
					};
					var emitMessage = {
						type: 'switch',
						data: data
					};
					self.emit('notification', emitMessage);
				}
			});
		}
	};

	// Initialise les ordres GIFAM à partir de la base de données
	var initHeatersFromDatabase = function() {
		db.all(
			"SELECT * FROM dashboard",
			[], 
			(err, rows) => {
				if (err) {
					log.error('initHeatersFromDatabase : SELECT query failed; ' + err);
					return;
				}		
				for (var i = 0; i < rows.length; ++i) {
					var heater = rows[i];
					var wire = heater.wire;
					var phase = heater.phase;
					var command = heater.command;
					self.i2cController.writeState(phase - 1, wire, command);
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
				log.debug('watts : ' + watts); 
				return;
			}
		});
	};

	initHeatersFromDatabase();
	infiniteReading();

}

// subclass Teleinfo extends superclass EventEmitter
Teleinfo.prototype = Object.create(events.EventEmitter.prototype);
Teleinfo.prototype.constructor = Teleinfo;

// exports a single instance
var teleinfo = new Teleinfo();

module.exports = teleinfo;