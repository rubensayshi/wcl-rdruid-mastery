var assert = require('assert');
var consts = require('./consts');

var _dbgroot = require('debug')('wclrdruidm:parser');
var _dbgchildren = {};
var dbg = function(k) {
    if (typeof k === "undefined") {
        return _dbgroot;
    }

    if (typeof _dbgchildren[k] === "undefined") {
        _dbgchildren[k] = require('debug')('wclrdruidm:parser:' + k);
    }

    return _dbgchildren[k];
};

var SPELLS = consts.SPELLS;
var BUFFS = consts.BUFFS;
var HOTS = consts.HOTS;
var MAX_HOTS = consts.MAX_HOTS;

var REPARSE = true;
var DEBUG = {
    _applyHot: false,
    _removeHot: false,
    source: false
};

var ReparseError = function(event) {
    var self = this;

    self.event = event;
};

var isNumeric = function(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
};

var Parser = function(fight, actorID, friendlies, events, ignoreFriendlies) {
    var self = this;

    self.fight = fight;
    self.actorID = actorID;
    self.friendlies = friendlies;
    self.ignoreFriendlies = ignoreFriendlies || [];

    self.ignoreFriendliesIDs = self.ignoreFriendlies.map(function(friendlyName) {
        var friendlyId = false;

        if (isNumeric(friendlyName)) {
            friendlyId = friendlyName;
        } else {
            friendlies.forEach(function(friendly) {
                if (friendly.name === friendlyName) {
                    friendlyId = friendly.id;
                }
            });
        }

        if (!friendlyId) {
            throw new Error("Could not find friendly on ignore [" + friendlyName + "]");
        }

        return friendlyId;
    });

    self.friendliesById = {};
    self.friendlies.forEach(function(friendly) {
        self.friendliesById[friendly.id] = friendly;
    });

    // do initial filtering of events we don't need
    self.events = events.filter(function(event) {
        // check if it's a buff event
        var isBuff = ['applybuff', 'removebuff', 'refreshbuff'].indexOf(event.type) !== -1;

        // check i its a heal
        var isHeal = ['heal'].indexOf(event.type) !== -1;

        // check i its a heal
        var isCast = ['cast'].indexOf(event.type) !== -1;


        // filter out events which source is not our own
        if (event.sourceID !== self.actorID) {
            return false;
        }

        // filter out event types we dont care about
        if (!isBuff && !isHeal && !isCast && ['combatantinfo'].indexOf(event.type) === -1) {
            return false;
        }

        if (isBuff) {
            // filter out buffs that aren't HoTs we care about
            if (HOTS.concat([BUFFS.POTA]).indexOf(event.ability.name) === -1) {
                return false;
            }

            // filter out blacklisted friendlies
            if (self.ignoreFriendliesIDs.indexOf(event.targetID) !== -1) {
                return false;
            }

            if (event.targetID && typeof self.friendliesById[event.targetID] === "undefined") {
                throw new Error("Unknown friendly [" + event.targetID + "]");
            }

            if (event.targetID && self.friendliesById[event.targetID].petOwner) {
                return false;
            }

            if (event.target && event.target.type === 'NPC') {
                return false;
            }
        }

        if (isHeal) {
            // filter out buffs that aren't HoTs we care about
            // if (HOTS.indexOf(event.ability.name) === -1) {
            //     return false;
            // }

            // filter out blacklisted friendlies
            if (self.ignoreFriendliesIDs.indexOf(event.targetID) !== -1) {
                return false;
            }

            if (event.targetID && typeof self.friendliesById[event.targetID] === "undefined") {
                throw new Error("Unknown friendly [" + event.targetID + "]");
            }

            if (event.targetID && self.friendliesById[event.targetID].petOwner) {
                return false;
            }

            if (event.target && event.target.type === 'NPC') {
                return false;
            }
        }

        if (isCast) {
            // filter out casts that are hostile
            if (HOTS.indexOf(event.ability.name) === -1) {
                return false;
            }
        }

        return true;
    });

    var combatantInfo = events.filter(function(event) {
        return event.type === 'combatantinfo';
    })[0];

    var tearstone = combatantInfo.gear.filter(function(item) {
        return item.id === consts.TEARSTONEID;
    });

    var tier20 = combatantInfo.gear.filter(function(item) {
        return consts.TIER20IDS.indexOf(item.id) !== -1;
    });

    self.tier204pc = tier20.length >= 4;
    self.tearstone = tearstone.length === 1;

    self.parsed = false;
    self.totalHealing = 0;
    self.totalOverhealing = 0;
    self.masteryStacksTime = {};
    self.masteryStacksHealing = {};
    self.lastCasts = {};
    self.lastWGCast = null;
    self.lastRejuvTick = null;
    self.rejuvCasts = 0;
    self.rejuvBuffs = 0;
    self.rejuvsClipped = 0;
    self.rejuvTicks = 0;
    self.magicRejuvs = 0;
    self.tearstoneHealing = 0;
    self.tearstoneOverhealing = 0;
    self.tearstoneRejuvs = 0;
    self.tier204pcHealing = 0;
    self.tier204pcOverhealing = 0;
    self.tier204pcRejuvs = 0;
    self.PotA = {
        cnt: 0,
        rejuvs: 0,
        regrowths: 0,
        healing: 0,
        ability: null,
        hots: []
    };
    self.targets = {};
};

