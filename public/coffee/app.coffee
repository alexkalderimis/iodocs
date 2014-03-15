IODocs = angular.module 'iodocs', [
  'ngRoute', 'ngSanitize',
  'iodocs.controllers', 'iodocs.directives', 'iodocs.services',
  'ui.bootstrap', 'angularTreeview'
]

IODocs.run ($http, $rootScope, Storage) ->
  console.log("Initialising iodocs")
  $rootScope.endpoints = []
  $rootScope.auth = {}
  $rootScope.apiInfo = {}
  $http.get('info.json').then ({data}) -> $rootScope.apiInfo = data
  $http.get('definition.json').then ({data}) ->
    $rootScope.endpoints = data.endpoints
  $rootScope.auth.token = Storage.get('apiToken')
  $rootScope.$watch 'auth.token', (nv) ->
    if nv
      Storage.put('apiToken', nv)
    else
      Storage.clear('apiToken')
  $rootScope.$watch 'apiInfo.baseURL', ->
    {protocol, baseURL, publicPath} = $rootScope.apiInfo
    return unless baseURL
    url = "#{ protocol }://#{ baseURL }#{ publicPath }/version"
    $http.get(url, {headers: {accept: 'application/json'}})
         .then ({data: {version}}) ->
            $rootScope.apiInfo.apiVersion = version

IODocs.config ($routeProvider) ->
  $routeProvider.when '/',
    templateUrl: '/partials/endpoint-list.html',
    controller: 'EndpointList'
  $routeProvider.when '/:endpointName',
    templateUrl: '/partials/endpoint-details.html',
    controller: 'EndpointDetails'
  $routeProvider.when '/:endpointName/:method:servicePath*',
    templateUrl: '/partials/endpoint-details.html',
    controller: 'EndpointDetails'
  $routeProvider.otherwise redirectTo: '/'
