Controllers = angular.module 'iodocs.controllers', ['xml']

Controllers.controller 'SidebarCtrl', ->

Controllers.controller 'ErrorCtrl', ($log, $timeout, $scope) ->
  $log.error $scope.error.msg
  $scope.dismiss = ->
    i = $scope.errors.indexOf $scope.error
    $scope.errors.splice i, 1

  $timeout $scope.dismiss, $scope.error.timeout

Controllers.controller 'AuthCtrl', ($scope, $http, $log, RequestAuth) ->
  authWatcher   = (s) -> JSON.stringify [s.auth.currentScheme, s.auth.credentials, s.apiInfo.baseURL]
  $scope.logOut = ->
    $scope.auth.loggedIn = false
    $scope.auth.credentials = {}

  $scope.$watch authWatcher, ->
    {protocol, baseURL, publicPath} = $scope.apiInfo
    conf = RequestAuth.auth $scope
    return unless conf and baseURL
    url = "#{ protocol }://#{ baseURL }#{ publicPath }/user/whoami"

    unless (conf.params or conf.headers)
      return $scope.auth.loggedIn = false

    req = $http.get(url, conf)
    req.then ({data}) ->
      $scope.auth.loggedIn = true
      $scope.auth.username = data.user.username # may be null, if anonymous
    req.error -> $scope.auth.loggedIn = false

Controllers.controller 'ParameterInputCtrl', ($scope, $q, $log, $timeout, Suggestions, parameterHistoryKey, Storage) ->

  getStorageKey = -> parameterHistoryKey $scope, $scope.parameter.Name

  storeHistory = (hist) -> Storage.put getStorageKey(), JSON.stringify(hist)

  getHistory = ->
    hist = Storage.get getStorageKey()
    if hist?
      try
        JSON.parse hist
      catch e
        []
    else
      []

  $scope.suggest = (vv) ->
    if $scope.parameter.Options
      return Suggestions.getSuggestions $scope.params, $scope.parameter
    else
      d = $q.defer()
      d.resolve getHistory()
      return d.promise

Controllers.controller 'EndpointList', ($scope) ->
  $scope.showSearch = false

  $scope.$watch 'showSearch', (show) ->
    $scope.endpointFilter = null unless show

arrayRegexp = /\[\]$/
bracesRexexp = /^{.*}$/

Controllers.controller 'ParameterCtrl', ($scope, $log, Suggestions, Counter) ->
  p = $scope.parameter
  p.currentValue ?= p.Default unless p.changed
  p.currentName = p.Name

  $scope.repeatable = arrayRegexp.test p.Type
  $scope.removable = $scope.repeatable and (sib for sib in $scope.params when sib.Name is p.Name).length > 1
  $scope.type = p.Type?.replace(arrayRegexp, '')
  p.required = p.Required is 'Y'
  p.active ?= (p.Recommended or p.required)
  $scope.switchable = not p.required
  $scope.variableName = /\?/.test p.Name

  $scope.switchDesc = "This parameter is #{ if p.required then 'required' else 'optional' }"
  if p.Recommended
    $scope.switchDesc += ", but it is recommended."

  $scope.change = ->
    p.active = true
    p.changed = true

  $scope.removeParam = ->
    i = $scope.params.indexOf p
    if i >= 0
      $scope.params.splice(i, 1)
    else $log.warn "Cannot remove param not in list", p

  $scope.addParam = ->
    newParam = angular.copy(p)
    delete newParam.active
    newParam.id = p.Name + '_' + Counter.next p.Name
    i = $scope.params.indexOf p
    $scope.params.splice(i + 1, 0, newParam)

  $scope.$watch 'auth.loggedIn', (t) ->
    setCurrentValue = (v) -> p.currentValue = v
    unless p.changed
      Suggestions.getDefaultValue($scope.params, p).then setCurrentValue

getCurrentValue = (ps, name) -> return p.currentValue for p in ps when p.Name is name