Parser.HOTS = HOTS;
Parser.MAX_HOTS = MAX_HOTS;

Parser.prototype.friendlyName = function(friendlyID) {
    var self = this;

    if (typeof self.friendliesById[friendlyID] === "undefined") {
        return "Unknown [" + friendlyID + "]";
    }

    return self.friendliesById[friendlyID].name;
};

Parser.prototype._resetState = function() {
    var self = this;

    // total healing
    self.totalHealing = 0;
    self.totalOverhealing = 0;

    // this is where we sum up the total amount of healing done a target has X stacks
    self.masteryStacksHealing = {};
    for (var i = 1; i <= MAX_HOTS; i++) {
        self.masteryStacksHealing[i] = 0;
    }

    // this is where we sum up the total amount of time a target has X stacks
    self.masteryStacksTime = {};
    for (var i = 1; i <= MAX_HOTS; i++) {
        self.masteryStacksTime[i] = 0;
    }

    // tracking last cast of each spell
    self.lastCasts = {};
    self.lastWGCast = null;
    self.lastRejuvCast = null;
    self.lastRejuvTick = null;
    self.rejuvTicks = 0;
    self.rejuvBuffs = 0;
    self.rejuvsClipped = 0;
    self.rejuvCasts = 0;
    self.magicRejuvs = 0;
    self.tearstoneHealing = 0;
    self.tearstoneOverhealing = 0;
    self.tearstoneRejuvs = 0;
    self.tier204pcHealing = 0;
    self.tier204pcOverhealing = 0;
    self.tier204pcRejuvs = 0;

    // Power of the Archdruid
    self.PotA = {
        cnt: 0,
        rejuvs: 0,
        regrowths: 0,
        healing: 0,
        ability: null,
        targetID: null,
        hots: []
    };

    // tracking our targets
    self.targets = {};
};

Parser.prototype.result = function() {
    var self = this;

    return {
        tearstone: self.tearstone,
        tier204pc: self.tier204pc,

        masteryStacksHealing: Parser.masteryStacksResult(self.masteryStacksHealing),
        masteryStacksTime: Parser.masteryStacksResult(self.masteryStacksTime),

        totalHealing: self.totalHealing,
        totalOverhealing: self.totalOverhealing,

        rejuvTicks: self.rejuvTicks,
        rejuvBuffs: self.rejuvBuffs,
        rejuvsClipped: self.rejuvsClipped,
        rejuvCasts: self.rejuvCasts,
        magicRejuvs: self.magicRejuvs,
        tearstoneRejuvs: self.tearstoneRejuvs,
        tearstoneHealing: self.tearstoneHealing,
        tearstoneOverhealing: self.tearstoneOverhealing,
        tier204pcRejuvs: self.tier204pcRejuvs,
        tier204pcHealing: self.tier204pcHealing,
        tier204pcOverhealing: self.tier204pcOverhealing,
        PotA: {
            cnt: self.PotA.cnt,
            rejuvs: self.PotA.rejuvs,
            regrowths: self.PotA.regrowths,
            healing: self.PotA.healing
        }
    };
};

