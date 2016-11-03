var assert = require('assert');
var request = require('request');
var qs = require('querystring');
var q = require('q');
var _redis = require("redis"),
    redis = _redis.createClient();
var Table = require('cli-table');

// get CLI args
var yargs = require('yargs').argv;

// list of HoTs we take into account for mastery stacks
var HOTS = [
    "Rejuvenation",
    "Rejuvenation (Germination)",
    "Cenarion Ward",
    "Cultivation",
    "Wild Growth",
    "Regrowth",
    "Lifebloom",
    "Spring Blossoms"
];

// prefix for caching request results
var REDIS_PREFIX = "wclrdruid:";

// base url for API
var API = "https://www.warcraftlogs.com/v1";

// get input
var VERBOSE = yargs.output === "verbose";
var APIKEY = yargs.apikey || process.env['WCL_RDRUID_APIKEY'] || process.env['WCL_APIKEY'];
var REPORT = yargs.report || process.env['WCL_RDRUID_REPORT'];
var CHARNAME = yargs.character || yargs.charname || process.env['WCL_RDRUID_CHARACTER'] || process.env['WCL_RDRUID_CHARNAME'];

// validate input
assert(APIKEY, "APIKEY or --apikey required");
assert(REPORT, "--report required");
assert(CHARNAME, "--character required");
assert(yargs._.length === 1, "`ls` or fightID required");


// when `ls` as argument just list the fights
if (yargs._[0] === "ls") {
    requestt("/report/fights/" + REPORT, {api_key: APIKEY})
        .then(function(body) {
            var result = JSON.parse(body);

            var table = new Table({
                head: ['Boss', '%', 'fightID']
                , colWidths: [40, 10, 10]
            });

            result.fights
                .filter(function(fight) { return !!fight.boss; })
                .forEach(function(fight) {
                    table.push([
                        fight.name, (fight.bossPercentage / 100).toFixed(1) + "%", fight.id
                    ]);
                })
            ;

            console.log(table.toString());
        })
        .then(function() {
            redis.quit();
        }, function(e) {
            redis.quit();
            console.log('ERR5: ' + e);
            throw e;
        })
}
// otherwise take the argument as fightID
else {
    var FIGHTID = yargs._[0];

    var START_TIME = null;
    var END_TIME = null;

    requestt("/report/fights/" + REPORT, {api_key: APIKEY})
        .then(function(body) {
            var result = JSON.parse(body);

            // find the fight
            var fight = result.fights.filter(function(fight) {
                return fight.id === FIGHTID;
            });
            assert(fight.length === 1, "fightID not found");

            return fight[0];
        })
        .then(function(fight) {
            // set start/end time based on selected fight
            START_TIME = fight.start_time;
            END_TIME = fight.end_time;

            // we need the actorID instead of the name
            return getActorID(REPORT, CHARNAME)
                .then(function(ACTORID) {
                    // get all events
                    return getEvents(REPORT, ACTORID, START_TIME, END_TIME)
                        .then(function(events) {
                            // filter out events we don't need
                            events = events.filter(function(event) {
                                if (['applybuff', 'removebuff'].indexOf(event.type) !== -1) {
                                    return HOTS.indexOf(event.ability.name) !== -1;
                                } else if (event.type === 'combatantinfo') {
                                    return true;
                                }

                                return false;
                            });

                            // this is where we sum up the total amount of time a target has X stacks
                            var masteryStacks = {};
                            for (var i = 1; i < 10; i++) {
                                masteryStacks[i] = 0;
                            }
                            // tracking our targets
                            var targets = {};

                            events.forEach(function(event) {
                                // time since start of the fight
                                var timesincefight = event.timestamp - START_TIME;

                                switch (event.type) {
                                    // talents, gear, etc
                                    //  will be useful when we want to display some extra info
                                    case 'combatantinfo':
                                        // console.log(JSON.stringify(event, null, 4));
                                        break;

                                    // buff being applied
                                    case 'applybuff':
                                        if (VERBOSE) {
                                            console.log((timesincefight / 1000) + " :: " + event.type + " :: " + event.targetID + " :: " + event.ability.name + " :: " + event.ability.guid);
                                        }

                                        // ensure target exists
                                        if (typeof targets[event.targetID] === "undefined") {
                                            targets[event.targetID] = {
                                                hots: [],
                                                timeLastChange: null
                                            };
                                        }

                                        // sanity check that we don't track the same buff twice
                                        //  if this triggers it means we have a bug xD
                                        var idx = null;
                                        targets[event.targetID].hots.forEach(function(_event, _idx) {
                                            if (_event.ability.guid === event.ability.guid) {
                                                idx = _idx;
                                            }
                                        });
                                        if (idx !== null) {
                                            throw new Error("applybuff: " + event.targetID + " already has " + event.ability.name + " buff");
                                        }

                                        // if there were any HoTs on the target before this HoT was applied
                                        //  then we attribute the time since the previous HoT was applied / expired to the stack count
                                        if (targets[event.targetID].hots.length > 0) {
                                            var stacks = targets[event.targetID].hots.length;
                                            var time = event.timestamp - targets[event.targetID].timeLastChanged;

                                            masteryStacks[stacks] += time;
                                        }

                                        // then add our new HoT to the target
                                        targets[event.targetID].timeLastChanged = event.timestamp;
                                        targets[event.targetID].hots.push(event);

                                        break;

                                    // buff expires
                                    case 'removebuff':
                                        if (VERBOSE) {
                                            console.log((timesincefight / 1000) + " :: " + event.type + " :: " + event.targetID + " :: " + event.ability.name + " :: " + event.ability.guid);
                                        }

                                        // ensure target exists
                                        if (typeof targets[event.targetID] === "undefined") {
                                            targets[event.targetID] = {
                                                hots: [],
                                                timeLastChange: null
                                            };
                                        }

                                        // find matching HoT on target
                                        var idx = null;
                                        targets[event.targetID].hots.forEach(function(_event, _idx) {
                                            if (_event.ability.guid === event.ability.guid) {
                                                idx = _idx;
                                            }
                                        });

                                        // sanity check that we were tracking the expiring buff
                                        //  if this triggers it means we have a bug xD
                                        if (idx === null) {
                                            // ignore errors for HoTs that could have been applied before combat started
                                            //  stop doing this past 30s into the fight
                                            if (event.timestamp - (30 * 1000) < START_TIME) {
                                                break;
                                            }
                                            throw new Error("removebuff: " + event.targetID + " does not have " + event.ability.name + " buff (" + event.ability.guid + ")");
                                        } else {
                                            // attribute the time since the previous HoT was applied / expired to the stack count
                                            var stacks = targets[event.targetID].hots.length;
                                            var time = event.timestamp - targets[event.targetID].timeLastChanged;

                                            masteryStacks[stacks] += time;

                                            // remove the HoT from the target
                                            targets[event.targetID].timeLastChanged = event.timestamp;
                                            targets[event.targetID].hots.splice(idx, 1);
                                        }

                                        break;

                                    default:
                                        console.log(JSON.stringify(event, null, 4));

                                        // if (!event.ability) {
                                        //     console.log(JSON.stringify(event, null, 4));
                                        // } else {
                                        //     console.log(event.type + " :: " + event.ability.name);
                                        // }

                                        break;
                                }
                            });

                            // end of fight, expire any remaining HoTs
                            for (var targetID in targets) {
                                if (targets[targetID].hots.length > 0) {
                                    var stacks = targets[targetID].hots.length;
                                    var time = END_TIME - targets[targetID].timeLastChanged;

                                    masteryStacks[stacks] += time;
                                }
                            }

                            return masteryStacks;
                        })
                        .then(function(masteryStacks) {
                            var table = new Table({
                                head: ['Stacks', 'time', '%', 'cummul time', 'cummul %']
                                , colWidths: [8, 10, 10, 10, 10]
                            });

                            // sum up the total HoT time
                            var total = 0;
                            for (var i = 1; i < 10; i++) {
                                total += masteryStacks[i];
                            }

                            // weighted time (for avg HoTs calc)
                            var avgsum = 0;
                            // cummulative time
                            var cummul = 0;

                            // loop from high to low
                            for (var i = 9; i > 0; i--) {
                                var stacks = i;
                                var time = masteryStacks[stacks];

                                // add time to cummulative time
                                cummul += time;

                                // add time to weighted time
                                avgsum += (stacks * time);

                                // don't start printing until we have something to print
                                if (cummul > 0) {
                                    table.push([
                                        stacks,
                                        (time / 1000).toFixed(1) + "s", (time / total * 100).toFixed(1) + "%",
                                        (cummul / 1000).toFixed(1) + "s", (cummul / total * 100).toFixed(1) + "%"
                                    ]);
                                }
                            }

                            console.log(table.toString());
                            console.log("average HoTs on target: " + (avgsum / total));
                        }, function(e) {
                            console.log('ERR3: ' + e);
                            throw e;
                        })
                    ;
                })
            ;
        })
        .then(function() {
            redis.quit();
        }, function(e) {
            redis.quit();
            console.log('ERR4: ' + e);
            throw e;
        })
    ;
}

