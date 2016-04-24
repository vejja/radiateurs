angular.module('app.routes', [])

.config(function($stateProvider, $urlRouterProvider) {

  // Ionic uses AngularUI Router which uses the concept of states
  // Learn more here: https://github.com/angular-ui/ui-router
  // Set up the various states which the app can be in.
  // Each state's controller can be found in controllers.js
  $stateProvider
    
  

  .state('tabsController', {
    url: '/app',
    templateUrl: 'templates/tabsController.html',
    abstract:true,
  })

    .state('tabsController.delestageTab', {
      url: '/delestage',
      views: {
        'tab1': {
          templateUrl: 'templates/delestageView.html',
          controller: 'delestageCtrl',

        }
      },
      cache: false,
      onExit: function($rootScope) {
            $rootScope.$broadcast('leavingDelestage');
          }
    })

    .state('tabsController.consommationTab', {
      url: '/consommation',
      views: {
        'tab2': {
          templateUrl: 'templates/consommationView.html',
          controller: 'consommationCtrl'
        }
      }
    })

    .state('tabsController.tableauTab', {
      url: '/tableau',
      cache: false,
      views: {
        'tab3': {
          templateUrl: 'templates/tableauView.html',
          controller: 'tableauCtrl'
        }
      }
    });

$urlRouterProvider.otherwise('/app/delestage');

  

});