Controllers.controller 'MethodCtrl', ($scope, $q, $log, $http, Suggestions, Defaults, ParamUtils, Storage, parameterHistoryKey, Counter, Markdown) ->
  $scope.params = angular.copy($scope.m.parameters)

  do initParams = ->
    for p, i in $scope.params
      p.initialIdx ?= i
      p.id ?= p.Name + '_' + Counter.next p.Name
    
  $scope.show ?= params: true # Initially set params as the focus.

  if $scope.show.params and not ($scope.params?.length or $scope.m.body?.length)
    $scope.show = desc: true

  $scope.description = $scope.m.Description
  if 'markdown' is $scope.m.DescriptionFormat
    $scope.htmlDesc = true
    $scope.description = Markdown.parse($scope.description)

  nRegex = /\{N\}/

  allDeps = {}
  for p in $scope.m.parameters when p.Repeat
    allDeps[name] = 1 for name in ParamUtils.getDependencies(p.Repeat)

  for name, _ of allDeps then do (name) ->
    $scope.$watch ((s) -> getCurrentValue s.params, name), (nv, ov) ->
      return if nv is ov
      # Remove previously inserted values.
      $scope.params = (p for p in $scope.params when not p.Repeat)
      # Get the templateable parameters
      repeatableParams = (angular.copy p for p in $scope.m.parameters when p.Repeat)

      # It would be nice to get them back in position. Not sure if that is even possible.
      $scope.params.push(rp) for rp in repeatableParams
      initParams()
      expandNumberedParams($scope.params).then (expanded) -> $scope.params = expanded

  expandNumberedParams = (parameters) ->
    parameters = parameters.slice()
    getReps = (p) -> Suggestions.getRepetitions parameters, p
    withRepeats = parameters.filter (p) -> p.Repeat
    working = withRepeats.map (repeatedP) -> getReps(repeatedP).then (things) ->
      i = foundAt = parameters.indexOf repeatedP # Might have changed, need to get it late.
      defaultParser = new Defaults.DefaultParser repeatedP.Default
      parameters.splice(i, 1) # Remove the template
      for thing, thingIdx in things
        newP = angular.copy(repeatedP)
        newName = newP.Name.replace(nRegex, String(thingIdx + 1))
        newP.Name = newP.currentName = newName
        newP.Type = newP.Type.replace(/\[\]$/, '')
        newP.id = "#{ newName }_#{ Counter.next newName }"
        newP.currentValue = defaultParser.parse thing
        newP.changed = newP.active = true
        parameters.splice(i++, 0, newP) # Insert newP where old P was, advancing the cursor.

    if working.length
      $q.when parameters
    else
      $q.all(working).then -> parameters
    
  expandNumberedParams($scope.params).then (expanded) -> $scope.params = expanded

  saveParamValueToHistory = (p) ->
    return unless p.currentValue?
    key = parameterHistoryKey $scope, p.Name
    storedHist = Storage.get key
    hist = if storedHist? then JSON.parse(storedHist) else []
    toStore = String p.currentValue
    if toStore not in hist
      hist.push toStore
      Storage.put key, JSON.stringify(hist)

  $scope.dismiss = (res) ->
    results = $scope.m.results or []
    i = results.indexOf res
    results.splice(i, 1) if i >= 0

  $scope.run = ->
    m = $scope.m

    query =
      credentials: $scope.auth.credentials
      auth: $scope.auth.currentScheme
      httpMethod: m.HTTPMethod
      methodUri: m.URI
      params: {}

    for p, i in $scope.params when p.active
      query.params[p.currentName] = p.currentValue
      saveParamValueToHistory p

    if m.content and m.bodyContentType isnt 'none'
      query.body =
        Format: m.bodyContentType
        Content: m.content

    $log.debug('Running', query)

    dummyRes = {query, call: m.URI, response: '', headers: [], code: 'pending'}

    $http.post('run', query).then ({data}) ->
      $scope.$emit 'update' if m.HTTPMethod isnt 'GET'
      data.query = query
      i = m.results.indexOf dummyRes
      if i >= 0
        m.results.splice i, 1, data
      else
        m.results.push data

    m.results.push dummyRes
    $scope.show = res: true

