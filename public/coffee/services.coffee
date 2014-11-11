Services = angular.module('iodocs.services', [])

###
# Turn strings like 'foo=bar,foo=baz,qooz=quux,quibblable' into functions.
#
# The above example should compile to:
#
#   (v) -> (v.foo == 'bar' or v.foo == 'baz') and (f.qooz == 'quux') and (foo.quibblable)
#
###
optionFilter = (filterString) ->
  testFns = {}
  testStrs = filterString.split ','

  console.log testStrs

  for str in testStrs then do (str) ->
    [key, val] = str.split '='
    console.log key, val
    test = if val?
      (v) -> v[key] == val
    else
      (v) -> v[key]

    currentTest = testFns[key]

    if currentTest?
      testFns[key] = (v) -> currentTest(v) or test(v)
    else
      testFns[key] = test

  testKeys = Object.keys testFns
  if not testKeys.length
    throw new Error("No test keys")

  if testKeys.length is 1
    testFns[testKeys[0]]
  else
    testKeys.map((k) -> testFns[k]).reduce (f, g) -> (x) -> f(x) and g(x)

parsePart = (datum, parseString, bindings = {}) ->
  return null unless datum
  if m = parseString.match(/^([^{}]+){(.*)}$/)
    key = m[1]
    filter = optionFilter m[2]
  else
    key = parseString
    filter = null

  ret = if key is '?'
    datum[Object.keys(datum)[0]]
  else if /^\$.+/.test(key)
    datum[bindings[key.substring(1)]]
  else
    datum[key]

  ret = if filter? then ret.filter(filter) else ret
  return ret


class OptionParser

  constructor: (parseString, @bindings) -> @parts = parseString.split /\./

  parse: ({data}) =>
    for p in @parts
      data = parsePart data, p, @bindings
    data

ensureArray = (obj) -> if Array.isArray(obj) then obj else (v for k, v of obj)

getFirst = (options) -> ensureArray(options)[0]

defaultBindingRE = /^{(.*)}$/

class DefaultParser extends OptionParser

  constructor: (parseString) ->
    binding = parseString.match(defaultBindingRE)[1]
    if binding.length is 0
      @parts = []
    else
      super binding

  parse: (data) =>
    for p in @parts
      data = if p is '' then data else parsePart data, p
    data

Services.factory 'Defaults', -> {DefaultParser, OptionParser}

Services.factory 'RequestAuth', ($log, Base64) ->

  basicHeader = ({username, password}) ->
    encoded = Base64.encode "#{ username }:#{ password }"
    "Basic #{ encoded }"

  return auth: ($scope) ->
    auth = $scope.auth.currentScheme
    credentials = $scope.auth.credentials
    conf = {}

    return conf unless (auth and credentials)

    switch auth.mechanism
      when 'parameter'
        if credentials.token
          conf.params = {}
          conf.params[auth.key] = credentials.token
      when 'header'
        if credentials.token
          conf.headers = {}
          conf.headers[auth.key] = auth.prefix + credentials.token
      when 'basic'
        if credentials.username and credentials.password
          conf.headers = Authorization: basicHeader(credentials)
      else
        $log.error("Unknown authorization mechanism: #{ auth.mechanism }")

    return conf

Services.factory 'Suggestions', ($http, $q, $log, $cacheFactory, $rootScope, ParamUtils, RequestAuth) ->
  cache = $cacheFactory 'suggestion-cache'

  getUrl = (scope, path) ->
    {protocol, baseURL, publicPath} = scope.apiInfo
    url = "#{ protocol }://#{ baseURL }#{ publicPath }#{ path }"

  getOpts = RequestAuth.auth

  flushCache = -> cache.removeAll()
  $rootScope.$watch 'auth.loggedIn', flushCache
  $rootScope.$on 'update', flushCache

  notDynamic = $q.defer()
  notDynamic.reject 'not dynamic'

  isDynamic = (param) -> param.Default?.match(defaultBindingRE) and param.Options

  getRepetitions = (params, param) ->
    bindings = {}
    for name in ParamUtils.getDependencies(param.Repeat)
      bindings[name] = ParamUtils.getCurrentValue params, name

    command = param.Repeat
    [path, parseStr] = command.split('|')
    optionParser = new OptionParser parseStr, bindings
    url = getUrl $rootScope, path
    opts = getOpts $rootScope
    $http.get(url, opts)
        .then(optionParser.parse)
        .then(ensureArray)

  getSuggestions = (params, param) ->
    return notDynamic.promise unless isDynamic param
    bindings = {}
    command = param.Options
    for name in ParamUtils.getDependencies command
      bindings[name] = ParamUtils.getCurrentValue params, name
    key = command + JSON.stringify(bindings)

    cache.get(key) or cache.put key, do ->
      [path, parseStr] = command.split '|'
      optionParser = new OptionParser parseStr, bindings
      defaultParser = new DefaultParser param.Default
      url = getUrl $rootScope, path
      opts = getOpts $rootScope
      opts.headers ?= {}
      opts.headers.Range = "records=0-100"

      $http.get(url, opts)
          .then(optionParser.parse)
          .then(ensureArray)
          .then (options) -> options.map defaultParser.parse

  getDefaultValue = (params, param) -> getSuggestions(params, param).then getFirst

  {getRepetitions, getDefaultValue, getSuggestions}

