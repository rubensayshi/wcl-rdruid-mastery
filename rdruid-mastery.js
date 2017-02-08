var assert = require('assert');
var Table = require('cli-table');
var leveldb = require('level-browserify');
var q = require('q');

var rdruidMastery = require('./');

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

                            var s = fight.start_time;
                            var e = fight.end_time;

                            // s = s + (170 * 1000);
                            // e = s + (190 * 1000);

                            return wclapi.getEvents(REPORT, actorID, s, e)
                                .then(function(events) {

                                    var def = q.defer();

                                    try {
                                        var parser = new rdruidMastery.Parser(fight, actorID, friendlies, events, IGNORE);
                                        console.log('start: ' + parser.fight.start_time);
                                        parser.parse();

                                        // need short timeout for `debug` to flush
                                        setTimeout(function() {
                                            def.resolve(parser);
                                        }, 100);
                                    } catch (e) {
                                        // need short timeout for `debug` to flush
                                        setTimeout(function() {
                                            def.reject(e);
                                        }, 100);
                                    }

                                    return def.promise;
                                })
                                .then(function(parser) {
                                    var masteryStacksTime = parser.masteryStacksTime;
                                    var masteryStacksHealing = parser.masteryStacksHealing;

                                    var renderMasteryStacksTable = function(masteryStacks, isTime) {
                                        var table = new Table({
                                            head: ['Stacks', isTime ? 'time' : 'healing', '%', 'cummul time', 'cummul %']
                                            , colWidths: [8, 10, 10, 10, 10]
                                        });

                                        // sum up the total value
                                        var total = 0;
                                        for (var i = (isTime ? 1 : 0); i <= rdruidMastery.Parser.MAX_HOTS; i++) {
                                            total += masteryStacks[i];
                                        }

                                        // weighted (for avg HoTs calc)
                                        var avgsum = 0;
                                        // cummulative
                                        var cummul = 0;

                                        // loop from high to low
                                        for (var i = rdruidMastery.Parser.MAX_HOTS; i >= (isTime ? 1 : 0); i--) {
                                            var stacks = i;
                                            var value = masteryStacks[stacks];

                                            // add time to cummulative
                                            cummul += value;

                                            // add time to weighted
                                            avgsum += (stacks * value);

                                            // don't start printing until we have something to print
                                            if (cummul > 0) {
                                                if (isTime) {
                                                    table.push([
                                                        stacks,
                                                        (value / 1000).toFixed(1) + "s", ((value / total) * 100).toFixed(1) + "%",
                                                        (cummul / 1000).toFixed(1) + "s", ((cummul / total) * 100).toFixed(1) + "%"
                                                    ]);
                                                } else {
                                                    table.push([
                                                        stacks,
                                                        value.toFixed(0) + "", ((value / total) * 100).toFixed(1) + "%",
                                                        cummul.toFixed(0) + "", ((cummul / total) * 100).toFixed(1) + "%"
                                                    ]);
                                                }
                                            }
                                        }

                                        console.log(table.toString());
                                        console.log("average HoTs on target: " + (avgsum / total));
                                    };

                                    console.log("total rejuv ticks: " + parser.rejuvTicks);
                                    console.log("magic rejuvs: " + parser.magicRejuvs + " (" + ((parser.magicRejuvs / parser.rejuvTicks) * 100).toFixed(2) + "%)");
                                    console.log("4pc healing done: " + parser.tier204pcHealing + " (" + ((parser.tier204pcHealing / parser.totalHealing) * 100).toFixed(2) + "%)");

                                    console.log("tearstone healing done: " + parser.tearstoneHealing + " (" + ((parser.tearstoneHealing / parser.totalHealing) * 100).toFixed(2) + "%)");

                                    console.log("total healing done: " + parser.totalHealing);
                                    console.log("PotA healing done: " + parser.PotA.healing + " " + ((parser.PotA.healing / parser.totalHealing) * 100).toFixed(1) + "%");
                                    renderMasteryStacksTable(masteryStacksTime, true);
                                    renderMasteryStacksTable(masteryStacksHealing, false);
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