Parser.masteryStacksResult = function(masteryStacks) {
    var table = [];

    // sum up the total per stack
    var total = 0;
    for (var i = 1; i <= rdruidMastery.Parser.MAX_HOTS; i++) {
        total += masteryStacks[i];
    }

    // weighted (for avg HoTs calc)
    var avgsum = 0;
    // cummulative
    var cummul = 0;

    // loop from high to low
    for (var i = rdruidMastery.Parser.MAX_HOTS; i > 0; i--) {
        var stacks = i;
        var value = masteryStacks[stacks];

        // add to cummulative
        cummul += value;

        // add to weighted
        avgsum += (stacks * value);

        // don't start printing until we have something to print
        if (cummul > 0) {
            table.push({
                stacks: stacks,
                value: value,
                percentage: (value / total * 100),
                cvalue: (cummul / 1000),
                cpercentage: (cummul / total * 100)
            });
        }
    }

    return {
        avghots: avgsum / total,
        table: table
    };
};

Parser.prototype._ensureTargetExists = function(targetID) {
    var self = this;

    // ensure target exists
    if (typeof self.targets[targetID] === "undefined") {
        self.targets[targetID] = {
            hots: [],
            PotA: [],
            timeLastChange: self.fight.start_time
        };
    }
};

Parser.prototype.parse = function() {
    var self = this;

    if (self.parsed) {
        throw new Error("already parsed");
    }
    self.parsed = true;

    return self._parse();
};

Parser.prototype._parse = function(initialState) {
    var self = this;

    initialState = initialState || [];

    self._resetState();

    initialState.forEach(function(event) {
        assert(event.type === "removebuff");

        self._applyHoT(self.fight.start_time, event.targetID, event.ability);
    });

    try {
        self._parseEvents();
    } catch(e) {
        if (e instanceof ReparseError) {
            dbg("reparse")('!! REPARSE !! REPARSE !! REPARSE !!');
            dbg("reparse")('!! REPARSE !! REPARSE !! REPARSE !!');
            initialState.push(e.event);
            return self._parse(initialState);
        } else {
            throw e;
        }
    }
    self._endOfFight();
};

Parser.prototype._parseEvents = function() {
    var self = this;

    self.events.forEach(function(event) {
        self._parseEvent(event);
    });
};

Parser.prototype._endOfFight = function() {
    var self = this;
    
    // end of fight, expire any remaining HoTs
    Object.keys(self.targets).forEach(function(targetID) {
        if (self.targets[targetID].hots.length > 0) {
            var stacks = self.targets[targetID].hots.length;
            var time = self.fight.end_time - self.targets[targetID].timeLastChanged;

            self.masteryStacksTime[stacks] += time;
        }
    });
};

Parser.prototype._parseEvent = function(event) {
    var self = this;

    switch (event.type) {
        // talents, gear, etc
        //  will be useful when we want to display some extra info
        case 'combatantinfo':
            // dbg()(JSON.stringify(event, null, 4));
            break;

        // healz
        case 'heal':
            self._healEvent(event);
            break;

        // casts
        case 'cast':
            self._castEvent(event);
            break;

        // buff being applied
        case 'applybuff':
            self._applyBuffEvent(event);
            break;

        // buff expires
        case 'refreshbuff':
            self._refreshBuffEvent(event);
            break;

        // buff expires
        case 'removebuff':
            self._removeBuffEvent(event);
            break;

        default:
            console.log(JSON.stringify(event, null, 4));

            throw new Error();

            // if (!event.ability) {
            //     dbg()(JSON.stringify(event, null, 4));
            // } else {
            //     dbg()(event.type + " :: " + event.ability.name);
            // }

            break;
    }
};

