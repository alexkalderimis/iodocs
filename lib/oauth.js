var redis = {}
  , util  = require('util')
  , OAuth = require('oauth').OAuth
  , url = require('url');

try {
  redis = require('redis');
} catch (e) {
  // ignore.
}

exports.auth = middleware;
exports.success = oauthSuccess;

// Middleware
//
function middleware (options) {

  var logger     = options.logger
    , config     = options.config
    , db         = options.redis
    , apisConfig = options.apis;

  return oauth;

  function oauth(req, res, next) {
    logger.debug('OAuth process started');
    var apiName = req.body.apiName
      , apiConfig = apisConfig[apiName]
      , apiKey, apiSecret, refererURL
      , callbackURL, oa;

    if (!apiconfig.oauth) return next();

    apiKey = req.body.apiKey || req.body.key,
    apiSecret = req.body.apiSecret || req.body.secret,
    refererURL = url.parse(req.headers.referer),
    callbackURL = refererURL.protocol + '//' + refererURL.host + '/authSuccess/' + apiName,
    oa = new OAuth(
      apiConfig.oauth.requestURL,
      apiConfig.oauth.accessURL,
      apiKey,
      apiSecret,
      apiConfig.oauth.version,
      callbackURL,
      apiConfig.oauth.crypt
    );

    logger.debug('OAuth type: ' + apiConfig.oauth.type);
    logger.debug('Method security: ' + req.body.oauth);
    logger.debug('Session authed: ' + req.session[apiName]);
    logger.debug('apiKey: ' + apiKey);
    logger.debug('apiSecret: ' + apiSecret);

    // Check if the API even uses OAuth, then if the method requires oauth, then
    // if the session is not authed
    if (apiConfig.oauth.type == 'three-legged'
        && req.body.oauth == 'authrequired'
        && (!req.session[apiName] || !req.session[apiName].authed) ) {

      logger.debug('req.session: ' + util.inspect(req.session));
      logger.debug('headers: ' + util.inspect(req.headers));
      logger.debug(util.inspect(oa));
      logger.debug('sessionID: ' + util.inspect(req.sessionID));

      oa.getOAuthRequestToken(handleResponse);

    } else if (apiConfig.oauth.type == 'two-legged' && req.body.oauth == 'authrequired') {
      // Two legged stuff... for now nothing.
      next();
    } else {
      next();
    }

    function handleResponse(err, oauthToken, oauthTokenSecret, results) {
      if (err) {
        res.send("Error getting OAuth request token : " + util.inspect(err), 500);
      } else {
        // Unique key using the sessionID and API name to store tokens and secrets
        var key = req.sessionID + ':' + apiName;

        db.set(key + ':apiKey', apiKey, redis.print);
        db.set(key + ':apiSecret', apiSecret, redis.print);

        db.set(key + ':requestToken', oauthToken, redis.print);
        db.set(key + ':requestTokenSecret', oauthTokenSecret, redis.print);

        // Set expiration to same as session
        db.expire(key + ':apiKey', 1209600000);
        db.expire(key + ':apiSecret', 1209600000);
        db.expire(key + ':requestToken', 1209600000);
        db.expire(key + ':requestTokenSecret', 1209600000);

        // res.header('Content-Type', 'application/json');
        res.send({ 'signin': apiConfig.oauth.signinURL + oauthToken });
      }
    }
  }
}

//
// OAuth Success!
//
function oauthSuccess (options) {

  var logger     = options.logger
    , config     = options.config
    , db         = options.redis
    , apisConfig = options.apis;

  return handler;
  
  function handler (req, res, next) {
    var apiName = req.params.api,
        apiConfig = apisConfig[apiName],
        key = req.sessionID + ':' + apiName,
        withKey = function (s) { return key + s; }; // Unique key using the sessionID and API name to store tokens and secrets

    logger.debug('apiName: ' + apiName);
    logger.debug('key: ' + key);
    logger.debug(util.inspect(req.params));

    db.mget([':requestToken', ':requestTokenSecret', ':apiKey', ':apiSecret'].map(withKey), retrieved);

    function retrieved (err, result) {
      var oa,
        apiKey,
        apiSecret,
        oauthRequestToken,
        oauthRequestTokenSecret;

      if (err) {
        logger.error(util.inspect(err));
      }

      oauthRequestToken = result[0],
      oauthRequestTokenSecret = result[1],
      apiKey = result[2],
      apiSecret = result[3];

      logger.debug(util.inspect(">>"+oauthRequestToken));
      logger.debug(util.inspect(">>"+oauthRequestTokenSecret));
      logger.debug(util.inspect(">>"+req.query.oauth_verifier));

      var oa = new OAuth(
        apiConfig.oauth.requestURL,
        apiConfig.oauth.accessURL,
        apiKey,
        apiSecret,
        apiConfig.oauth.version,
        null,
        apiConfig.oauth.crypt
      );

      logger.debug(util.inspect(oa));

      oa.getOAuthAccessToken(
        oauthRequestToken,
        oauthRequestTokenSecret,
        req.query.oauth_verifier,
        handleToken
      );

      function handleToken (error, oauthAccessToken, oauthAccessTokenSecret, results) {
        if (error) {
          res.send("Error getting OAuth access token : " + util.inspect(error)
              + "[" + oauthAccessToken +"]" + "["+oauthAccessTokenSecret +"]"
              + "[" + util.inspect(results) +"]", 500);
        } else {
          logger.debug('results: ' + util.inspect(results));
          db.mset([key + ':accessToken', oauthAccessToken,
            key + ':accessTokenSecret', oauthAccessTokenSecret
          ], function(err, results2) {
            req.session[apiName] = {};
            req.session[apiName].authed = true;
            if (config.debug) {
                logger.debug('session[apiName].authed: ' + util.inspect(req.session));
            };

            next();
          });
        }
      }
    }
  }
}
