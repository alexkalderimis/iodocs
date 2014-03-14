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
    ###
    elm.on 'focus', -> scope.$apply ->
      console.log "in focus"
      ngModelCtrl.$setPristine()
    ###

    elm.on 'blur', -> scope.$apply ->
      console.log "Lost focus"
      ngModelCtrl.$setViewValue elm.val()

