IODocs = angular.module 'iodocs', [
  'ngRoute', 'ngSanitize',
  'iodocs.controllers', 'iodocs.directives', 'iodocs.services',
  'ui.bootstrap', 'angularTreeview', 'base64'
]

class Auth

  constructor: ->
    @currentScheme = @schemes[0]
    @credentials = {}

  loggedIn: false
  username: null
  schemes: [
    {type: 'token', mechanism: 'parameter', name: 'API Key', key: 'token'},
    {type: 'password', mechanism: 'basic', name: 'Basic Auth'}
  ]

App = ($http, $log, $rootScope, Storage) ->

  watchCredentials = (s) -> JSON.stringify(s.auth.credentials)

  getCredentialsKey = ({baseURL, publicPath}) ->
    "#{ baseURL }:#{ publicPath }:credentials" if baseURL?

  $log.debug("Initialising iodocs")
  $rootScope.errors = []
  $rootScope.endpoints = []
  $rootScope.auth = new Auth
  $rootScope.apiInfo = {}
  $http.get('info.json').then ({data}) -> $rootScope.apiInfo = data
  $http.get('definition.json').then ({data}) ->
    if data.auth
      $rootScope.auth.schemes = data.auth
      $rootScope.auth.currentScheme = data.auth[0]
    $rootScope.endpoints = data.endpoints

  $rootScope.$watch watchCredentials, (nv, ov) ->
    credentialsKey = getCredentialsKey $rootScope.apiInfo
    return unless credentialsKey

    if nv and (nv isnt ov)
      Storage.put(credentialsKey, nv) # nv is already JSON, because of the watcher.
    else
      Storage.clear credentialsKey

  $rootScope.$watch 'apiInfo.baseURL', ->
    {protocol, baseURL, publicPath} = $rootScope.apiInfo
    return unless baseURL

    if key = getCredentialsKey $rootScope.apiInfo
      try
        fromStorage = Storage.get key
        creds = JSON.parse fromStorage
        if creds.token or creds.username
          $rootScope.auth.credentials = creds
        else
          $log.error "Bad creds", fromStorage, creds
          Storage.clear key
      catch e
        Storage.clear key

      {username, token} = $rootScope.auth.credentials
      if username and not token
        [passWordScheme] = (s for s in $rootScope.auth.schemes when s.type is 'password')
        $rootScope.auth.currentScheme = passWordScheme if passWordScheme?

    url = "#{ protocol }://#{ baseURL }#{ publicPath }/version"
    $http.get(url)
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

IODocs.run ['$http', '$log', '$rootScope', 'Storage', App]