EndpointCtrl = ($scope, $log, $http, $routeParams, $location, Storage) ->

  updateLocation = ->
    return unless $scope.currentMethod?
    {HTTPMethod, URI} = $scope.currentMethod
    newLoc = "/#{ $scope.endpoint.identifier }/#{ HTTPMethod }#{ URI or '/' }"
    $log.debug 'Replacing path with', newLoc
    $location.replace().path newLoc

  # Slightly (read very) hacky workaround of the fact that the URI
  # could be the empty string. 
  methodMatches = (m) ->
    (m.HTTPMethod is $routeParams.method) and ((m.URI or '/') is $routeParams.servicePath)

  initMethod = (m) ->
    m.active = true
    m.results ?= []
    body = m.body?[0]
    m.bodyContentType = body?.contentType
    m.content = body?.example

  methodWatch = (s) ->
    {HTTPMethod, URI} = s.currentMethod
    HTTPMethod + URI

  currentEndpoint = $routeParams.endpointName
  $scope.endpoint = e for e in $scope.endpoints when e.identifier is currentEndpoint

  unless $scope.endpoint
    $scope.errors.push
      msg: 'Endpoint not found ' + currentEndpoint
      timeout: 3000
    return $location.path '/'

  if $routeParams.method and $routeParams.servicePath
    $scope.currentMethod = m for m in $scope.endpoint.methods when methodMatches m
  else
    $scope.currentMethod = $scope.endpoint.methods[0]

  unless $scope.currentMethod
    $scope.errors.push
      msg: "Method not found #{ $routeParams.method } #{ $routeParams.servicePath }"
      timeout: 3000
    return $location.path '/'

  m.active = false for m in $scope.endpoint.methods
  initMethod $scope.currentMethod

  $log.debug 'CURRENT METHOD', $scope.currentMethod

  updateLocation()

  $scope.methodChanged = ->
    [cm] = (m for m in $scope.endpoint.methods when m.active)
    return unless cm?
    $scope.currentMethod = cm

  $scope.$watch methodWatch, updateLocation

Controllers.controller 'EndpointDetails', EndpointCtrl

Controllers.controller 'ResponseCtrl', ($q, $timeout, $scope, $log, xmlParser, TreeParsing) ->

  $scope.navType = 'pills'
  $scope.showheaders = false
  $scope.params = $scope.res.query.params
  $scope.headers = $scope.res.headers
  $scope.hasParams = -> Object.keys($scope.params).length > 0
  $scope.parsedData = []
  $scope.tree = expanded: false

  ct = ($scope.headers['content-type'] ? '')
  promises = []
  if $scope.res.response?.length
    if ct.match(/^application\/json/)
      parsed = try
        JSON.parse($scope.res.response)
      catch e
        {}
      for k, v of parsed
        promises.push TreeParsing.parseObj k, v
    else if /^text\/xml/.test(ct) or /^application\/xml/.test(ct)
      try
        dom = xmlParser.parse $scope.res.response
        promises.push TreeParsing.parseDOMElem(dom.documentElement)
      catch e
        $log.error 'Error parsing xml', e

  setTree = (tree) ->
    $scope.parsedData = tree
    $log.debug "Next id = #{ TreeParsing.nextId() }"

  if promises.length
    $q.all(promises)
      .then((parsed) -> TreeParsing.expandTree parsed, not $scope.tree.expanded)
      .then setTree, $log.error

  $scope.isHTML = -> !!ct?.match /^text\/html/

  processingInstructions = /<\?[^?]*\?>/g
  $scope.cleanHTML = $scope.res.response.replace(processingInstructions, '')

  if ct.match(/separated/)
    patt = if ct.match(/comma/) then /,/ else /\t/
    $scope.flatFile = {headers: [], rows: []}
    lines = $scope.res.response.split('\n')
    # Some *very* custom code for dealing with results that have column headers.
    if $scope.params['columnheaders'] and $scope.params['columnheaders'] isnt 'none'
      [header, rows...] = lines
    else
      rows = lines
    $scope.flatFile.headers = header.split(patt) if header?
    for row in rows
      $scope.flatFile.rows.push(row.split(patt))

  $scope.$watch 'tree.expanded', (nv) -> TreeParsing.expandTree $scope.parsedData, !nv
