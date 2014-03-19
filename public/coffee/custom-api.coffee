App = angular.module('iodocs', [])

App.run ($rootScope) -> $rootScope.errors = []

App.controller 'CustomApiCtrl', ($scope) ->
  $scope.pathPart = /^[A-Za-z0-9]+$/
  $scope.hostname = /^([A-Za-z0-9]+\.)*[A-Za-z0-9]+$/

