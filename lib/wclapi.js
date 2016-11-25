var assert = require('assert');
var request = require('request');
var dbg = require('debug')('wclrdruidm:wclapi');
var qs = require('querystring');
var q = require('q');

var WCLAPI = function(apikey, requestcache, API) {
    var self = this;

    self.apikey = apikey;
    self.requestcache = requestcache;
    self.API = API || "https://www.warcraftlogs.com/v1";
};

WCLAPI.prototype.getFights = function(report) {
    var self = this;

    return self.requestPromise("/report/fights/" + report, {
        api_key: self.apikey
    })
        .then(function(body) {
            var result = JSON.parse(body);

            return result.fights;
        }, function(e) {
            console.log('getActorID ERR: ' + e);
            throw e;
        })
    ;
};

WCLAPI.prototype.getFriendlies = function(report) {
    var self = this;

    return self.requestPromise("/report/fights/" + report, {
        api_key: self.apikey
    })
        .then(function(body) {
            var result = JSON.parse(body);

            return result.friendlies.concat(result.friendlyPets);
        }, function(e) {
            console.log('getActorID ERR: ' + e);
            throw e;
        })
    ;
};

/**
 * find actorID by character name
 *
 * @param report
 * @param name
 * @returns q.promise
 */
WCLAPI.prototype.getActorID = function(report, name) {
    var self = this;

    return self.requestPromise("/report/fights/" + report, {
        api_key: self.apikey
    })
        .then(function(body) {
            var result = JSON.parse(body);

            var actorID = null;
            result.friendlies.forEach(function(friendly) {
                if (friendly.name === name) {
                    actorID = friendly.id;
                }
            });

            if (!actorID) {
                throw new Error("Could not find actorID for " + name);
            }

            return actorID;
        })
    ;
};

/**
 * get all events between start_time and end_time for actorid
 *
 * @param report
 * @param actorid
 * @param start_time
 * @param end_time
 * @returns {*}
 */
WCLAPI.prototype.getEvents = function(report, actorid, start_time, end_time) {
    var self = this;
    var events = [];

    var def = q.defer();

    var _getEvents = function(start_time) {
        def.notify(start_time);

        return self.requestPromise("/report/events/" + report, {
            api_key: self.apikey,
            start: start_time,
            end: end_time,
            actorid: actorid
        })
            .then(function(body) {
                var result = JSON.parse(body);

                if (result.events) {
                    events = events.concat(result.events);

                    // continue querying until there's nothing left
                    if (result.nextPageTimestamp) {
                        return _getEvents(result.nextPageTimestamp);
                    }
                }
            })
        ;
    };

    _getEvents(start_time).then(function() {
        dbg("total events: " + events.length);
        return events;
    }).then(function(r) { def.resolve(r); }, function(e) { def.reject(e); });

    return def.promise;
};

/**
 * wrap request in promise
 *
 * @param endpoint
 * @param query
 * @returns q.promise
 */
WCLAPI.prototype.requestPromise = function(endpoint, query) {
    var self = this;
    var def = q.defer();
    var url = self.API + endpoint + "?" + qs.stringify(query);

    dbg(url);

    self.requestcache.get(url, function (err, result) {
        if (err) {
            if (err.type === "NotFoundError") {
                result = null;
            } else {
                def.reject(err);
                return;
            }
        }

        if (result) {
            def.resolve(result);
            return;
        }

        request(url, function(error, response, body) {
            if (!error && response && response.statusCode == 200) {
                self.requestcache.put(url, body, function (err) {
                    if (err) {
                        def.reject(err);
                    } else {
                        def.resolve(body);
                    }
                });
            } else {
                dbg(body);
                dbg(error);
                dbg(response && response.statusCode);
                def.reject(error);
            }
        });
    });

    return def.promise;
};

module.exports = exports = WCLAPI;
