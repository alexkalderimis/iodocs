IODirectives = angular.module 'iodocs.directives', []

IODirectives.directive 'httpParameter', ->
  restrict: 'E'
  replace: false
  templateUrl: '/partials/parameter.html'
  controller: 'ParameterCtrl'

IODirectives.directive 'parameterInput', ->
  restrict: 'E'
  replace: true
  templateUrl: '/partials/parameter-input.html'
  controller: 'ParameterInputCtrl'

IODirectives.directive 'formattedCode', ->
  restrict: 'E'
  transclude: true
  replace: true
  scope: {}
  link: (scope, element) -> prettyPrintOne element[0]
  template: """<pre ng-transclude></pre>"""

IODirectives.directive 'numeric', ->
  restrict: 'A'
  require: 'ngModel'
  scope:
    model: '=ngModel'
    type: '@type'
  link: (scope, element, attrs, mgModelCtrl) ->
    cast = (x) -> parseInt x, 10
    if scope.type is 'float'
      cast = (x) -> parseFloat x
    if scope.model and typeof scope.model is 'string'
      scope.model = cast scope.model

IODirectives.directive 'updateOnBlur', ->
  restrict: 'A'
  require: 'ngModel'
  priority: 1
  link: (scope, elm, attr, ngModelCtrl) ->
    return if (attr.type is 'radio') or (attr.type is 'checkbox')

    elm.off(evt) for evt in ['input', 'keydown']

    elm.on 'blur', -> scope.$apply ->
      ngModelCtrl.$setViewValue elm.val()

IODirectives.directive 'resize', ($window, $log) ->
  restrict: 'A'
  link: (scope, elm, attrs, ctrl) ->
    d = scope.$eval(attrs.resizeOffset)
    cutOff = scope.$eval(attrs.resizeCutoff)
    resize = ->
      h = $window.innerHeight
      w = $window.innerWidth
      if w >= cutOff
        elm.css height: "#{h - d}px"
      else
        elm.css height: null

    angular.element($window).on 'resize', -> scope.$apply resize

    resize()

IODirectives.directive 'scrollIf', ($log) ->
  restrict: 'A'
  link: (scope, elem, attrs) ->
    getOffsetTop = ([el]) -> el.offsetTop
    scrollIntoView = ->
      po = getOffsetTop elem.parent()
      eo = getOffsetTop elem
      offset = scope.$eval(attrs.scrollOffset) or 0
      elem.parent()[0].scrollTop = eo - (po + offset)
    setTimeout -> scrollIntoView() if scope.$eval(attrs.scrollIf)

IODirectives.directive 'focusMe', ($timeout, $parse) ->
  restrict: 'A'
  link: (scope, elem, attrs) ->
    model = $parse(attrs.focusMe)
    scope.$watch model, (value) -> if value
      $timeout -> elem[0].focus()