Parser.prototype._healEvent = function(event) {
    var self = this;

    self._ensureTargetExists(event.targetID);

    // time since start of the fight
    var timesincefight = event.timestamp - self.fight.start_time;

    dbg('heal')((timesincefight / 1000) +
        " :: " + event.type +
        (DEBUG.source ? (" :: " + self.friendlyName(event.sourceID)) : "") +
        " :: " + self.friendlyName(event.targetID) +
        " :: " + event.ability.name +
        " :: " + event.ability.guid +
        " :: " + event.amount);

    // @TODO: should we use event.overheal ?

    // add total healing done
    self.totalHealing += event.amount;
    self.totalOverhealing += event.overheal || 0;

    if (self.targets[event.targetID].tearstoneRejuv && event.ability.name === SPELLS.REJUV) {
        self.tearstoneHealing += event.amount;
        self.tearstoneOverhealing += event.overheal || 0;
    }
    if (self.targets[event.targetID].tier204pcRejuv && event.ability.name === SPELLS.REJUV) {
        self.tier204pcHealing += event.amount;
        self.tier204pcOverhealing += event.overheal || 0;
    }

    // check how many stacks our current target has
    var stacks = self.targets[event.targetID].hots.length;

    // attribute healing done to stacks count
    self.masteryStacksHealing[stacks] += event.amount;

    if (event.ability.name === consts.SPELLS.REJUV || event.ability.name === consts.SPELLS.REJUV_GERM) {
        self.rejuvTicks += 1;
    }

    // @TODO: remove and refresh buff needs to remove this as well
    if (self.targets[event.targetID].PotA.filter(function(ability) { return ability.guid === event.ability.guid; }).length &&
        event.ability.name === consts.SPELLS.REJUV) {
        self.PotA.healing += event.amount;
    }
};

Parser.prototype._castEvent = function(event) {
    var self = this;

    self._ensureTargetExists(event.targetID);

    // time since start of the fight
    var timesincefight = event.timestamp - self.fight.start_time;

    dbg('cast')((timesincefight / 1000) +
        " :: " + event.type +
        " :: " + self.friendlyName(event.targetID) +
        " :: " + event.ability.name +
        " :: " + event.ability.guid);

    self.lastCasts[event.ability.name] = event;

    if (event.ability.name === SPELLS.WG) {
        self.lastWGCast = event;
        self.lastWGCast.hots = [];
    }
    if (event.ability.name === SPELLS.REJUV || event.ability.name === SPELLS.REJUV_GERM) {
        self.rejuvCasts += 1;
        self.lastRejuvCast = event;
        self.lastRejuvCast.hot = null;
    }

    if (self.PotA.cnt) {
        if (self.PotA.cnt && !self.PotA.ability && [SPELLS.REGROWTH, SPELLS.REJUV, SPELLS.REJUV_GERM].indexOf(event.ability.name) !== -1) {
            self.PotA.ability = event.ability;
            self.PotA.targetID = event.targetID;
        }
    }
};

Parser.prototype._applyBuffEvent = function(event) {
    var self = this;

    self._applyOrRefreshBuffEvent(event, /* isRefreshBuff= */ false);
};

Parser.prototype._refreshBuffEvent = function(event) {
    var self = this;

    self._applyOrRefreshBuffEvent(event, /* isRefreshBuff= */ true);
};

