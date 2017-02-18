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
                                            def.resolve(parser.result());
                                        }, 100);
                                    } catch (e) {
                                        // need short timeout for `debug` to flush
                                        setTimeout(function() {
                                            def.reject(e);
                                        }, 100);
                                    }

                                    return def.promise;
                                })
                                .then(function(result) {
                                    var masteryStacksTime = result.masteryStacksTime;
                                    var masteryStacksHealing = result.masteryStacksHealing;

                                    var renderMasteryStacksTable = function(masteryStacks, isTime) {
                                        var table = new Table({
                                            head: ['Stacks', (isTime ? 'time' : 'healing'), '%', 'cummul ' + (isTime ? 'time' : 'healing'), 'cummul %']
                                            , colWidths: [8, 15, 10, 15, 10]
                                        });

                                        masteryStacks.table.forEach(function(row) {
                                            if (isTime) {
                                                table.push([
                                                    row.stacks,
                                                    (row.value / 1000).toFixed(1) + "s", row.percentage.toFixed(1) + "%",
                                                    (row.cvalue / 1000).toFixed(1) + "s", row.cpercentage.toFixed(1) + "%"
                                                ]);
                                            } else {
                                                table.push([
                                                    row.stacks,
                                                    row.value.toFixed(0) + "", row.percentage.toFixed(1) + "%",
                                                    row.cvalue.toFixed(0) + "", row.cpercentage.toFixed(1) + "%"
                                                ]);
                                            }
                                        });

                                        console.log(table.toString());
                                        console.log("average HoTs on target: " + masteryStacks.avghots);
                                    };

                                    console.log("total rejuv ticks: " + result.rejuvTicks);
                                    console.log("total rejuv casts: " + result.rejuvCasts);
                                    console.log("total rejuv buffs: " + result.rejuvBuffs);
                                    console.log("magic rejuvs: " + result.magicRejuvs + " (" + ((result.magicRejuvs / result.rejuvTicks) * 100).toFixed(2) + "%)");
                                    console.log("4pc rejuvs: " + result.tier204pcRejuvs +
                                        " proc rate: " + ((result.tier204pcRejuvs || 0) / result.rejuvTicks * 100).toFixed(3) + "%" +
                                        " healing done: " + result.tier204pcHealing + " (" + ((result.tier204pcHealing / result.totalHealing) * 100).toFixed(2) + "%)" +
                                        " overhealing done: " + result.tier204pcOverhealing + " (" + ((result.tier204pcOverhealing / (result.tier204pcOverhealing + result.tier204pcHealing)) * 100).toFixed(2) + "%)");

                                    console.log("tearstone rejuvs: " + result.tearstoneRejuvs +
                                        " proc rate: " + (((result.tearstoneRejuvs || 0) / (result.wgCasts * 5)) * 100).toFixed(2) + "%" +
                                        " healing done: " + result.tearstoneHealing + " (" + ((result.tearstoneHealing / result.totalHealing) * 100).toFixed(2) + "%)" +
                                        " overhealing done: " + result.tearstoneOverhealing + " (" + ((result.tearstoneOverhealing / (result.tearstoneOverhealing + result.tearstoneHealing)) * 100).toFixed(2) + "%)");

                                    console.log("total healing done: " + result.totalHealing);
                                    console.log("PotA healing done: " + result.PotA.healing + " " + ((result.PotA.healing / result.totalHealing) * 100).toFixed(1) + "%");
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
