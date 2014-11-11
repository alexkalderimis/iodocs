//
// Copyright (c) 2011 Mashery, Inc.
// Copyright (c) 2013-2014 InterMine and Alex Kalderimis
//
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// 'Software'), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
// IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
// CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
// TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//

// This version has all its redis dependencies stripped.

//
// Module dependencies
//
var express     = require('express'),
    util        = require('util'),
    fs          = require('fs'),
    query       = require('querystring'),
    url         = require('url'),
    http        = require('http'),
    https       = require('https'),
    winston     = require('winston'),
    cmw         = require('coffee-middleware'),
    crypto      = require('crypto'),
    stylus      = require('stylus'),
    nib         = require('nib'),
    EventEmitter = require('events').EventEmitter,
    oauth       = require('./lib/oauth'),
    config      = {},
    redis, RedisStore;

try {
  redis       = require('redis'),
  RedisStore  = require('connect-redis')(express);
} catch (e) {
  // ignore.
}

// Load basic app Configuration
try {
  (function () {
    var configJSON = fs.readFileSync(__dirname + "/config.json");
    config = JSON.parse(configJSON.toString());
  })();
} catch(e) {
  console.error("File config.json not found or is invalid.  Try: `cp config.json.sample config.json`");
  process.exit(1);
}

var CAN_HAVE_BODY = function (method) {
  return ['POST','PUT'].indexOf(method) >= 0;
};

// Init logger.
var logger = new winston.Logger({
  transports: [
    new winston.transports.Console({
      colorize: true,
      level: 'info'
    }),
    new winston.transports.File({
      filename: "iodocs.log",
      timestamp: true,
      level: 'debug'
    })
  ]
});

// Init Redis connection (used for persisting OAuth connection details).
var defaultDB = '0';
var db;

// Read config from ENV, if provided.
if (process.env.REDISTOGO_URL) {
  (function () {
    var rtg = url.parse(process.env.REDISTOGO_URL);
    if (!config.redis) config.redis = {};
    config.redis.host = rtg.hostname;
    config.redis.port = rtg.port;
    config.redis.password = rtg.auth.split(":")[1];
  })();
}

if (redis) {
  if (config.redis && config.redis.port) {
    db = redis.createClient(config.redis.port, config.redis.host);
    db.auth(config.redis.password);
  }
} else if (config.redis && config.redis.port) {
  logger.warn("Redis connection configured, but not available. Install library with 'npm install redis'")
}

if (!db) {
  (function () {
    db = new EventEmitter();
    RedisStore = function MockRedisStore () {};

    // Stub out all db methods that we call.
    db.set = mockMethod;
    db.expire = mockMethod;
    db.mget = mockMethod;
    db.mset = mockMethod;

    function mockMethod () {
      logger.warn("Redis command called, but redis is not installed.");
    }
  })();
}

db.on("error", logger.error.bind(logger, '[REDIS] %s'));

//
// Load API Configs
//
var apisConfig = {};
var imAPIs = {};

function initAppConfig () {

  fs.readFile('public/data/apiconfig.json', 'utf-8', function(err, data) {
    var apiName, parsed, slug;
    if (err) throw err;

    parsed = JSON.parse(data);
    for (slug in parsed) {
      apisConfig[slug] = parsed[slug];
    }

    logger.debug('API CONFIG: %j', apisConfig)

    for (apiName in apisConfig) {
      fetchServiceListing(apiName);
    }

    function fetchServiceListing (name) {
      var req
        , api = apisConfig[name]
        , serviceListingURI = api.protocol + "://" + api.baseURL + api.publicPath;

      if (!api.intermine) return;

      logger.debug("Fetching service listing from " + serviceListingURI);

      var doget = (api.protocol === 'https') ? https.get : http.get;
      req = doget(serviceListingURI, function responseHandler (res) {
          var body = "";
          res.on('data', function(chunk) { body += chunk; });
          res.on('error', handleError);
          res.on('end', function done () {
              logger.log('debug', "Retrieved service listing for %s", name);
              try {
                imAPIs[name] = JSON.parse(body);
                if (api.excludeRequiresAuthn === true) {
                  imAPIs[name] = excludeRequiresAuthn(imAPIs[name]);
                }
              } catch (e) {
                var msg = "Error parsing service listing for " + name + ": " + e;
                handleError(new Error(msg));
              }
          });
      });
      req.on('error', handleError);
      function  handleError (e) {
        logger.log('warn', 'Could not fetch service listing for %s', name, e);
        delete apisConfig[name];
      }
    }

    /* set 'excludeRequiresAuthn': 'true' in apiconfig.json
       - exclude endpoints that require authentication
       - disable login capabilities on mine-docs page */
    function excludeRequiresAuthn(imAPI) {
      var imAPIflt = {};
      for (var k1 in imAPI) {
        imAPIflt[k1] = [];
        if (k1 === 'endpoints') {
          for(var i = 0; i < imAPI[k1].length; i++) {
            var e = {}, m = [];
            for (var k2 in imAPI[k1][i]) {
              if (k2 === 'methods') {
                for (var j = 0; j < imAPI[k1][i][k2].length; j++) {
                  if (imAPI[k1][i][k2][j]['RequiresAuthentication'] === 'false') {
                    m.push(imAPI[k1][i][k2][j]);
                  }
                }
                e[k2] = m;
              } else {
                e[k2] = imAPI[k1][i][k2];
              }
            }
            if (m.length !== 0) {
              imAPIflt[k1].push(e);
            }
          }
        } else {
          imAPIflt[k1] = imAPI[k1];
        }
      }
      return imAPIflt;
    }
  });
}

