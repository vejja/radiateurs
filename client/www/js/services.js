angular.module('app.services', [])

.factory('Heaters', function($q, $http, Connection){
	var heaters = [];
	var heatersByPhase = [];
	var uniformCommand = {value: -1};


	var filterHeatersByPhase = function() {
		for (var phase = 0; phase < 3; ++phase) {
			var selectedHeaters = heaters.filter(function(element) {
				return (element.phase == phase + 1);
			});
			heatersByPhase[phase] = {
				number : phase + 1,
				heaters: selectedHeaters
			};
		}
	};

	var reduceToUniformCommand = function() {
		uniformCommand.value = heaters.reduce(function(previousValue, currentValue) {
			return ((previousValue.command === currentValue.command) ? currentValue : -1);
		}).command;
	};

	var setCommandForHeater = function (heaterId, command) {
		var body = {id: heaterId, command: command};
		$http.post(Connection.baseUrl() + 'command', body)
		.then(
			function(response) {
				heaters = response.data;
				filterHeatersByPhase();
				reduceToUniformCommand();
			},
			function(response) {
				console.log('erreur ' + response.statusText);
			}
		);
	};

	var setCommandForAllHeaters = function(command) {
		var body = {command: command};
		$http.post(Connection.baseUrl() + 'commands', body)
		.then(
			function(response) {
				heaters = response.data;
				filterHeatersByPhase();
				reduceToUniformCommand();
			},
			function(response) {
				console.log('erreur ' + response.statusText);
			}
		);
	};

	var getAllHeaters = function() {
		$http.get(Connection.baseUrl() + 'list')
		.then(
			function(response) {
				// en cas de success
				// response.data est un tableau avec les informations de delestage par phase
				heaters = response.data;
				filterHeatersByPhase();
				reduceToUniformCommand();
			},
			function(response) {
				// en cas d'erreur
				console.log('erreur ' + response.statusText);
			}
		);
	};

	return {
		heaters: heaters,
		heatersByPhase: heatersByPhase,
		uniformCommand: uniformCommand,

		getAllHeaters: getAllHeaters,
		setCommandForHeater: setCommandForHeater,
		setCommandForAllHeaters: setCommandForAllHeaters,
	};

})

.factory('Connection', function() {
	var type = {value: 'lan'};

	return {
		type: type,
		baseUrl: function() {
			if (type.value == 'lan')
				return 'http://192.168.1.6:3000/';
			return 'http://erquy.vejja.fr:3030/';
		}
	};
})

.service('BlankService', [function(){

}]);