Services.factory 'ParamUtils', ->
  getDependencies: (s) -> (g.substring 1 for g in (s.match(/(\$[^\.]+)/g) ? []))
  getCurrentValue: (ps, name) -> return p.currentValue for p in ps when p.Name is name

Services.factory 'Storage', ($rootScope, $window) ->
  put: (key, val) -> $window.localStorage?.setItem(key, val)
  get: (key, orElse) ->
    $window.localStorage?.getItem(key, orElse) ? orElse
  clear: (key) ->
    $window.localStorage?.removeItem(key)

Services.factory 'parameterHistoryKey', -> (scope, pname) ->
  eid = scope.endpoint.identifier
  meth = scope.currentMethod.HTTPMethod
  "inputhistory:#{ eid }:#{ meth }:#{ pname }"

# Render markdown with the markdown library from evilstreak
# https://github.com/evilstreak/markdown-js/releases/tag/v0.5.0
Services.factory 'Markdown', ($window) ->
  parse: (src) -> $window.markdown?.toHTML(src, 'Maruku') ? src

Services.factory 'Selection', ($window, $log) ->
  select: (el) ->
    $log.info el
    el.focus()
    doc = $window.document
    if $window.getSelection and doc.createRange
      sel = $window.getSelection()
      range = doc.createRange()
      range.selectNodeContents(el)
      sel.removeAllRanges()
      sel.addRange(range)
    else if (doc.body.createTextRange)
      range = doc.body.createTextRange()
      range.moveToElementText(el)
      range.select()

Services.factory 'TreeParsing', ($q, $timeout) ->
  c = 0
  textTag = '$$CONTENT$$'

  parseDOMElem = (elem) ->
    def = $q.defer()
    $timeout ->
      node =
        label: (elem.tagName or textTag)
        id: c++
        children: []
      childPromises = []

      if elem.attributes?
        for ai in [0 ... elem.attributes.length]
          attr = elem.attributes[ai]
          childPromises.push $q.when
            label: """#{ attr.name } = "#{ attr.value }" """
            id: c++
            children: []
      if elem.childNodes?
        for ci in [0 ... elem.childNodes.length]
          childPromises.push(parseDOMElem(elem.childNodes[ci]))
      if elem.nodeValue?
        childPromises.push $q.when
          label: elem.nodeValue.replace(/(^\s+|\s+$)/g, ''),
          id: c++,
          children: []

      if childPromises.length
        # Need to wait for kids.
        $q.all(childPromises).then (kids) ->
          # Prune useless children
          node.children = (k for k in kids when k.label and not (k.label is textTag and k.children.length is 0))
          # Promote text tags to first level kids.
          node.children = node.children.map (c) -> if c.label is textTag then c.children[0] else c
          def.resolve node
      else
        def.resolve node

    return def.promise

  str = JSON.stringify

  parseObj = (k, v) ->
    def = $q.defer()
    $timeout ->
      node = label: k, id: c++, children: []
      childPromises = []

      if Array.isArray v
        node.label += " [#{ v.length }]"
        for e, i in v
          childPromises.push parseObj(i, e)
      else if angular.isObject(v)
        valkeys = Object.keys(v).filter (ok) -> not angular.isObject v[ok]
        desc = ''
        if valkeys.length <= 4
          desc = ' {' + ("#{vk}: #{str v[vk]}" for vk in valkeys).join(' ') + '}'
        node.label += ": Object" + desc
        for kk, vv of v
          childPromises.push parseObj(kk, vv)
      else
        node.label = "#{ k }: #{ JSON.stringify(v) }"

      if childPromises.length
        # Need to wait for kids.
        $q.all(childPromises).then (kids) ->
          node.children = kids

      def.resolve node

    def.promise

  expandTree = (tree, setting) ->
    def = $q.defer()
    pending = []

    $timeout ->
      for node in tree
        node.collapsed = setting
        pending.push expandTree node.children, setting

      if pending.length
        $q.all(pending).then -> def.resolve tree
      else
        def.resolve tree

    return def.promise

  nextId = -> c

  return {expandTree, parseObj, parseDOMElem, nextId}

Services.factory 'Counter', ->
  class Counter

    constructor: ->
      @counts = {}

    next: (key) ->
      if key of @counts
        ++@counts[key]
      else
        @counts[key] = 0

  return new Counter
