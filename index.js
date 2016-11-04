var assert = require('assert');
var Table = require('cli-table');
var WCLAPI = require('./lib/wclapi');
var Parser = require('./lib/parser');
var leveldb = require('level-browserify');

// get CLI args
var yargs = require('yargs').argv;

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

var wclapi = new WCLAPI(APIKEY, leveldb('./requestcache.leveldb'));

// when `ls` as argument just list the fights
if (yargs._[0] === "ls") {
    wclapi.getFights(REPORT)
        .then(function(fights) {
            var table = new Table({
                head: ['Boss', '%', 'fightID']
                , colWidths: [40, 10, 10]
            });

            fights
                .filter(function(fight) { return !!fight.boss; })
                .forEach(function(fight) {
                    table.push([
                        fight.name, (fight.bossPercentage / 100).toFixed(1) + "%", fight.id
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
            // we need the actorID instead of the name
            return wclapi.getActorID(REPORT, CHARNAME)
                .then(function(actorID) {
                    // get all events
                    return wclapi.getEvents(REPORT, actorID, fight.start_time, fight.end_time)
                        .then(function(events) {

                            var parser = new Parser(fight, events);
                            parser.parse();

                            return parser.masteryStacks;
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
