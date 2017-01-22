angular.module('app.controllers', [])

.controller('sideCtrl', function($scope, System, $ionicPopover) {
	$scope.system = System;

	$scope.setCommand = function(command) {
		System.setCommandForAllHeaters(command);
	};
	$scope.setConnectionType = function(type) {
		System.setConnectionType(type);
		$scope.closePopover();
	};

	// .fromTemplateUrl() method
	$ionicPopover.fromTemplateUrl('templates/networkPopover.html', {
		scope: $scope
	}).then(function(popover) {
		$scope.popover = popover;
	});

	$scope.openPopover = function($event) {
		$scope.popover.show($event);
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
})
  
.controller('delestageCtrl', function($scope, System) {
	//$scope.system = System;
})
   
.controller('consommationCtrl', function($scope, System) {
	//$scope.system = System;
})
   
.controller('tableauCtrl', function($scope, System) {

	$scope.setCommandForOneHeater = function(heater, command) {
		var heaterId = heater.id;
		System.setCommandForOneHeater(heaterId, command);
	};
})

.controller('historyCtrl', function($scope, System) {

	$scope.changeHistoryRange = function() {
		var newHistoryRange = '24h';
		switch (System.historyRange) {
			case '24h':
			newHistoryRange = '7j';
			break;

			case '7j':
			newHistoryRange = '1m';
			break;

			case '1m':
			newHistoryRange = '12m';
			break;

			case '12m':
			newHistoryRange = 'inf';
			break;

			default:
			break;
		}
		System.refreshHistory(newHistoryRange);
	};

	$scope.refreshHistory = function() {
		System.refreshHistory(System.historyRange);
	};
});
       