// Init config now.
initAppConfig();

// Refresh config every configured interval, or every hour.
setInterval(initAppConfig, (config.refreshInterval || 60 * 60) * 1000);

var app = module.exports = express();

app.configure(function() {

  var sessionStore, winstonStream = {
    write: function (message, encoding) {
      logger.info(message.slice(0, -1));
    }
  };

  if (config.redis && config.redis.port) {
    sessionStore = new RedisStore({
      host:   config.redis.host,
      port:   config.redis.port,
      pass:   config.redis.password,
      maxAge: 1209600000
    });
  }

  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.logger({stream: winstonStream}));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(cmw({
    encodeSrc: false,
    src: __dirname + '/public/coffee', prefix: '/javascripts'
  }));
  app.use(express.session({
    secret: config.sessionSecret,
    store: sessionStore
  }));
  app.use(stylus.middleware({
    src: __dirname + '/public',
    compile: function (str, path) {
      return stylus(str)
        .set('filename', path)
        .set('compress', !!config.compressCss)
        .define('theme', new stylus.nodes.String(config.theme))
        .use(nib()).import('nib');
    }
  }));
  app.use(function (req, res, next) {
    // Must return a function to get the value,
    // as the request handler won't have been
    // matched yet, so the 'api' param won't be
    // populated.
    res.locals.apiInfo = function () {
      return (apisConfig[req.params.api] || {});
    };
    res.locals.apis = apisConfig;
    res.locals.config = config;
    next();
  });
  app.use(app.router);
  app.use(express.static(__dirname + '/components'));
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function() {
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function() {
  app.use(express.errorHandler());
});

//
// processRequest - handles API call
//
function processRequest(req, res, next) {
    logger.debug('Request body: ' + util.inspect(req.body, null, 3));
    logger.debug('Request params: ' + util.inspect(req.params));

    var reqQuery = req.body,
        params = reqQuery.params || {},
        body = reqQuery.body,
        methodURL = reqQuery.methodUri,
        httpMethod = reqQuery.httpMethod,
        credentials = reqQuery.credentials,
        authMechanism = reqQuery.auth,
        apiSecret = reqQuery.apiSecret,
        apiName = reqQuery.apiName
        apiConfig = apisConfig[apiName],
        key = req.sessionID + ':' + apiName;

    if (!apiConfig) {
      return res.send(400, "Unknown apiName " + reqQuery.apiName);
    } else {
      logger.debug(apiConfig);
    }

    // Replace placeholders in the methodURL with matching params
    for (var param in params) {
        if (params.hasOwnProperty(param)) {
            if (params[param] !== '') {
                // URL params are prepended with ":"
                var regx = new RegExp(':' + param);

                // If the param is actually a part of the URL, put it in the URL and remove the param
                if (!!regx.test(methodURL)) {
                    methodURL = methodURL.replace(regx, params[param]);
                    delete params[param]
                }
            } else {
                delete params[param]; // Delete blank params
            }
        }
    }

    var baseHostInfo = apiConfig.baseURL.split(':');
    var baseHostUrl = baseHostInfo[0],
        baseHostPort = (baseHostInfo.length > 1) ? baseHostInfo[1] : "";

    var paramString = query.stringify(params),
        privateReqURL = apiConfig.protocol + '://' + apiConfig.baseURL + apiConfig.privatePath + methodURL + ((paramString.length > 0) ? '?' + paramString : ""),
        options = {
            headers: {},
            protocol: apiConfig.protocol + ':',
            host: baseHostUrl,
            port: baseHostPort,
            method: httpMethod,
            path: apiConfig.publicPath + methodURL// + ((paramString.length > 0) ? '?' + paramString : "")
        };

    var requestBody;
    if (body == null && ['POST','DELETE','PUT'].indexOf(httpMethod) !== -1) {
      requestBody = query.stringify(params);
    } else if (body != null) {
      requestBody = body.Content;
    }

    if (apiConfig.oauth) {
      logger.debug('Using OAuth');

      // Three legged OAuth
      if (apiConfig.oauth.type == 'three-legged' && (reqQuery.oauth == 'authrequired' || (req.session[apiName] && req.session[apiName].authed))) {
        logger.debug('Three Legged OAuth');

          db.mget([key + ':apiKey',
                    key + ':apiSecret',
                    key + ':accessToken',
                    key + ':accessTokenSecret'
              ],
                function(err, results) {

                    var apiKey = (typeof reqQuery.apiKey == "undefined" || reqQuery.apiKey == "undefined")?results[0]:reqQuery.apiKey,
                        apiSecret = (typeof reqQuery.apiSecret == "undefined" || reqQuery.apiSecret == "undefined")?results[1]:reqQuery.apiSecret,
                        accessToken = results[2],
                        accessTokenSecret = results[3];
                    logger.debug(apiKey);
                    logger.debug(apiSecret);
                    logger.debug(accessToken);
                    logger.debug(accessTokenSecret);

                    var oa = new OAuth(apiConfig.oauth.requestURL || null,
                                       apiConfig.oauth.accessURL || null,
                                       apiKey || null,
                                       apiSecret || null,
                                       apiConfig.oauth.version || null,
                                       null,
                                       apiConfig.oauth.crypt);

                    if (config.debug) {
                        logger.debug('Access token: ' + accessToken);
                        logger.debug('Access token secret: ' + accessTokenSecret);
                        logger.debug('key: ' + key);
                    };

                    oa.getProtectedResource(privateReqURL, httpMethod, accessToken, accessTokenSecret,  function (error, data, response) {
                        req.call = privateReqURL;

                        // logger.debug(util.inspect(response));
                        if (error) {
                            logger.debug('Got error: ' + util.inspect(error));

                            if (error.data == 'Server Error' || error.data == '') {
                                req.result = 'Server Error';
                            } else {
                                req.result = error.data;
                            }

                            res.statusCode = error.statusCode

                            next();
                        } else {
                            req.resultHeaders = response.headers;
                            req.result = JSON.parse(data);

                            next();
                        }
                    });
                }
            );
        } else if (apiConfig.oauth.type == 'two-legged' && reqQuery.oauth == 'authrequired') { // Two-legged
            if (config.debug) {
                logger.debug('Two Legged OAuth');
            };

            var body,
                oa = new OAuth(null,
                               null,
                               apiKey || null,
                               apiSecret || null,
                               apiConfig.oauth.version || null,
                               null,
                               apiConfig.oauth.crypt);

            var resource = options.protocol + '://' + options.host + options.path,
                cb = function(error, data, response) {
                    if (error) {
                        if (error.data == 'Server Error' || error.data == '') {
                            req.result = 'Server Error';
                        } else {
                            logger.debug(util.inspect(error));
                            body = error.data;
                        }

                        res.statusCode = error.statusCode;

                    } else {
                        logger.debug(util.inspect(data));

                        var responseContentType = response.headers['content-type'];

                        switch (true) {
                            case /application\/javascript/.test(responseContentType):
                            case /text\/javascript/.test(responseContentType):
                            case /application\/json/.test(responseContentType):
                                body = JSON.parse(data);
                                break;
                            case /application\/xml/.test(responseContentType):
                            case /text\/xml/.test(responseContentType):
                            default:
                        }
                    }

                    // Set Headers and Call
                    if (response) {
                        req.resultHeaders = response.headers || 'None';
                    } else {
                        req.resultHeaders = req.resultHeaders || 'None';
                    }

                    req.call = url.parse(options.host + options.path);
                    req.call = url.format(req.call);

                    // Response body
                    req.result = body;

                    next();
                };

            switch (httpMethod) {
                case 'GET':
                    logger.debug(resource);
                    oa.get(resource, '', '',cb);
                    break;
                case 'PUT':
                case 'POST':
                    oa.post(resource, '', '', JSON.stringify(obj), null, cb);
                    break;
                case 'DELETE':
                    oa.delete(resource,'','',cb);
                    break;
            }

        } else {
            // API uses OAuth, but this call doesn't require auth and the user
            // isn't already authed, so just call it.
            unsecuredCall();
        }
    } else {
        // API does not use OAuth authentication
        unsecuredCall();
    }

    // Unsecured API Call helper
    function unsecuredCall() {
        var apiKey, username, password, encoded;
        logger.debug('Unsecured Call');

        if (body != null || !CAN_HAVE_BODY(httpMethod)) {
            options.path += ((paramString.length > 0) ? '?' + paramString : "");
        }

        function addApiKey(param, value) {
          var prefix = (options.path.indexOf('?') !== -1) ? '&' : '?';
          options.path += prefix + param + '=' + value;
        }

        // Add credentials, if provided.
        if (credentials) {
          apiKey = credentials.token;
          if (!reqQuery.headerNames) reqQuery.headerNames = [];
          if (!reqQuery.headerValues) reqQuery.headerValues = [];

          if (authMechanism && authMechanism.type === 'password') {
            username = credentials.username;
            password = credentials.password;
            if (username && password && authMechanism.mechanism === 'basic') {
              encoded = new Buffer(username + ':' + password).toString('base64');
              reqQuery.headerNames.push('Authorization');
              reqQuery.headerValues.push('Basic ' + encoded);
            } else {
              logger.warn("Unknown password authentication type: " + authMechanism.type);
            }
          } else if (apiKey && authMechanism && authMechanism.type === 'token') {
            if (authMechanism.mechanism === 'header') {
              reqQuery.headerNames.push(authMechanism.key || 'Authorization');
              reqQuery.headerValues.push((authMechanism.prefix || '') + apiKey);
            } else if (authMechanism.mechanism === 'parameter') {
              addApiKey(authMechanism.key, apiKey);
            }
          } else if (apiKey && apiConfig.keyParam) {
            addApiKey(apiConfig.keyParam, apiKey);
          } else {
            logger.warn("Credentials provided, but API not configured to use them");
          }
        }

        // Perform signature routine, if any.
        if (apiConfig.signature) {
            if (apiConfig.signature.type == 'signed_md5') {
                // Add signature parameter
                var timeStamp = Math.round(new Date().getTime()/1000);
                var sig = crypto.createHash('md5').update('' + apiKey + apiSecret + timeStamp + '').digest(apiConfig.signature.digest);
                options.path += '&' + apiConfig.signature.sigParam + '=' + sig;
            }
            else if (apiConfig.signature.type == 'signed_sha256') { // sha256(key+secret+epoch)
                // Add signature parameter
                var timeStamp = Math.round(new Date().getTime()/1000);
                var sig = crypto.createHash('sha256').update('' + apiKey + apiSecret + timeStamp + '').digest(apiConfig.signature.digest);
                options.path += '&' + apiConfig.signature.sigParam + '=' + sig;
            }
        }

        // Setup headers, if any
        if (reqQuery.headerNames && reqQuery.headerNames.length > 0) {
            logger.debug('Setting headers');
            var headers = {};

            for (var x = 0, len = reqQuery.headerNames.length; x < len; x++) {
                if (config.debug) {
                  logger.debug('Setting header: ' + reqQuery.headerNames[x] + ':' + reqQuery.headerValues[x]);
                };
                if (reqQuery.headerNames[x] != '') {
                    headers[reqQuery.headerNames[x]] = reqQuery.headerValues[x];
                }
            }

            options.headers = headers;
        }

        if (!options.headers['Content-Length']) {
            if (requestBody) {
                options.headers['Content-Length'] = requestBody.length;
            }
            else {
                options.headers['Content-Length'] = 0;
            }
        }

        if (requestBody) {
            options.headers['Content-Type'] = (body == null) ? 'application/x-www-form-urlencoded' : body.Format;
        }

        if (config.debug) {
            logger.debug(util.inspect(options));
        };

        var doRequest;
        if (options.protocol === 'https' || options.protocol === 'https:') {
            logger.debug('Protocol: HTTPS');
            options.protocol = 'https:'
            doRequest = https.request;
        } else {
            logger.debug('Protocol: HTTP');
            doRequest = http.request;
        }

        // API Call. response is the response from the API, res is the response we will send back to the user.
        var apiCall = doRequest(options, function(response) {
            response.setEncoding('utf-8');

            logger.debug("Received response")
            logger.debug('HEADERS: ' + JSON.stringify(response.headers));
            logger.debug('STATUS CODE: ' + response.statusCode);

            req.code = response.statusCode;

            var body = '';

            response.on('data', function(data) {
                body += data;
            })

            response.on('end', function() {
                logger.debug('REPONSE BODY: ' + body);
                delete options.agent;

                var responseContentType = response.headers['content-type'];

                switch (true) {
                    case /application\/javascript/.test(responseContentType):
                    case /application\/json/.test(responseContentType):
                        logger.debug(util.inspect(body));
                        // body = JSON.parse(body);
                        break;
                    case /application\/xml/.test(responseContentType):
                    case /text\/xml/.test(responseContentType):
                    default:
                }

                // Set Headers and Call
                req.resultHeaders = response.headers;
                req.call = url.parse(options.host + options.path);
                req.call = url.format(req.call);

                // Response body
                req.result = body;

                logger.debug(util.inspect(body));

                next();
            })
        }).on('error', function(e) {
            if (config.debug) {
                logger.debug('HEADERS: ' + JSON.stringify(res.headers));
                logger.debug("Got error: " + e.message);
                logger.debug("Error: " + util.inspect(e));
            };
        });

        if (requestBody) {
            apiCall.end(requestBody, 'utf-8');
        }
        else {
            apiCall.end();
        }
    }
}

//
// Routes
//
app.get('/', function(req, res) {
  res.render('listAPIs', { title: config.title });
});

var openAuthFilter = oauth.auth({
  logger: logger,
  config: config,
  redis: db,
  apis: apisConfig
});

// Process the API request
app.post('/processReq', openAuthFilter, processRequest, deliverResult);

function deliverResult (req, res) {
  var result = {
      headers: req.resultHeaders,
      response: req.result,
      call: req.call,
      code: req.code
  };

  res.send(result);
}

// Just auth
app.all('/auth', openAuthFilter);

// OAuth callback page, closes the window immediately after storing access token/secret
app.get('/authSuccess/:api',
  oauth.success({logger: logger, config: config, redis: db, apis: apisConfig}),
  function (req, res) { res.render('authSuccess', { title: 'OAuth Successful' });}
);

app.get('/custom', function(req, res) {
  res.render('custom', {error: null});
});

app.post('/custom', function(req, res) {
  var api = req.body;
  var name = api.name;
  var slug = api.slug;
  if (apisConfig[slug]) {
    return res.render('custom', {error: 'There is already a service with that identifier'})
  }
  api.publicPath = '/' + api.publicPath + '/service';
  var uri = api.protocol + "://" + api.baseURL + api.publicPath;
  logger.debug("Fetching service listing from " + uri);
  var fetching = http.get(uri, function(response) {
      var buff = "";
      response.on('data', function(chunk) { buff += chunk; });
      response.on('error', handleError);
      response.on('end', function() {
          logger.debug("Retrieved service listing for " + name);
          try {
              imAPIs[slug] = JSON.parse(buff);
          } catch (e) {
              var msg = "Error parsing service listing for " + slug;
              return handleError(msg);
          }
          apisConfig[slug] = api;
          res.redirect('/' + slug + '/docs');
      });
  });
  fetching.on('error', handleError);

  function handleError (err) {
    res.render('custom', {error: err});
  }
});

app.get('/', function (req, res) { res.render('api') });
app.get('/:api/docs', function (req, res) { res.render('api') });

app.post('/:api/run', function (req, res, next) {
  (req.body || {}).apiName = req.params.api;
  logger.debug("Set apiName to %s", req.params.api);
  logger.debug(req.body);
  next();
}, processRequest, deliverResult);

app.get('/:api/definition.json', function (req, res) {
  res.json(imAPIs[req.params.api]);
});

app.get('/mines.json', function (req, res) {
  var api, mines = {};
  for (var key in apisConfig) {
    api = apisConfig[key];
    mines[key] = api.protocol + "://" + api.baseURL + api.publicPath;
  }
  res.json(mines);
});

app.get('/:api/info.json', function (req, res) {
  res.json(apisConfig[req.params.api]);
});

app.get('/partials/:name.html', function (req, res) {
  res.render('partials/' + req.params.name, {layout: null});
});

// Only listen on $ node app.js

if (!module.parent) {
    var port = process.env.PORT || config.port;
    app.listen(port);
    logger.debug("Express server listening on port %d", port);
}
