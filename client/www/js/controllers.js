angular.module('app.controllers', [])

.controller('sideCtrl', function($scope, System, $ionicPopover) {
	$scope.system = System;
	System.loadAllHeaters();

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
	$scope.system = System;
})
   
.controller('consommationCtrl', function($scope, System) {
	$scope.system = System;
	$scope.chartData = [
		{label: 'power', values:[{}]}
	];
})
   
.controller('tableauCtrl', function($scope, System) {
	$scope.system = System;
	System.loadAllHeaters();
	$scope.setCommand = function(heater, command) {
		var heaterId = heater.id;
		System.setCommandForOneHeater(heaterId, command);
	};
});
       