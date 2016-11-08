var assert = require('assert');
var dbg = require('debug')('wclrdruidm:parser');
var Table = require('cli-table');

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

var Parser = function(fight, friendlies, events, ignoreFriendlies) {
    var self = this;

    self.fight = fight;
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
        if (self.ignoreFriendliesIDs.indexOf(event.targetID) !== -1) {
            return false;
        }

        if (['applybuff', 'removebuff'].indexOf(event.type) !== -1) {
            return HOTS.indexOf(event.ability.name) !== -1;
        } else if (event.type === 'combatantinfo') {
            return true;
        }

        return false;
    });


    // this is where we sum up the total amount of time a target has X stacks
    self.masteryStacks = {};
    for (var i = 1; i <= MAX_HOTS; i++) {
        self.masteryStacks[i] = 0;
    }

    // tracking our targets
    self.targets = {};

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

Parser.prototype.parse = function() {
    var self = this;

    if (self.parsed) {
        throw new Error("already parsed");
    }
    self.parsed = true;

    self._parseEvents();
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

    // time since start of the fight
    var timesincefight = event.timestamp - self.fight.start_time;

    dbg((timesincefight / 1000) + " :: " + event.type + " :: " + self.friendlyName(event.targetID) + " :: " + event.ability.name + " :: " + event.ability.guid);

    // ensure target exists
    if (typeof self.targets[event.targetID] === "undefined") {
        self.targets[event.targetID] = {
            hots: [],
            timeLastChange: self.fight.start_time
        };
    }

    // sanity check that we don't track the same buff twice
    //  if this triggers it means we have a bug xD
    var idx = null;
    self.targets[event.targetID].hots.forEach(function(_event, _idx) {
        if (_event.ability.guid === event.ability.guid) {
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
    self.targets[event.targetID].timeLastChanged = event.timestamp;
    self.targets[event.targetID].hots.push(event);
};

Parser.prototype._removeBuffEvent = function(event) {
    var self = this;

    // time since start of the fight
    var timesincefight = event.timestamp - self.fight.start_time;

    dbg((timesincefight / 1000) + " :: " + event.type + " :: " + self.friendlyName(event.targetID) + " :: " + event.ability.name + " :: " + event.ability.guid);

    // ensure target exists
    if (typeof self.targets[event.targetID] === "undefined") {
        self.targets[event.targetID] = {
            hots: [],
            timeLastChange: self.fight.start_time
        };
    }

    // find matching HoT on target
    var idx = null;
    self.targets[event.targetID].hots.forEach(function(_event, _idx) {
        if (_event.ability.guid === event.ability.guid) {
            idx = _idx;
        }
    });

    // sanity check that we were tracking the expiring buff
    //  if this triggers it means we have a bug xD
    if (idx === null) {
        // ignore errors for HoTs that could have been applied before combat started
        //  stop doing this past 60s into the fight
        // @TODO: should reparse with this buff being applied from the start
        if (event.timestamp - (60 * 1000) < self.fight.start_time) {
            return;
        }
        throw new Error("removebuff: " + self.friendlyName(event.targetID) + " does not have " + event.ability.name + " buff (" + event.ability.guid + ")");
    } else {
        // attribute the time since the previous HoT was applied / expired to the stack count
        var stacks = self.targets[event.targetID].hots.length;
        var time = event.timestamp - self.targets[event.targetID].timeLastChanged;

        self.masteryStacks[stacks] += time;

        // remove the HoT from the target
        self.targets[event.targetID].timeLastChanged = event.timestamp;
        self.targets[event.targetID].hots.splice(idx, 1);
    }
};

module.exports = exports = Parser;
