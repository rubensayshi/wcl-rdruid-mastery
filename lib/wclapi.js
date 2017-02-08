var assert = require('assert');
var request = require('request');
var dbg = require('debug')('wclrdruidm:wclapi');
var qs = require('querystring');
var q = require('q');
var _ = require('lodash');
var consts = require('./consts');

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

    var defaultOrderedTypes = ['resurrect', 'cast', 'removebuff', 'applybuff', 'refreshbuff', 'heal'];


    var Tick = function(ts) {
        this.ts = ts;
        this.byGuid = {};
        this.guids = [];
    };

    Tick.prototype.containsCastOfGuid = function(guid) {
        if (this.guids.indexOf(guid) === -1) {
            return false;
        }

        var castEvents = this.byGuid[guid].events.filter(function(event) {
            return event.type === 'cast';
        });

        if (!castEvents.length) {
            return false;
        }

        // sanity, we can't cast twice in 1 tick!?
        if (castEvents.length > 1) {
            throw new Error("WTF?");
        }

        return true;
    };

    Tick.prototype.addEvent = function(event) {
        var guid = event.ability && event.ability.guid || 0;
        var type = defaultOrderedTypes.indexOf(event.type) !== -1 ? event.type : 'rest';

        this.prepare(guid, type);

        this.byGuid[guid].events.push(event);
        this.byGuid[guid].byType[type].push(event);
    };

    Tick.prototype.prepare = function(guid, type) {
        if (typeof this.byGuid[guid] === "undefined") {
            this.byGuid[guid] = {
                byType: [],
                events: []
            };
            this.guids.push(guid);
        }
        if (typeof this.byGuid[guid].byType[type] === "undefined") {
            this.byGuid[guid].byType[type] = [];
        }
    };

    Tick.prototype.deaths = function() {
        if (this.guids.indexOf(0) === -1) {
            return [];
        }

        return this.byGuid[0].events.filter(function(event) {
            return event.type === 'death';
        });
    };

    Tick.prototype.containsApplyBuffOfGuid = function(guid) {
        if (this.guids.indexOf(guid) === -1) {
            return false;
        }

        var applyEvents = this.byGuid[guid].events.filter(function(event) {
            return event.type === 'applybuff';
        });

        if (!applyEvents.length) {
            return false;
        }

        return true;
    };

    var def = q.defer();

    var _getActorEvents = function(start_time) {
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
                    var events = result.events;

                    // continue querying until there's nothing left
                    if (result.nextPageTimestamp) {
                        return _getActorEvents(result.nextPageTimestamp)
                            .then(function(moreEvents) {
                                return events.concat(moreEvents);
                            });
                    } else {
                        return events;
                    }
                }
            });
    };

    var _getDeathEvents = function(start_time) {
        def.notify(start_time);

        return self.requestPromise("/report/events/" + report, {
            api_key: self.apikey,
            start: start_time,
            end: end_time,
            filter: "type='death' OR type='resurrect'"
        })
            .then(function(body) {
                var result = JSON.parse(body);

                if (result.events) {
                    var events = result.events;

                    // continue querying until there's nothing left
                    if (result.nextPageTimestamp) {
                        return _getActorEvents(result.nextPageTimestamp)
                            .then(function(moreEvents) {
                                return events.concat(moreEvents);
                            });
                    } else {
                        return events;
                    }
                }
            })
    };

    return _getActorEvents(start_time)
        .then(function(actorEvents) {
            return _getDeathEvents(start_time)
                .then(function(deathEvents) {
                    return deathEvents.filter(function(event) {
                        return event.targetID !== actorid && event.sourceID !== actorid;
                    });
                })
                .then(function(deathEvents) {
                    var events = actorEvents.concat(deathEvents);
                    events.sort(function(eventA, eventB) {
                        var r = eventA.timestamp < eventB.timestamp ? -1 : (eventA.timestamp > eventB.timestamp ? 1 : 0);

                        if (r !== 0) {
                            return r;
                        } else {
                            var aInDeaths = deathEvents.indexOf(eventA) !== -1;
                            var bInDeaths = deathEvents.indexOf(eventB) !== -1;

                            if (aInDeaths && !bInDeaths) {
                                return -1;
                            }

                            if (!aInDeaths && bInDeaths) {
                                return 1;
                            }

                            return 0;
                        }
                    });

                    return events;
                });
        })
        .then(function(events) {
            dbg("total events: " + events.length);

            var typeXBeforeYOfSameGuid = function(typeX, typeY) {
                typeX = typeof typeX === "string" ? [typeX] : typeX;
                typeY = typeof typeY === "string" ? [typeY] : typeY;

                return function(eventA, eventB) {
                    if (typeX.indexOf(eventA.type) !== -1 && typeY.indexOf(eventB.type) !== -1) {
                        if (eventA.ability.guid === eventB.ability.guid) {
                            return -1;
                        }

                    } else if (typeY.indexOf(eventA.type) !== -1 && typeX.indexOf(eventB.type) !== -1) {
                        if (eventA.ability.guid === eventB.ability.guid) {
                            return 1;
                        }
                    }

                    return 0;
                };
            };

            var s = null, e = null;
            // s = -1.0; e = 2.0;
            // s = 25.0; e = 26.0;
            // s = 47.0; e = 48.0;
            // s = 15.0; e = 17.5;
            // s = 0; e = 184;
            if (s && e) {
                events = events.filter(function (event) {
                    return event.timestamp >= start_time + (s * 1000) && event.timestamp <= start_time + (e * 1000);
                });
            }

            events = events.filter(function (event) {
                /*
                 begincast, cast, miss, damage, heal, absorbed, healabsorbed, applybuff, applydebuff, applybuffstack, applydebuffstack,
                 refreshbuff, refreshdebuff, removebuff, removedebuff, removebuffstack, removedebuffstack, summon, create, death, destroy,
                 extraattacks, aurabroken, dispel, interrupt, steal, leech, energize, drain, resurrect, encounterstart, encounterend
                 */

                return [
                        'combatantinfo',
                        'heal', 'cast', 'applybuff', 'removebuff', 'refreshbuff',
                        'death', 'resurrect'
                    ].indexOf(event.type) !== -1;
            });

            // events = events.filter(function (event) {
            //     if (['heal', 'cast', 'applybuff', 'removebuff', 'refreshbuff'].indexOf(event.type) !== -1 && event.targetID !== 30) {
            //         return false;
            //     }
            //
            //     return true;
            // });

            // events = events.filter(function (event) {
            //     if (event.ability && event.ability.guid !== 207386) {
            //         return false;
            //     }
            //
            //     return true;
            // });

            var DEBUG = false;
            var debug = function() {
                if (DEBUG) {
                    console.log.apply(this, arguments);
                }
            };

            var debugEvents = function(events) {
                return events.map(function(event) {
                    return [
                        "timestamp=" + event.timestamp,
                        "time=" + ((event.timestamp - start_time) / 1000),
                        "type=" + event.type,
                        "targetID=" + event.targetID,
                        "ability=" + (event.ability && event.ability.name) + "(" + (event.ability && event.ability.guid) + ")"
                    ].join(", ");
                });
            };

            debug('initial', debugEvents(events));

            var prevTick = new Tick(0);
            var tick = new Tick(0);
            var newEvents = [];

            var finishTick = function() {
                debug([
                    'finishTick',
                    "timestamp=" + tick.ts,
                    "time=" + ((tick.ts - start_time) / 1000)
                ].join(", "));

                var deaths = tick.deaths();
                var deathIDs = deaths.map(function(event) {
                    return event.targetID;
                });
                if (deaths.length) {
                    debug('deaths', debugEvents(deaths));
                }

                // for deaths in this tick we pull the removebuff from last tick into this tick
                if (tick.ts - prevTick.ts <= 300 && deaths.length) {
                    // debug('deaths guid=' + guid);
                    // debug(prevTick.byGuid[guid]);

                    prevTick.guids.forEach(function (guid) {
                        prevTick.byGuid[guid].events.filter(function (event) {
                            return event.type === 'removebuff' && deathIDs.indexOf(event.targetID) !== -1;
                        }).forEach(function (removeBuff) {
                            debug('shift removeBuff to match death', debugEvents([removeBuff]));

                            var removeBuffIdx = newEvents.indexOf(removeBuff);
                            newEvents.splice(removeBuffIdx, 1);
                            removeBuff.timestamp = tick.ts;

                            tick.addEvent(removeBuff);
                        });
                    });
                }

                tick.guids.forEach(function(guid) {
                    // if prevTick was within 10ms and it contains an applybuff of something we casted in this tick
                    //  then we pull the applybuff into this tick
                    if (tick.ts - prevTick.ts <= 10 &&
                        tick.containsCastOfGuid(guid) && !prevTick.containsCastOfGuid(guid) &&
                        prevTick.containsApplyBuffOfGuid(guid) && !tick.containsApplyBuffOfGuid(guid)) {

                        // remove the event that was added by the prevtick
                        prevTick.byGuid[guid].events.filter(function (event) {
                            return event.type === 'applybuff';
                        }).forEach(function (prevApply) {

                            debug('shift applybuff to match cast', debugEvents([prevApply]));
                            var prevApplyIdx = newEvents.indexOf(prevApply);
                            newEvents.splice(prevApplyIdx, 1);
                            prevApply.timestamp = tick.ts;

                            tick.addEvent(prevApply);
                        });
                    }
                });

                tick.guids.forEach(function(guid) {
                    var orderedTypes;

                    // CW BUFF needs to be applybuff before removebuff
                    if (guid === consts.CWGUIDS.BUFF) {
                        orderedTypes = ['cast', 'applybuff', 'refreshbuff', 'removebuff', 'heal', 'death'];
                    } else {
                        orderedTypes = defaultOrderedTypes;
                    }

                    var events = tick.byGuid[guid].events.slice();

                    orderedTypes.forEach(function (type) {
                        if (typeof tick.byGuid[guid].byType[type] !== "undefined") {
                            tick.byGuid[guid].byType[type].forEach(function (event) {
                                newEvents.push(event);
                                debug('add', debugEvents([event]));
                                var idx = events.indexOf(event);
                                events.splice(idx, 1);
                            });
                        }
                    });

                    newEvents = newEvents.concat(events);
                });
            };

            events.slice().forEach(function(event) {
                debug('event', debugEvents([event]));

                if (tick.ts !== event.timestamp) {
                    finishTick();

                    // reset for next tick
                    prevTick = tick;
                    tick = new Tick(event.timestamp);
                }

                tick.addEvent(event);
            });
            finishTick();

            debug('final', debugEvents(newEvents));

            // throw new Error();

            return newEvents;
        });
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
