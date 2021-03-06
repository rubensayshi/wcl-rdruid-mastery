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
var BLIND_REPARSE_WINDOW = 30; // after this it requires a heal tick to trigger a reparse
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

        // ignore all pets
        if (event.targetID && self.friendlyIsPet(event.targetID)) {
            return false;
        }

        // ignore death events of enemies
        if (!event.targetIsFriendly && ['death', 'resurrect'].indexOf(event.type) !== -1) {
            return false;
        }

        // filter out events which source is not our own
        // if (event.sourceID !== self.actorID) {
        //     return false;
        // }

        // filter out event types we dont care about
        // if (!isBuff && !isHeal && !isCast && ['combatantinfo'].indexOf(event.type) === -1) {
        //     return false;
        // }

        if (isBuff) {
            // filter out events which source is not our own
            if (event.sourceID !== self.actorID) {
                return false;
            }

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

            if (event.target && event.target.type === 'NPC') {
                return false;
            }
        }

        if (isHeal) {
            // filter out events which source is not our own
            if (event.sourceID !== self.actorID) {
                return false;
            }

            // filter out blacklisted friendlies
            if (self.ignoreFriendliesIDs.indexOf(event.targetID) !== -1) {
                return false;
            }

            if (event.targetID && typeof self.friendliesById[event.targetID] === "undefined") {
                throw new Error("Unknown friendly [" + event.targetID + "]");
            }

            if (event.target && event.target.type === 'NPC') {
                return false;
            }
        }

        if (isCast) {
            // filter out events which source is not our own
            if (event.sourceID !== self.actorID) {
                return false;
            }

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

    self.combatantInfo = combatantInfo;
    var talentIDs = combatantInfo.talents.map(function(talent) {
        return talent.id;
    });
    self.talents = {
        // 15
        PROSP: false,
        CW: false,
        ABUNDANCE: false,
        // 75
        SOTF: false,
        TOL: false,
        CULTI: false,
        // 90
        SB: false,
        IP: false,
        GERM: false,
        // 100
        FLOURISH: false
    };
    Object.keys(self.talents).forEach(function(talent) {
        var talentID = consts.TALENTS[talent];

        self.talents[talent] = talentIDs.indexOf(talentID) !== -1;
    });

    self.masteryRating = combatantInfo.mastery;

    var gearIDs = combatantInfo.gear.map(function(item) { return item.id; });

    var tier19 = gearIDs.filter(function(itemID) {
        return consts.TIER19IDS.indexOf(itemID) !== -1;
    });

    self.tier192pc = tier19.length >= 2;
    self.tier194pc = tier19.length >= 4;
    self.tearstone = gearIDs.indexOf(consts.TEARSTONEID) !== -1;
    self.legshoulders = gearIDs.indexOf(consts.LEGSHOULDERSID) !== -1;

    self.parsed = false;
    self.totalHealing = 0;
    self.totalOverhealing = 0;
    self.masteryStacksTime = {};
    self.masteryStacksHealing = {};
    self.masteryStacksHealingPerHoT = {};
    self.healingPerSpell = {};
    self.lastCasts = {};
    self.lastWGCast = null;
    self.lastRejuvTick = null;
    self.wgCasts = 0;
    self.rejuvCasts = 0;
    self.rejuvBuffs = 0;
    self.rejuvsClipped = 0;
    self.rejuvTicks = 0;
    self.magicRejuvs = 0;
    self.tearstoneHealing = 0;
    self.tearstoneOverhealing = 0;
    self.tearstoneRejuvs = 0;
    self.tier194pcHealing = 0;
    self.tier194pcOverhealing = 0;
    self.tier194pcRejuvs = 0;
    self.fullOverhealRejuvTicks = 0;
    self.legshouldersTicks = 0;
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

Parser.prototype.masteryPercentage = function() {
    var self = this;

    // @TODO: would be much nicer if this was "live"
    var tier192pcRating = 0;
    if (self.tier192pc) {
        tier192pcRating = (4000 / consts.STAT_RATINGS.MASTERY / 100) * consts.TIER19_2PC_UPTIME;
    }

    return consts.BASE_MASTERY + Parser.masteryPercentageFromRating(self.masteryRating) + tier192pcRating;
};

/**
 * rating -> percentage (excl base amount)
 * @param rating
 * @returns {number}
 */
Parser.masteryPercentageFromRating = function(rating) {
    var self = this;

    return (rating / consts.STAT_RATINGS.MASTERY / 100);
};

Parser.prototype.friendlyName = function(friendlyID) {
    var self = this;

    if (typeof self.friendliesById[friendlyID] === "undefined") {
        return "Unknown [" + friendlyID + "]";
    }

    return self.friendliesById[friendlyID].name;
};

Parser.prototype.friendlyIsPet = function(friendlyID) {
    var self = this;

    if (typeof self.friendliesById[friendlyID] === "undefined") {
        return false;
    }

    return !!self.friendliesById[friendlyID].petOwner || self.friendliesById[friendlyID].type === 'pet';
};

Parser.prototype._resetState = function() {
    var self = this;

    // total healing
    self.totalHealing = 0;
    self.totalOverhealing = 0;

    // this is where we sum up the total amount of healing done a target has X stacks
    self.masteryStacksHealing = {};
    for (var i = 0; i <= MAX_HOTS; i++) {
        self.masteryStacksHealing[i] = 0;
    }

    // this is where we sum up the total amount of time a target has X stacks
    self.masteryStacksTime = {};
    for (var i = 1; i <= MAX_HOTS; i++) {
        self.masteryStacksTime[i] = 0;
    }

    // this is where we sum up the total amount of time a target has X stacks
    self.masteryStacksHealingPerHoT = {};
    HOTS.forEach(function(hot) {
        self.masteryStacksHealingPerHoT[hot] = 0;
    });

    self.healingPerSpell = {};

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
    self.tier194pcHealing = 0;
    self.tier194pcOverhealing = 0;
    self.tier194pcRejuvs = 0;
    self.fullOverhealRejuvTicks = 0;
    self.legshouldersTicks = 0;

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

    var shallowClone = function(obj) {
        var newObj = {};

        Object.keys(obj).forEach(function(key) {
            newObj[key] = obj[key];
        });

        return newObj;
    };

    var healingFromSBMastery = parseInt(self.masteryStacksHealingPerHoT[SPELLS.SB].toFixed(0), 10);

    var result = {
        combatantInfo: self.combatantInfo,
        gearIDs: self.gearIDs,
        talents: self.talents,

        tearstone: self.tearstone,
        tier194pc: self.tier194pc,
        legshoulders: self.legshoulders,

        masteryStacksHealingRaw: shallowClone(self.masteryStacksHealing),
        masteryStacksTimeRaw: shallowClone(self.masteryStacksTime),
        masteryStacksHealingPerHoTRaw: shallowClone(self.masteryStacksHealingPerHoT),

        masteryStacksHealing: Parser.masteryStacksResult(self.masteryStacksHealing, 0),
        masteryStacksTime: Parser.masteryStacksResult(self.masteryStacksTime, 1),

        healingFromSBMastery: healingFromSBMastery,

        totalHealing: self.totalHealing,
        totalOverhealing: self.totalOverhealing,
        healingPerSpell: self.healingPerSpell,

        wgCasts: self.wgCasts,
        rejuvTicks: self.rejuvTicks,
        rejuvBuffs: self.rejuvBuffs,
        rejuvsClipped: self.rejuvsClipped,
        rejuvCasts: self.rejuvCasts,
        magicRejuvs: self.magicRejuvs,
        tearstoneRejuvs: self.tearstoneRejuvs,
        tearstoneHealing: self.tearstoneHealing,
        tearstoneOverhealing: self.tearstoneOverhealing,
        tier194pcRejuvs: self.tier194pcRejuvs,
        tier194pcHealing: self.tier194pcHealing,
        tier194pcOverhealing: self.tier194pcOverhealing,
        fullOverhealRejuvTicks: self.fullOverhealRejuvTicks,
        legshouldersTicks: self.legshouldersTicks,
        PotA: {
            cnt: self.PotA.cnt,
            rejuvs: self.PotA.rejuvs,
            regrowths: self.PotA.regrowths,
            healing: self.PotA.healing
        }
    };

    return result;
};

Parser.masteryStacksResult = function(masteryStacks, minHots) {
    var table = [];

    // sum up the total per stack
    var total = 0;
    for (var i = minHots; i <= consts.MAX_HOTS; i++) {
        total += masteryStacks[i];
    }

    // weighted (for avg HoTs calc)
    var avgsum = 0;
    // cummulative
    var cummul = 0;

    // loop from high to low
    for (var i = consts.MAX_HOTS; i >= minHots; i--) {
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
                cvalue: cummul,
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
            hotsFirstTick: {},
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
        assert(event.type === "removebuff" || event.type === "refreshbuff");

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

        case 'death':
            self._deathEvent(event);
            break;

        // healz
        case 'resurrect':
            self._ressEvent(event);
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
            // console.log(JSON.stringify(event, null, 4));
            throw new Error("Unknown event [" + event.type + "]");

            break;
    }
};

Parser.prototype._deathEvent = function(event) {
    var self = this;

    self._ensureTargetExists(event.targetID);

    // time since start of the fight
    var timesincefight = event.timestamp - self.fight.start_time;

    if (self.friendlyIsPet(event.targetID)) {
        return;
    }

    dbg('death')((timesincefight / 1000) +
        " :: " + event.type +
        " :: " + self.friendlyName(event.targetID));

    // remove all HoTs
    // @TODO: shouldn't be neccesary, should let it very HoTs are removed properly
    // self.targets[event.targetID].hots.slice().forEach(function(ability) {
    //     var idx = self.targets[event.targetID].hots.indexOf(ability);
    //
    //     // attribute the time since the previous HoT was applied / expired to the stack count
    //     var stacks = self.targets[event.targetID].hots.length;
    //     var time = event.timestamp - self.targets[event.targetID].timeLastChanged;
    //
    //     self.masteryStacksTime[stacks] += time;
    //
    //     self._removeHoT(event.timestamp, event.targetID, ability, idx);
    // });

    self.targets[event.targetID].tearstoneRejuv = false;
    self.targets[event.targetID].tier194pcRejuv = false;
    self.targets[event.targetID].PotA = [];
};

Parser.prototype._ressEvent = function(event) {
    var self = this;

    self._ensureTargetExists(event.targetID);

    // time since start of the fight
    var timesincefight = event.timestamp - self.fight.start_time;

    dbg('ress')((timesincefight / 1000) +
        " :: " + event.type +
        " :: " + self.friendlyName(event.targetID));
};

Parser.prototype._healEvent = function(event) {
    var self = this;

    self._ensureTargetExists(event.targetID);

    var target = self.targets[event.targetID];

    // time since start of the fight
    var timesincefight = event.timestamp - self.fight.start_time;

    var isTearstoneRejuv = self.targets[event.targetID].tearstoneRejuv === event.ability.name;
    var isTier194pcRejuv = self.targets[event.targetID].tier194pcRejuv === event.ability.name;

    dbg('heal')((timesincefight / 1000) +
        " :: " + event.type +
        (DEBUG.source ? (" :: " + self.friendlyName(event.sourceID)) : "") +
        " :: " + self.friendlyName(event.targetID) +
        " :: " + event.ability.name +
        " :: " + event.ability.guid +
        " :: " + event.amount +
        (isTearstoneRejuv ? " :: tearstone " : "") +
        (isTier194pcRejuv ? " :: 4pc " : ""));

    if (event.ability.name === SPELLS.REJUV && event.overheal && event.amount === 0) {
        self.fullOverhealRejuvTicks += 1;

        // legendary shoulders
        if (self.legshoulders && target.legshouldersBonusTicks <= 5) {
            dbg('legendary:shoulders')('+3s bonus rejuv');
            target.legshouldersBonusTicks += 1;
            self.legshouldersTicks += 1;
        }
    }

    if (HOTS.indexOf(event.ability.name) !== -1 && typeof target.hotsFirstTick[event.ability.name] === "undefined") {
        target.hotsFirstTick[event.ability.name] = event.timestamp;
    }

    // add total healing done
    self.totalHealing += event.amount;
    self.totalOverhealing += event.overheal || 0;

    if (typeof self.healingPerSpell[event.ability.name] === "undefined") {
        self.healingPerSpell[event.ability.name] = 0;
    }

    self.healingPerSpell[event.ability.name] += event.amount;

    if (isTearstoneRejuv) {
        self.tearstoneHealing += event.amount;
        self.tearstoneOverhealing += event.overheal || 0;
    }
    if (isTier194pcRejuv) {
        self.tier194pcHealing += event.amount;
        self.tier194pcOverhealing += event.overheal || 0;
    }

    // check how many stacks our current target has
    var stacks = target.hots.length;

    var unmasteryHealing = event.amount / (1 + self.masteryPercentage() * stacks);
    var masteryHealing = event.amount - unmasteryHealing;
    var masteryHealingPerStack = masteryHealing / stacks;

    // attribute pre-mastery healing done to stacks count
    self.masteryStacksHealing[stacks] += unmasteryHealing;

    // attribute the healing bonus from mastery to each HoT
    target.hots.forEach(function (_ability, _idx) {
        if (event.ability.name !== _ability.name) {
            self.masteryStacksHealingPerHoT[_ability.name] += masteryHealingPerStack;
        }
    });

    if (event.ability.name === consts.SPELLS.REJUV || event.ability.name === consts.SPELLS.REJUV_GERM) {
        self.rejuvTicks += 1;
    }

    // @TODO: remove and refresh buff needs to remove this as well
    if (target.PotA.filter(function(ability) { return ability.guid === event.ability.guid; }).length &&
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
        self.wgCasts += 1;
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

    var target = self.targets[event.targetID];

    // reset legendary shoulder counter
    target.legshouldersBonusTicks = 0;

    var dbgExtra = [];

    // remove PotA attribution
    self.removePotA(event.targetID, event.ability.guid);

    var fromPotA = false;
    if (self.PotA.cnt) {
        if (self.PotA.cnt && self.PotA.ability && self.PotA.ability.guid === event.ability.guid && self.PotA.targetID !== event.targetID) {
            // add HoT as PotA buff on target
            target.PotA.push(event.ability);

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
        if (self.lastWGCast && event.timestamp - self.lastWGCast.timestamp < consts.WG_CAST_MARGIN) {
            self.lastWGCast.hots.push(event);
            if (self.tearstone) {
                dbg('legendary:tearstone')('WG HOTS ' + event.targetID);
            }
        } else {
            dbg('warn')('WG OUT OF NOWHERE !?');
        }
    }

    var tearstoneRejuv = false;
    var tier194pcRejuv = false;

    if (event.ability.name === SPELLS.REJUV || event.ability.name === SPELLS.REJUV_GERM) {
        self.rejuvBuffs += 1;
    }

    if ((event.ability.name === SPELLS.REJUV || event.ability.name === SPELLS.REJUV_GERM) && !fromPotA) {
        var fromRejuv = false;
        if (self.lastRejuvCast && !self.lastRejuvCast.hot &&
            self.lastRejuvCast.targetID === event.targetID &&
            event.timestamp - self.lastRejuvCast.timestamp <= consts.REJUV_CAST_MARGIN) {
            fromRejuv = true;
            self.lastRejuvCast.hot = event;
            dbgExtra.push('casted');
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
                    tearstoneRejuv = event.ability.name;
                    self.tearstoneRejuvs += 1;
                } else {
                    dbg('legendary:tearstone:warn')('TEARSTONE NOT ON WG TARGET!?');
                }
            } else if (self.tier194pc) {
                dbg('warn')('rejuv from 4pc');
                self.tier194pcRejuvs += 1;
                dbgExtra.push('4pc');
                tier194pcRejuv = event.ability.name;
            } else {
                dbg('warn')('REJUV OUT OF NOWHERE!?');
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

    // sanity check that we don't track the same buff twice
    //  if this triggers it means we have a bug xD
    var idx = null;
    target.hots.forEach(function (_ability, _idx) {
        if (_ability.guid === event.ability.guid) {
            idx = _idx;
        }
    });

    // reparse if we're refreshing a buff that isn't there
    if (idx === null && isRefreshBuff) {
        // either needs a tick or still in BLIND_REPARSE_WINDOW
        if (target.hotsFirstTick[event.ability.name] || timesincefight < BLIND_REPARSE_WINDOW * 1000) {
            throw new ReparseError(event);
        } else {
            throw new Error("refreshbuff: " + self.friendlyName(event.targetID) + " doesn't have " + event.ability.name + " (" + event.ability.guid + ") buff");
        }
    }

    if (!isRefreshBuff) {
        if (idx !== null) {
            throw new Error("applybuff: " + self.friendlyName(event.targetID) + " already has " + event.ability.name + " (" + event.ability.guid + ") buff");
        }

        // if there were any HoTs on the target before this HoT was applied
        //  then we attribute the time since the previous HoT was applied / expired to the stack count
        if (target.hots.length > 0) {
            var stacks = target.hots.length;
            var time = event.timestamp - target.timeLastChanged;

            self.masteryStacksTime[stacks] += time;
        }

        // then add our new HoT to the target
        self._applyHoT(event.timestamp, event.targetID, event.ability);
    }

    if (event.ability.name === SPELLS.REJUV || event.ability.name === SPELLS.REJUV_GERM) {
        if (tearstoneRejuv) {
            target.tearstoneRejuv = tearstoneRejuv;
        } else if (!tearstoneRejuv && target.tearstoneRejuv === event.ability.name) {
            target.tearstoneRejuv = false;
        }
        if (tier194pcRejuv) {
            target.tier194pcRejuv = tier194pcRejuv;
        } else if (!tier194pcRejuv && target.tier194pcRejuv === event.ability.name) {
            target.tier194pcRejuv = false;
        }
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

Parser.prototype.removePotA = function(targetID, guid) {
    var self = this;

    // find matching PotA HoT on target
    var idxPotA = null;
    self.targets[targetID].PotA.forEach(function(_ability, _idx) {
        if (_ability.guid === guid) {
            idxPotA = _idx;
        }
    });

    // remove PotA HoT
    if (idxPotA !== null) {
        delete self.targets[targetID].PotA[idxPotA];
    }
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

    // remove PotA attribution
    self.removePotA(event.targetID, event.ability.guid);

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
            // either needs a tick or still in BLIND_REPARSE_WINDOW
            if (self.targets[event.targetID].hotsFirstTick[event.ability.name] || timesincefight < BLIND_REPARSE_WINDOW * 1000) {
                throw new ReparseError(event);
            }
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

    self.targets[targetID].timeLastChanged = timestamp;
    self.targets[targetID].hots.splice(idx, 1);
};

module.exports = exports = Parser;