Parser.prototype._applyOrRefreshBuffEvent = function(event, isRefreshBuff) {
    var self = this;

    // time since start of the fight
    var timesincefight = event.timestamp - self.fight.start_time;

    if (event.ability.name === BUFFS.POTA) {
        dbg('talents:pota')((timesincefight / 1000) +
            " :: " + event.type +
            " :: PotA");
        return;
    }

    if (HOTS.indexOf(event.ability.name) === -1) {
        throw new Error("Unknown buff: " + event.ability.name);
    }

    self._ensureTargetExists(event.targetID);

    var dbgExtra = [];

    var fromPotA = false;
    if (self.PotA.cnt) {
        if (self.PotA.cnt && self.PotA.ability && self.PotA.ability.guid === event.ability.guid && self.PotA.targetID !== event.targetID) {
            // add HoT as PotA buff on target
            self.targets[event.targetID].PotA.push(event.ability);

            // consume 1 charge
            self.PotA.cnt--;

            if (event.ability.name === SPELLS.REGROWTH) {
                self.PotA.regrowths += 1;
            } else {
                self.PotA.rejuvs += 1;
            }

            fromPotA = true;

            dbgExtra.push('PotA');
        }
    }

    if (event.ability.name === SPELLS.WG) {
        // WG buff from lastWGCast
        if (event.timestamp - self.lastWGCast.timestamp < consts.WG_CAST_MARGIN) {
            dbg('legendary:tearstone')('WG HOTS ' + event.targetID);
            self.lastWGCast.hots.push(event);
        } else {
            dbg('warn')('WG OUT OF NOWHERE !?');
        }
    }

    var tearstoneRejuv = false;
    var tier204pcRejuv = false;

    if (event.ability.name === SPELLS.REJUV || event.ability.name === SPELLS.REJUV_GERM) {
        self.rejuvCasts += 1;
    }

    if ((event.ability.name === SPELLS.REJUV || event.ability.name === SPELLS.REJUV_GERM) && !fromPotA) {
        var fromRejuv = false;
        if (self.lastRejuvCast && !self.lastRejuvCast.hot && event.timestamp - self.lastRejuvCast.timestamp <= consts.REJUV_CAST_MARGIN) {
            fromRejuv = true;
            self.lastRejuvCast.hot = event;
        }

        if (!fromRejuv) {
            dbg('warn')('MAGIC REJUV:');

            if (self.tearstone && self.lastWGCast && event.timestamp - self.lastWGCast.timestamp < consts.TEARSTONE_MARGIN) {
                var wasTargetOfWG = self.lastWGCast.hots.map(function (event) {
                        return event.targetID;
                    }).indexOf(event.targetID) !== -1;

                if (wasTargetOfWG) {
                    if (event.timestamp !== self.lastWGCast.timestamp) {
                        dbg('legendary:tearstone:warn')('TEARSTONE NOT INSTANT!? diff=' + (event.timestamp - self.lastWGCast.timestamp));
                    }

                    dbgExtra.push('tearstone');
                    tearstoneRejuv = true;
                    self.tearstoneRejuvs += 1;
                } else {
                    dbg('legendary:tearstone:warn')('TEARSTONE NOT ON WG TARGET!?');
                }
            } else if (self.tier204pc) {
                dbg('warn')('REJUV OUT OF NOWHERE!? 4pc');
                self.tier204pcRejuvs += 1;
                tier204pcRejuv = true;
            } else {
                dbg('warn')('REJUV OUT OF NOWHERE!? NO 4PC!?');
                self.magicRejuvs += 1;
            }
        }
    }

    dbg(event.type)([
        (timesincefight / 1000),
        event.type,
        (DEBUG.source ? (self.friendlyName(event.sourceID)) : null),
        self.friendlyName(event.targetID),
        event.ability.name,
        event.ability.guid]
        .concat(dbgExtra)
        .filter(function(v) { return !!v; })
        .join(" :: "));

    // when it's a fresh bfuf
    if (!isRefreshBuff) {
        // sanity check that we don't track the same buff twice
        //  if this triggers it means we have a bug xD
        var idx = null;
        self.targets[event.targetID].hots.forEach(function (_ability, _idx) {
            if (_ability.guid === event.ability.guid) {
                idx = _idx;
            }
        });
        if (idx !== null) {
            throw new Error("applybuff: " + self.friendlyName(event.targetID) + " already has " + event.ability.name + " (" + event.ability.guid + ") buff");
        }

        // if there were any HoTs on the target before this HoT was applied
        //  then we attribute the time since the previous HoT was applied / expired to the stack count
        if (self.targets[event.targetID].hots.length > 0) {
            var stacks = self.targets[event.targetID].hots.length;
            var time = event.timestamp - self.targets[event.targetID].timeLastChanged;

            self.masteryStacksTime[stacks] += time;
        }
    }

    // @TODO: germ
    self.targets[event.targetID].tearstoneRejuv = tearstoneRejuv;
    self.targets[event.targetID].tier204pcRejuv = tier204pcRejuv;

    // if it's a new buff apply it, otherwise it's already there
    if (!isRefreshBuff) {
        // then add our new HoT to the target
        self._applyHoT(event.timestamp, event.targetID, event.ability);
    }
};

