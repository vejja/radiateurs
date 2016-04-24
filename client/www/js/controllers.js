angular.module('app.controllers', [])

.controller('sideCtrl', function($scope, Heaters, Connection) {
	$scope.connectionType = Connection.type;
	$scope.uniformCommand = Heaters.uniformCommand;
	Heaters.getAllHeaters();
	$scope.setCommand = function(command) {
		Heaters.setCommandForAllHeaters(command);
	};

})
  
.controller('delestageCtrl', function($scope, $http, $interval, Connection, $rootScope) {
	var interval = $interval(
		function() {
			$http.get(Connection.baseUrl() + 'phasestatus')
			.then(
				function(response) {
					// en cas de success
					// response.data est un tableau avec les informations de delestage par phase
					$scope.phases = response.data;
				},
				function(response) {
					// en cas d'erreur
					console.log('erreur ' + response.statusText);
				}
			);
		},
		1000
	);

	$rootScope.$on('leavingDelestage', function() {
		$interval.cancel(interval);
	});
})
   
.controller('consommationCtrl', function($scope) {

})
   
.controller('tableauCtrl', function($scope, Heaters) {
	$scope.phases = Heaters.heatersByPhase;
	Heaters.getAllHeaters();
	$scope.setCommand = function(heater, command) {
		var heaterId = heater.id;
		Heaters.setCommandForHeater(heaterId, command);
	};
/*
	$ionicPopover.fromTemplateUrl('templates/popover.html', {
    	scope: $scope
    }).then(function(popover) {
		$scope.popover = popover;
	});

	$scope.openPopover = function($event, heater) {
		$scope.popover.show($event);
		$scope.selectedHeater = heater;
	};
	$scope.closePopover = function() {
		$scope.popover.hide();
	};
	//Cleanup the popover when we're done with it!
	$scope.$on('$destroy', function() {
		$scope.popover.remove();
	});
	// Execute action on hide popover
	$scope.$on('popover.hidden', function() {
		// Execute action
	});
	// Execute action on remove popover
	$scope.$on('popover.removed', function() {
	// Execute action
	});
*/
});
       