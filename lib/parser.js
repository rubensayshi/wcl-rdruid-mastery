var assert = require('assert');
var dbg = require('debug')('wclrdruidm:parser');

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
var MAX_HOTS = 7;
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

var Parser = function(fight, actorID, friendlies, events, ignoreFriendlies) {
    var self = this;

    self.fight = fight;
    self.actorID = actorID;
    self.friendlies = friendlies;
    self.ignoreFriendlies = ignoreFriendlies || [];

    self.ignoreFriendliesIDs = self.ignoreFriendlies.map(function(friendlyName) {
        var friendlyId = false;
        friendlies.forEach(function(friendly) {
            if (friendly.name === friendlyName) {
                friendlyId = friendly.id;
            }
        });

        if (!friendlyId) {
            throw new Error("Could not find friendly on ignore [" + friendlyName + "]");
        }

        return friendlyId;
    });

    self.friendliesById = {};
    self.friendlies.forEach(function(friendly) {
        self.friendliesById[friendly.id] = friendly;
    });

    // filter out events we don't need
    self.events = events.filter(function(event) {
        // filter out blacklisted friendlies
        if (self.ignoreFriendliesIDs.indexOf(event.targetID) !== -1) {
            return false;
        }

        // check if it's a buff event
        var isBuff = ['applybuff', 'removebuff'].indexOf(event.type) !== -1;

        // filter out event types we dont care about
        if (!isBuff && ['combatantinfo'].indexOf(event.type) === -1) {
            return false;
        }

        // filter out buffs that aren't HoTs we care about
        if (isBuff && HOTS.indexOf(event.ability.name) === -1) {
            return false;
        }

        // filter out events which source is not our own
        if (event.sourceID !== self.actorID) {
            return false;
        }

        if (event.targetID && typeof self.friendliesById[event.targetID] === "undefined") {
            throw new Error("Unknown friendly [" + event.targetID + "]");
        }

        if (event.targetID && self.friendliesById[event.targetID].petOwner) {
            return false;
        }

        return true;
    });

    self.parsed = false;
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

    // this is where we sum up the total amount of time a target has X stacks
    self.masteryStacks = {};
    for (var i = 1; i <= MAX_HOTS; i++) {
        self.masteryStacks[i] = 0;
    }

    // tracking our targets
    self.targets = {};
};

Parser.prototype._ensureTargetExists = function(targetID) {
    var self = this;

    // ensure target exists
    if (typeof self.targets[targetID] === "undefined") {
        self.targets[targetID] = {
            hots: [],
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
            dbg('!! REPARSE !! REPARSE !! REPARSE !!');
            dbg('!! REPARSE !! REPARSE !! REPARSE !!');
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
    for (var targetID in self.targets) {
        if (self.targets[targetID].hots.length > 0) {
            var stacks = self.targets[targetID].hots.length;
            var time = self.fight.end_time - self.targets[targetID].timeLastChanged;

            self.masteryStacks[stacks] += time;
        }
    }
};

Parser.prototype._parseEvent = function(event) {
    var self = this;

    switch (event.type) {
        // talents, gear, etc
        //  will be useful when we want to display some extra info
        case 'combatantinfo':
            // dbg(JSON.stringify(event, null, 4));
            break;

        // buff being applied
        case 'applybuff':
            self._applyBuffEvent(event);
            break;

        // buff expires
        case 'removebuff':
            self._removeBuffEvent(event);
            break;

        default:
            dbg(JSON.stringify(event, null, 4));

            // if (!event.ability) {
            //     dbg(JSON.stringify(event, null, 4));
            // } else {
            //     dbg(event.type + " :: " + event.ability.name);
            // }

            break;
    }
};

Parser.prototype._applyBuffEvent = function(event) {
    var self = this;

    self._ensureTargetExists(event.targetID);

    // time since start of the fight
    var timesincefight = event.timestamp - self.fight.start_time;

    dbg((timesincefight / 1000) + " :: " + event.type + (DEBUG.source ? (" :: " + self.friendlyName(event.sourceID)) : "") + " :: " + self.friendlyName(event.targetID) + " :: " + event.ability.name + " :: " + event.ability.guid);

    // sanity check that we don't track the same buff twice
    //  if this triggers it means we have a bug xD
    var idx = null;
    self.targets[event.targetID].hots.forEach(function(_ability, _idx) {
        if (_ability.guid === event.ability.guid) {
            idx = _idx;
        }
    });
    if (idx !== null) {
        throw new Error("applybuff: " + self.friendlyName(event.targetID) + " already has " + event.ability.name + " buff");
    }

    // if there were any HoTs on the target before this HoT was applied
    //  then we attribute the time since the previous HoT was applied / expired to the stack count
    if (self.targets[event.targetID].hots.length > 0) {
        var stacks = self.targets[event.targetID].hots.length;
        var time = event.timestamp - self.targets[event.targetID].timeLastChanged;

        self.masteryStacks[stacks] += time;
    }

    // then add our new HoT to the target
    self._applyHoT(event.timestamp, event.targetID, event.ability);
};

Parser.prototype._applyHoT = function(timestamp, targetID, ability) {
    var self = this;

    self._ensureTargetExists(targetID);

    // time since start of the fight
    var timesincefight = timestamp - self.fight.start_time;

    if (DEBUG._applyHot) {
        dbg((timesincefight / 1000) + " :: applyHoT :: " + self.friendlyName(targetID) + " :: " + ability.name + " :: " + ability.guid);
    }

    // then add our new HoT to the target
    self.targets[targetID].timeLastChanged = timestamp;
    self.targets[targetID].hots.push(ability);
};

Parser.prototype._removeBuffEvent = function(event) {
    var self = this;

    self._ensureTargetExists(event.targetID);

    // time since start of the fight
    var timesincefight = event.timestamp - self.fight.start_time;

    dbg((timesincefight / 1000) + " :: " + event.type + (DEBUG.source ? (" :: " + self.friendlyName(event.sourceID)) : "") + " :: " + self.friendlyName(event.targetID) + " :: " + event.ability.name + " :: " + event.ability.guid);

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

        // ignore errors for HoTs that could have been applied before combat started
        //  stop doing this past 60s into the fight
        if (event.timestamp - (60 * 1000) < self.fight.start_time) {
            return
        }

        throw new Error("removebuff: " + self.friendlyName(event.targetID) + " does not have " + event.ability.name + " buff (" + event.ability.guid + ")");
    } else {
        // attribute the time since the previous HoT was applied / expired to the stack count
        var stacks = self.targets[event.targetID].hots.length;
        var time = event.timestamp - self.targets[event.targetID].timeLastChanged;

        self.masteryStacks[stacks] += time;

        self._removeHoT(event.timestamp, event.targetID, event.ability, idx);
    }
};

Parser.prototype._removeHoT = function(timestamp, targetID, ability, idx) {
    var self = this;

    self._ensureTargetExists(targetID);

    // time since start of the fight
    var timesincefight = timestamp - self.fight.start_time;

    if (DEBUG._removeHot) {
        dbg((timesincefight / 1000) + " :: removeHoT :: " + self.friendlyName(targetID) + " :: " + ability.name + " :: " + ability.guid);
    }

    idx = typeof idx !== "undefined" ? idx : null;
    self.targets[targetID].hots.forEach(function(_ability, _idx) {
        if (_ability.guid === ability.guid) {
            idx = _idx;
        }
    });

    if (idx === null) {
        throw new Error();
    }

    // then add our new HoT to the target
    self.targets[targetID].timeLastChanged = timestamp;
    self.targets[targetID].hots.splice(idx, 1);
};

module.exports = exports = Parser;
