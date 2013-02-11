(function(apiView) {

    // Storing common selections
    var allEndpoints = $('li.endpoint'),
        allEndpointsLength = allEndpoints.length,
        allMethodLists = $('ul.methods'),
        allMethodListsLength = allMethodLists.length;

    function listMethods(context) {
        var methodsList = $('ul.methods', context || null);

        for (var i = 0, len = methodsList.length; i < len; i++) {
            $(methodsList[i]).slideDown();
        }
    }

    // Toggle show/hide of method details, form, and results
    $('li.method > div.title').click(function() {
        $('form', this.parentNode).slideToggle();
    })

    // Toggle an endpoint
    $('li.endpoint > h3.title span.name').click(function() {
        $('ul.methods', this.parentNode.parentNode).slideToggle();
        $(this.parentNode.parentNode).toggleClass('expanded')
    })

    $('input.variable-param').change(function(event) {
      event.preventDefault();
      var nameInput = $(this);
      nameInput.closest('tr').find('td.parameter input').attr({name: 'params[' + nameInput.val() + ']'});
    });

    // Toggle all endpoints
    $('#toggle-endpoints').click(function(event) {
        event.preventDefault();

        // Check for collapsed endpoints (hidden methods)
        var endpoints = $('ul.methods:not(:visible)'),
            endpointsLength = endpoints.length;

        if (endpointsLength > 0) {
            // Some endpoints are collapsed, expand them.
            for (var x = 0; x < endpointsLength; x++) {
                var methodsList = $(endpoints[x]);
                methodsList.slideDown();
                methodsList.parent().toggleClass('expanded', true)

            }
        } else {
            // All endpoints are expanded, collapse them
            var endpoints = $('ul.methods'),
                endpointsLength = endpoints.length;

            for (var x = 0; x < endpointsLength; x++) {
                var methodsList = $(endpoints[x]);
                methodsList.slideUp();
                methodsList.parent().toggleClass('expanded', false)
            }
        }

    })

    // Toggle all methods
    $('#toggle-methods').click(function(event) {
        event.preventDefault();

        var methodForms = $('ul.methods form:not(:visible)'), // Any hidden method forms
            methodFormsLength = methodForms.length;

        // Check if any method is not visible. If so, expand all methods.
        if (methodFormsLength > 0) {
            var methodLists = $('ul.methods:not(:visible)'), // Any hidden methods
            methodListsLength = methodLists.length;

            // First make sure all the hidden endpoints are expanded.
            for (var x = 0; x < methodListsLength; x++) {
                $(methodLists[x]).slideDown();
            }

            // Now make sure all the hidden methods are expanded.
            for (var y = 0; y < methodFormsLength; y++) {
                $(methodForms[y]).slideDown();
            }

        } else {
            // Hide all visible method forms
            var visibleMethodForms = $('ul.methods form:visible'),
                visibleMethodFormsLength = visibleMethodForms.length;

            for (var i = 0; i < visibleMethodFormsLength; i++) {
                $(visibleMethodForms[i]).slideUp();
            }
        }

        for (var z = 0; z < allEndpointsLength; z++) {
            $(allEndpoints[z]).toggleClass('expanded', true);
        }
    })

    // List methods for a particular endpoint.
    // Hide all forms if visible
    $('li.list-methods a').click(function(event) {
        event.preventDefault();

        // Make sure endpoint is expanded
        var endpoint = $(this).closest('li.endpoint'),
            methods = $('li.method form', endpoint);

        listMethods(endpoint);

        // Make sure all method forms are collapsed
        var visibleMethods = $.grep(methods, function(method) {
            return $(method).is(':visible')
        })

        $(visibleMethods).each(function(i, method) {
            $(method).slideUp();
        })

        $(endpoint).toggleClass('expanded', true);

    });

    $(function() {
      var hash;
      if (hash = window.location.hash) {
        $(hash + ' li.list-methods a').click();
      }
    });

    // Expand methods for a particular endpoint.
    // Show all forms and list all methods
    $('li.expand-methods a').click(function(event) {
        event.preventDefault();

        // Make sure endpoint is expanded
        var endpoint = $(this).closest('li.endpoint'),
            methods = $('li.method form', endpoint);

        listMethods(endpoint);

        // Make sure all method forms are expanded
        var hiddenMethods = $.grep(methods, function(method) {
            return $(method).not(':visible')
        })

        $(hiddenMethods).each(function(i, method) {
            $(method).slideDown();
        })

        $(endpoint).toggleClass('expanded', true);

    });

    // Toggle headers section
    $('div.headers h4').click(function(event) {
        event.preventDefault();

        $(this.parentNode).toggleClass('expanded');

        $('div.fields', this.parentNode).slideToggle();
    });

    // Auth with OAuth
    $('#credentials').submit(function(event) {
        event.preventDefault();

        var params = $(this).serializeArray();

        $.post('/auth', params, function(result) {
            if (result.signin) {
                window.open(result.signin,"_blank","height=900,width=800,menubar=0,resizable=1,scrollbars=1,status=0,titlebar=0,toolbar=0");
            }
        })
    });

    /*
     * Enable checkboxes for optional parameters when values are supplied.
     */
    $('td.parameter select')
      .add('td.parameter input')
      .add('td.parameter textarea').change(function(evt) {
      evt.preventDefault();
      var $widget = $(this);
      var $chbox = $('.provide-' + this.name.match(/params\[(.*)\]/)[1], $widget.closest('tr'));
      $chbox.attr({checked: $widget.val()});
    });

    /*
     * Repeatable parameters.
     */
    $('input.repeatable').change(function(event) {
      var self = this;
      var $input = $(this);
      event.preventDefault();

      var $tr = $input.closest('tr');

      // Only append new inputs at the end of the
      // list of repeated rows.
      if ($tr.next().attr('id') === $tr.attr('id')) {
        return false;
      }

      var clone = $tr.clone(true);
      clone.find('td.parameter input').val('');
      // \u3003 is the ditto mark (〃).
      var td_name = clone.find('td.name');
      if (td_name.children('input').length) {
        td_name.children('input').val('');
      } else {
        td_name.text('\u3003');
      }
      $('<button title="Remove parameter" class="remove">x</button>').prependTo(td_name).click(function(event) {
        event.preventDefault();
        clone.remove();
      });
      clone.find('td.type').text('\u3003');
      clone.find('td.description p').text('\u3003');
      //clone.find('td.enabled ').text('\u3003');
      clone.insertAfter($tr);
      
    });

    $('a.version').each(function() {
      var $a = $(this);
      $.ajax($a.attr('href'), { dataType: "text" }).done(function(version) {
        $a.text(version);
      }).fail(function(error) {
        $a.addClass('error').text("Not available");
      });
    });

    /*
        Try it! button. Submits the method params, apikey and secret if any, and apiName
    */
    $('li.method form').submit(function(event) {
        var self = this;

        event.preventDefault();

        var params = $(this).serializeArray(),
            apiKey = { name: 'apiKey', value: $('input[name=key]').val() },
            apiSecret = { name: 'apiSecret', value: $('input[name=secret]').val() },
            apiName = { name: 'apiName', value: $('input[name=apiName]').val() };

        // Exclude optional parameters with unchecked boxes.
        params = params.filter(function(p) {
          if (!p.name.match(/params/)) return true;
          var $chxbox = $('.provide-' + p.name.match(/params\[(.*)\]/)[1], self);
          return ($chxbox.length) ? $chxbox.is(':checked') : true;
        });

        params.push(apiKey, apiSecret, apiName);

        // Setup results container
        var resultContainer = $('.result', self);
        if (resultContainer.length === 0) {
            resultContainer = $(document.createElement('div')).attr('class', 'result');
            $(self).append(resultContainer);
        }

        if ($('pre.response', resultContainer).length === 0) {

            // Clear results link
            var clearLink = $(document.createElement('a'))
                .text('Clear results')
                .addClass('clear-results')
                .attr('href', '#')
                .click(function(e) {
                    e.preventDefault();

                    var thislink = this;
                    $('.result', self)
                        .slideUp(function() {
                            $(this).remove();
                            $(thislink).remove();
                        });
                })
                .insertAfter($('input[type=submit]', self));

            // Call that was made, add pre elements
            resultContainer.append($(document.createElement('h4')).text('Call'));
            resultContainer.append($(document.createElement('pre')).addClass('call'));

            // Code
            resultContainer.append($(document.createElement('h4')).text('Response Code'));
            resultContainer.append($(document.createElement('pre')).addClass('code prettyprint'));

            // Header
            resultContainer.append($(document.createElement('h4')).text('Response Headers'));
            resultContainer.append($(document.createElement('pre')).addClass('headers prettyprint'));

            // Response
            resultContainer.append($(document.createElement('h4'))
                .text('Response Body')
                .append($(document.createElement('a'))
                    .text('Select body')
                    .addClass('select-all')
                    .attr('href', '#')
                    .click(function(e) {
                        e.preventDefault();
                        selectElementText($(this.parentNode).siblings('.response')[0]);
                    })
                )
            );

            resultContainer.append($(document.createElement('pre'))
                .addClass('response prettyprint'));
        }

        console.log(params);

        $.post('/processReq', params, function(result, text) {
            // If we get passed a signin property, open a window to allow the user to signin/link their account
            if (result.signin) {
                window.open(result.signin,"_blank","height=900,width=800,menubar=0,resizable=1,scrollbars=1,status=0,titlebar=0,toolbar=0");
            } else {
                var response,
                    responseContentType = result.headers['content-type'];
                // Format output according to content-type
                response = livedocs.formatData(result.response, result.headers['content-type'])

                $('pre.response', resultContainer)
                    .toggleClass('error', false)
                    .text(response);
            }

        })
        // Complete, runs on error and success
        .complete(function(result, text) {
            var response = JSON.parse(result.responseText);

            if (response.call) {
                $('pre.call', resultContainer)
                    .text(response.call);
            }

            if (response.code) {
                $('pre.code', resultContainer)
                    .text(response.code);
            }

            if (response.headers) {
                $('pre.headers', resultContainer)
                    .text(formatJSON(response.headers));
            }

            // Syntax highlighting
            prettyPrint();
        })
        .error(function(err, text) {
            var response;

            if (err.responseText !== '') {
                var result = JSON.parse(err.responseText),
                    headers = formatJSON(result.headers);

                if (result.headers && result.headers['content-type']) {
                    // Format the result.response and assign it to response
                    response = livedocs.formatData(result.response, result.headers['content-type']);
                } else {
                    response = result.response;
                }

            } else {
                response = 'Error';
            }

            $('pre.response', resultContainer)
                .toggleClass('error', true)
                .text(response);
        })
    });

    /* It would be nice to do xml validation here...
    $('textarea').each(function(i, e) {
      var $textarea = $(this), schema_uri;
      if (schema_uri = $textarea.data('xmlschema')) {
        $.get(schema_uri).then(function(schema) {
          $textarea.change(function(event) {
            var opts = {
              xml: $textarea.val(),
              schema: schema,
              arguments: ['--noout']
            };
      }
    });
    */

})();
