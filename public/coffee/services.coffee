Services = angular.module('iodocs.services', [])

parsePart = (datum, parseString, bindings = {}) ->
  return null unless datum
  if m = parseString.match(/^([^{}]+){(.*)}$/)
    key = m[1]
    [filterKey, filterVal] = m[2].split '='
    filter = if filterVal?
      (v) -> v[filterKey] == filterVal
    else
      (v) -> v[filterKey]
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
    super binding

  parse: (data) =>
    for p in @parts
      data = if p is '' then data else parsePart data, p
    data

Services.factory 'Defaults', -> {DefaultParser, OptionParser}

Services.factory 'getDefaultValue', ($http, $q, $rootScope, ParamUtils) -> (params, param) ->
  unless defaultBindingRE.test(param.Default) and param.Options
    d = $q.defer()
    d.reject('not a dynamic parameter')
    return d.promise

  bindings = {}
  for name in ParamUtils.getDependencies(param.Options)
    bindings[name] = ParamUtils.getCurrentValue params, name

  command = param.Options
  [path, parseParts] = command.split '|'
  optionParser = new OptionParser parseParts, bindings
  defaultParser = new DefaultParser param.Default
  url = getUrl $rootScope, path
  params = getParams $rootScope
  $http.get(url, {params, cache: true})
       .then(optionParser.parse)
       .then(getFirst)
       .then(defaultParser.parse)

getUrl = (scope, path) ->
  {protocol, baseURL, publicPath} = scope.apiInfo
  url = "#{ protocol }://#{ baseURL }#{ publicPath }#{ path }"

getParams = (scope) ->
  params = {}
  params.format = 'json'
  params.token = scope.auth.token
  return params

Services.factory 'getSuggestions', ($http, $rootScope, ParamUtils) -> (params, param) ->
  bindings = {}
  for name in ParamUtils.getDependencies(param.Options)
    bindings[name] = ParamUtils.getCurrentValue params, name

  command = param.Options
  [path, parseStr] = command.split '|'
  optionParser = new OptionParser parseStr, bindings
  defaultParser = new DefaultParser param.Default
  url = getUrl $rootScope, path
  params = getParams $rootScope

  $http.get(url, {params, cache: true})
       .then(optionParser.parse)
       .then(ensureArray)
       .then (options) -> options.map defaultParser.parse

Services.factory 'ParamUtils', ->
  getDependencies: (s) -> (g.substring 1 for g in (s.match(/(\$[^\.]+)/g) ? []))
  getCurrentValue: (ps, name) -> return p.currentValue for p in ps when p.Name is name

Services.factory 'getRepetitions', ($http, $rootScope, ParamUtils) -> (params, param) ->

  bindings = {}
  for name in ParamUtils.getDependencies(param.Repeat)
    bindings[name] = ParamUtils.getCurrentValue params, name

  command = param.Repeat
  [path, parseStr] = command.split('|')
  optionParser = new OptionParser parseStr, bindings
  url = getUrl $rootScope, path
  params = getParams $rootScope
  $http.get(url, {params, cache: true})
       .then(optionParser.parse)
       .then(ensureArray)

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
        node.label += " {#{ typeof v }}"
        for kk, vv of v
          childPromises.push parseObj(kk, vv)
      else
        node.label = "#{ k }: #{ JSON.stringify(v) }"

      if childPromises.length
        # Need to wait for kids.
        $q.all(childPromises).then (kids) ->
          node.children = kids
          def.resolve node
      else
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

  return {expandTree, parseObj, parseDOMElem}
