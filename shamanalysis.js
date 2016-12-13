var assert = require('assert');
var Table = require('cli-table');
var leveldb = require('level-browserify');
var q = require('q');

var rdruidMastery = require('./');

// get CLI args
var yargs = require('yargs').argv;

// get input
var VERBOSE = yargs.output === "verbose";
var APIKEY = yargs.apikey || process.env['WCL_RSHAMAN_APIKEY'] || process.env['WCL_APIKEY'];
var REPORT = yargs.report || process.env['WCL_RSHAMAN_REPORT'];
var CHARNAME = yargs.character || yargs.charname || process.env['WCL_RSHAMAN_CHARACTER'] || process.env['WCL_RSHAMAN_CHARNAME'];

// validate input
assert(APIKEY, "APIKEY or --apikey required");
assert(REPORT, "--report required");
assert(CHARNAME, "--character required");
assert(yargs._.length === 1, "`ls` or fightID required");

var wclapi = new rdruidMastery.WCLAPI(APIKEY, leveldb('./requestcache.leveldb'));

// when `ls` as argument just list the fights
if (yargs._[0] === "ls") {
    wclapi.getFights(REPORT)
        .then(function(fights) {
            var table = new Table({
                head: ['Boss', '%', 'bossID', 'fightID']
                , colWidths: [40, 10, 10, 10]
            });

            fights
                .filter(function(fight) { return !!fight.boss; })
                .forEach(function(fight) {
                    table.push([
                        fight.name, (fight.bossPercentage / 100).toFixed(1) + "%", fight.boss, fight.id
                    ]);
                })
            ;

            console.log(table.toString());
        })
        .fail(function(e) {
            console.log('ERR5: ' + e);
            console.log(e.stack);
        })
}
// when `lsfriendlies` as argument just list the friendlies
else if (yargs._[0] === "lsfriendlies") {
    wclapi.getFriendlies(REPORT)
        .then(function(friendlies) {
            var table = new Table({
                head: ['Name', 'ID']
                , colWidths: [40, 10]
            });

            friendlies
                .filter(function(friendly) { return friendly.type !== "Pet"; })
                .sort(function(a, b) { if (a.name < b.name) { return -1; } else { return 1; } })
                .forEach(function(friendly) {
                    console.log(friendly);
                    table.push([
                        friendly.name, friendly.id
                    ]);
                })
            ;

            console.log(table.toString());
        })
        .fail(function(e) {
            console.log('ERR5: ' + e);
            console.log(e.stack);
        })
}
// otherwise take the argument as fightID
else {
    var FIGHTID = yargs._[0];
    var IGNORE = [];
    if (yargs.ignore) {
        if (typeof yargs.ignore === "string") {
            IGNORE = yargs.ignore.split(",").map(function(ignore) {
                return ignore.trim();
            });
        } else {
            IGNORE = yargs.ignore;
        }
    }

    wclapi.getFights(REPORT)
        .then(function(fights) {
            // find the fight
            var fight = fights.filter(function(fight) {
                return fight.id === FIGHTID;
            });
            assert(fight.length === 1, "fightID not found");

            return fight[0];
        })
        .then(function(fight) {
            if (fight.boss === 1854) {
                console.warn("!! WARNING !!");
                console.warn("Due to the portals not being logged properly on the [" + fight.name + "] fight \n" +
                    "you need to put the people who entered the portal on ignore using `--ignore name1,name2,name3,etc`. \n" +
                    "This will ofcourse affect your stats a bit.");
                console.warn("!! WARNING !!");
            }

            return fight;
        })
        .then(function(fight) {
            return wclapi.getFriendlies(REPORT)
                .then(function(friendlies) {
                    // we need the actorID instead of the name
                    return wclapi.getActorID(REPORT, CHARNAME)
                        .then(function(actorID) {
                            // get all events
                            return wclapi.getEvents(REPORT, actorID, fight.start_time, fight.end_time)
                                .then(function(events) {

                                    var def = q.defer();

                                    try {
                                        var parser = new rdruidMastery.Parser(fight, actorID, friendlies, events, IGNORE);
                                        parser.parse();

                                        // need short timeout for `debug` to flush
                                        setTimeout(function() {
                                            def.resolve(parser.statBenefits);
                                        }, 100);
                                    } catch (e) {
                                        // need short timeout for `debug` to flush
                                        setTimeout(function() {
                                            def.reject(e);
                                        }, 100);
                                    }

                                    return def.promise;
                                })
                                .then(function(statBenefits) {
                                    var masteryHPS = statBenefits.mastery.events.reduce(function(a, b) { return (a.healingPerPoint || a) + b.healingPerPoint; }, 0);
                                    var masteryAverage = masteryHPS / statBenefits.mastery.events.length;

                                    var critHPS = statBenefits.crit.events.filter(Boolean).reduce(function(a, b) { return (a.healingPerPoint || a) + b.healingPerPoint; }, 0);
                                    var critAverage = critHPS / statBenefits.crit.events.length;

                                    var versHPS = statBenefits.vers.events.filter(Boolean).reduce(function(a, b) { return (a.healingPerPoint || a) + b.healingPerPoint; }, 0);
                                    var versAverage = versHPS / statBenefits.vers.events.length;

                                    var intHPS = statBenefits.int.events.filter(Boolean).reduce(function(a, b) { return (a.healingPerPoint || a) + b.healingPerPoint; }, 0);
                                    var intAverage = intHPS / statBenefits.int.events.length;

                                    console.log('Intellect Avg. Healing Per Event: ' + intAverage + '.');
                                    console.log('Mastery Avg. Healing Per Event: ' + masteryAverage + '.');
                                    console.log('Crit Avg. Healing Per Event: ' + critAverage + '.');
                                    console.log('Vers Avg. Healing Per Event: ' + versAverage + '.');
                                })
                            ;
                        })
                    ;
                })
            ;
        })
        .fail(function(e) {
            console.log('ERR4: ' + e);
            console.log(e.stack);
            throw e;
        })
    ;
}