Parser.prototype._applyHoT = function(timestamp, targetID, ability) {
    var self = this;

    self._ensureTargetExists(targetID);

    // time since start of the fight
    var timesincefight = timestamp - self.fight.start_time;

    dbg('applyhot')((timesincefight / 1000) + " :: applyHoT :: " + self.friendlyName(targetID) + " :: " + ability.name + " :: " + ability.guid);

    // then add our new HoT to the target
    self.targets[targetID].timeLastChanged = timestamp;
    self.targets[targetID].hots.push(ability);
};

Parser.prototype._removeBuffEvent = function(event) {
    var self = this;

    // time since start of the fight
    var timesincefight = event.timestamp - self.fight.start_time;

    if (event.ability.name === BUFFS.POTA) {
        dbg('talents:pota')((timesincefight / 1000) +
            " :: " + event.type +
            " :: PotA");
        self.PotA.cnt = 2; // set counter to 2, next 2 rejuv/regrowths are PotA
        self.PotA.hots = []; // will be set by the next cast
        self.PotA.ability = null; // will be set by the next cast
        self.PotA.targetID = null; // will be set by the next cast
        return;
    }

    if (HOTS.indexOf(event.ability.name) === -1) {
        throw new Error("Unknown buff: " + event.ability.name);
    }

    self._ensureTargetExists(event.targetID);

    dbg('removebuff')((timesincefight / 1000) +
        " :: " + event.type +
        (DEBUG.source ? (" :: " + self.friendlyName(event.sourceID)) : "") +
        " :: " + self.friendlyName(event.targetID) +
        " :: " + event.ability.name +
        " :: " + event.ability.guid);

    // find matching PotA HoT on target
    var idxPotA = null;
    self.targets[event.targetID].PotA.forEach(function(_ability, _idx) {
        if (_ability.guid === event.ability.guid) {
            idxPotA = _idx;
        }
    });

    // remove PotA HoT
    if (idxPotA !== null) {
        delete self.targets[event.targetID].PotA[idxPotA];
    }

    // find matching HoT on target
    var idx = null;
    self.targets[event.targetID].hots.forEach(function(_ability, _idx) {
        if (_ability.guid === event.ability.guid) {
            idx = _idx;
        }
    });

    // sanity check that we were tracking the expiring buff
    //  if this triggers it means we have a bug xD
    if (idx === null) {
        // if enabled we throw ReparseError so that we can parse again,
        //  but then having this HoT already on the target (from pre-HoTs)
        if (REPARSE) {
            throw new ReparseError(event);
        }

        throw new Error("removebuff: " + self.friendlyName(event.targetID) + " does not have " + event.ability.name + " buff (" + event.ability.guid + ")");
    } else {
        // attribute the time since the previous HoT was applied / expired to the stack count
        var stacks = self.targets[event.targetID].hots.length;
        var time = event.timestamp - self.targets[event.targetID].timeLastChanged;

        self.masteryStacksTime[stacks] += time;

        self._removeHoT(event.timestamp, event.targetID, event.ability, idx);
    }
};

Parser.prototype._removeHoT = function(timestamp, targetID, ability, idx) {
    var self = this;

    self._ensureTargetExists(targetID);

    // time since start of the fight
    var timesincefight = timestamp - self.fight.start_time;

    dbg('removehot')((timesincefight / 1000) +
        " :: removeHoT" +
        " :: " + self.friendlyName(targetID) +
        " :: " + ability.name +
        " :: " + ability.guid);

    idx = typeof idx !== "undefined" ? idx : null;
    self.targets[targetID].hots.forEach(function(_ability, _idx) {
        if (_ability.guid === ability.guid) {
            idx = _idx;
        }
    });

    if (idx === null) {
        throw new Error("Can't remove HoT");
    }

    // then add our new HoT to the target
    self.targets[targetID].timeLastChanged = timestamp;
    self.targets[targetID].hots.splice(idx, 1);
};

module.exports = exports = Parser;