/**
 * wrap request in promise
 *
 * @param endpoint
 * @param query
 * @returns q.promise
 */
function requestt(endpoint, query) {
    var def = q.defer();

    var url = API + endpoint + "?" + qs.stringify(query);

    console.log(url);

    redis.get(REDIS_PREFIX + url, function(err, result) {
        if (err) {
            def.reject(err);
            return;
        }

        if (result) {
            def.resolve(result);
            return;
        }

        request(url, function(error, response, body) {
            if (!error && response.statusCode == 200) {
                redis.set(REDIS_PREFIX + url, body, function(err) {
                    if (err) {
                        def.reject(err);
                    } else {
                        def.resolve(body);
                    }
                });
            } else {
                console.log(body);
                console.log(error);
                console.log(response.statusCode);
                def.reject(error);
            }
        });
    });

    return def.promise;
}

/**
 * find actorID by character name
 *
 * @param REPORT
 * @param NAME
 * @returns q.promise
 */
function getActorID(REPORT, NAME) {
    return requestt("/report/fights/" + REPORT, {
        api_key: APIKEY
    })
        .then(function(body) {
            var result = JSON.parse(body);

            var actorID = null;
            result.friendlies.forEach(function(friendly) {
                if (friendly.name === NAME) {
                    actorID = friendly.id;
                }
            });

            if (!actorID) {
                throw new Error("Could not find actorID for " + NAME);
            }

            return actorID;
        }, function(e) {
            console.log('getActorID ERR: ' + e);
            throw e;
        })
    ;
}

/**
 * get all events between START_TIME and END_TIME for ACTORID
 *
 * @param REPORT
 * @param ACTORID
 * @param START_TIME
 * @param END_TIME
 * @returns {*}
 */
function getEvents(REPORT, ACTORID, START_TIME, END_TIME) {
    var events = [];

    var _getEvents = function(START_TIME) {
        return requestt("/report/events/" + REPORT, {
                api_key: APIKEY,
                start: START_TIME,
                end: END_TIME,
                actorid: ACTORID
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
            }, function(e) {
                console.log('ERR1: ' + e);
                throw e;
            })
        ;
    };

    return _getEvents(START_TIME).then(function() {
        console.log("total events: " + events.length);
        return events;
    }, function(e) {
        console.log('ERR2: ' + e);
        throw e;
    });
}
