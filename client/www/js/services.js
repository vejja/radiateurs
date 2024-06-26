angular.module('app.services', [])


.factory('System', function($rootScope, $timeout, Connection) {

	var system = {};

	system.uniformCommand = undefined;				// variable dont la valeur indique si tous les radiateurs ont la même commande
	system.commands = {
		ARRET: 0b01,	// demi pos = arret
		MARCHE: 0b00,	// ni pos ni neg = marche
		ECO: 0b11,		// signal complet = eco
		HORSGEL: 0b10	// demi neg = hors gel 
	};
	system.phases = [				// array de 3 objects, chacun du type {number: <numero de la phase>, heaters: <array des radiateurs>, switchedOff: <nbre de delestés>, current: <intensite de la phase>}
		{number:1, heaters: [], switchedOff: 0, current: 0},
		{number:2, heaters: [], switchedOff: 0, current: 0},
		{number:3, heaters: [], switchedOff: 0, current: 0},
	];
	system.meter =  {							// valeur du compteur
		standard: 0, 
		savings: 0
	};
	system.power = undefined;
	system.powerChart = {
		options: {
			animation: {
				duration: 0
			},
			elements: {
				point: {
					radius: 0
				}
			},
			scales: {
				gridLines: {
					display: false
				}
			},
		},
		colors: ['#ef473a'],
		labels: new Array(30), 
		data: new Array(30),
	};

	system.historyRange = "24h";
	system.powerHistoryChart = {
		colors: [],
		labels: [], 
		data: [],
	};

	system.intensityHistoryChart = {
		options: {
			scales: {
				xAxes: [{
					stacked: true,
				}],
				yAxes: [{
					stacked: true
				}]
			},
			legend: {
				display: true
			}
		},
		colors : ['#FFD54F', '#FFB300', '#FF6F00'],
		series: ['phase1', 'phase2', 'phase3'],
		labels: [], 
		data: [],
	};

	system.connection = Connection;

	var websocket = {};
	var protocol = "UNTOKENGENEREAUHASARDPOURACCEDERAUSERVEURWEBSOCKET";
	
	function updateSystem() {
		if (!$rootScope.$$phase) {
			$rootScope.$digest();
			//console.log('digest');
		}
	}

	function initSystem() {
		sendMessage('loadAllHeaters', null);
		sendMessage('loadHistory', system.historyRange);
	}

	function createWebSocket() {

		var url = Connection.baseUrl();
		websocket = new WebSocket(url, protocol);

		websocket.onopen = function(event) {
			console.log('websocket open event', event);
			Connection.status = 'on';
			initSystem();
		};

		websocket.onmessage = function(event) {
			var message = JSON.parse(event.data);
			switch (message.type) {
				case 'heaters' :
					//console.log('heaters', message.data);
					updateAllHeaters(message.data);
					break;
				case 'heater' :
					//console.log('heater', message.data);
					updateOneHeater(message.data);
					break;
				case 'current' :
					//console.log('current', message.data);
					updateCurrent(message.data);
					break;
				case 'meter' :
					//console.log('meter', message.data);
					updateMeter(message.data);
					break;
				case 'power' :
					//console.log('power', message.data);
					updatePower(message.data);
					break;
				case 'switch' :
					//console.log('switch', message.data);
					updateSwitchedOff(message.data);
					break;
				case 'history' :
					//console.log('history');
					updateHistory(message.data);
					break;
			}
			updateSystem();
		};

		websocket.onerror = function(error) {
			console.log('websocket error event', error.code);
			websocket.close();
		};

		websocket.onclose = function(event) {
			console.log('websocket close event', event);
			if (event.code === 4000) {
				console.log('restart required manually');
				setTimeout(function() {createWebSocket();}, 0);
			}
			else {
				console.log('waiting for 10 secs');
				setTimeout(function() {createWebSocket();}, 10000);
			}
			Connection.status = 'off';
			updateSystem();
		};
	}

	createWebSocket();

	function sendMessage(type, data) {
		if (websocket.readyState !== WebSocket.OPEN) {
			Connection.status = 'off';
			console.log('cannot send, state not ready');
		}
		else {
			Connection.status = 'on';
			var message = {
				type: type,
				data: data
			};
			websocket.send(JSON.stringify(message));
		}
		updateSystem();
	}
	/**
	 * Met à jour tous les radiateurs
	 *
	 * @param heaters	Array des radiateurs (rows) de la base sqlite
	 */ 
	function updateAllHeaters(heaters) {

		for (var phase = 0; phase < 3; ++phase) {
			system.phases[phase].heaters = filterHeatersByPhase(heaters, phase);
		}
		system.uniformCommand = reduceToUniformCommand(heaters); 
	}

	function filterHeatersByPhase(heaters, phase) {
		var filteredHeaters = heaters.filter(function(element) {
			return (element.phase == phase + 1);
		});
		return filteredHeaters;
	}

	/**
	 * Met à jour un radiateur
	 *
	 * @param heaters	Element radiateur (row) de la base sqlite
	 */ 
	function updateOneHeater(heater) {
		// Regroupe tous les radiateurs
		var heaters = flattenHeaters();

		// Trouve le radiateur qui a la même id
		var selectedHeater = heaters.find(function(element) {
			return (element.id === heater.id);
		});

		// Update l'element par reference
		selectedHeater = heater;
		// Recalcule la commande uniforme
		system.uniformCommand = reduceToUniformCommand(heaters);


	}

	function flattenHeaters() {
		// Rassemble les radiateurs par phase dans un seul tableau
		var heaters = [];

		for (var phase = 0; phase < 3; ++phase) {
			heaters.concat(status.phases[phase].heaters);
		}

		return heaters;
	}

	/**
	 * Met à jour l'intensité des phases
	 *
	 * @param currentData	Object {phase: <numero de la phase>, value: <intensite>}
	 */ 
	function updateCurrent(currentData) {
		var phase = currentData.phase;
		var current = currentData.value;
		system.phases[phase - 1].current = current;
	}

	/**
	 * Met à jour le compteur
	 *
	 * @param meterData		Object {period: <standard/savings>, value: <nombre>}
	 */ 
	function updateMeter(meterUpdate) {
		var period = meterUpdate.period;
		var count = meterUpdate.value;
		system.meter[period] = count;
	}

	/**
	 * Met à jour la puissance instantanée
	 *
	 * @param powerData		Object {time: <timestamp en secondes>, value: <puissance en watts>}
	 */ 
	function updatePower(powerData) {
		system.power = powerData.value;
		var date = new Date(powerData.time*1000);
		var label = date.toString().split(" ")[4];
		system.powerChart.labels.push(label);
		system.powerChart.labels.shift();
		system.powerChart.data.push(powerData.value);
		system.powerChart.data.shift();
	}

	/**
	 * Met à jour les historiques
	 * 
	 * @param historyData
	 */
	function updateHistory(data) {
		system.historyRange = data.range;
		system.powerHistoryChart.labels = [];
		system.powerHistoryChart.data = [];
		system.powerHistoryChart.colors = [];
		system.intensityHistoryChart.labels = [];
		system.intensityHistoryChart.data = [[], [], []];
		var historyData = data.history;
		historyData.forEach(function(historyDataRow) {
			var start = historyDataRow.start;
			var off1 = historyDataRow.off1;
			var off2 = historyDataRow.off2;
			var off3 = historyDataRow.off3;
			var int1 = historyDataRow.int1;
			var int2 = historyDataRow.int2;
			var int3 = historyDataRow.int3; 
			var watts = historyDataRow.watts;
			var meter = historyDataRow.meter;

			var didStartOn = new Date(start * 1000).toString().split(" ");
			var label = didStartOn[0] + " " + didStartOn[1] + " " + didStartOn[2] + " " + didStartOn[3] + " " + didStartOn[4];
			system.powerHistoryChart.labels.push(label);
			system.powerHistoryChart.data.push(watts);
			system.powerHistoryChart.colors.push("#9C27B0");
			system.intensityHistoryChart.labels.push(label);
			system.intensityHistoryChart.data[0].push(int1);
			system.intensityHistoryChart.data[1].push(int2);
			system.intensityHistoryChart.data[2].push(int3);
		});
	}

	/**
	 * Met à jour le nombre de radiateurs delestés
	 *
	 * @param switchedOffData	Object {phase: <numero de la phase>, value: <nombre de delestés>}
	 */ 
	function updateSwitchedOff(switchedOffData) {
		system.phases[switchedOffData.phase - 1].switchedOff = switchedOffData.value;
	}


	function reduceToUniformCommand(heaters) {
		// Renvoie le dernier radiateur si les commandes sont toutes égales, sinon renvoie undefined
		var uniformHeater = heaters.reduce(function(previousHeater, currentHeater) {
			return ((previousHeater.command === currentHeater.command) ? currentHeater : -1);
		});

		// Renvoie la commande commune (ou undefined)
		return uniformHeater.command;
	}


	system.setCommandForOneHeater = function (heaterId, command) {
		var data = {id: heaterId, command: command};
		sendMessage('command', data);
	};

	system.setCommandForAllHeaters = function(command) {
		var data = command;
		sendMessage('uniformCommand', data);
	};

	system.refreshHistory = function(newHistoryRange) {
		sendMessage('loadHistory', newHistoryRange);
	}

	system.setConnectionType = function(type) {
		Connection.type = type;
		if (websocket.readyState == WebSocket.CONNECTING) {
			createWebSocket();
		}
		else {
			websocket.close(4000);
		}
	};

	return system;

})

.factory('Connection', function() {
	var connection = {
		status: 'off',
		type: 'wan'
	};

	connection.baseUrl = function() {
		if (connection.type == 'lan')
			return 'ws://192.168.1.6:3000/';
		return 'wss://erquy.vejja.fr:443/api';
	};

	return connection;
})

.service('BlankService', [function(){

}]);

