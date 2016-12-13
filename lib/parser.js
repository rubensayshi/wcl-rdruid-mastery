var assert = require('assert');
var dbg = require('debug')('wclrdruidm:parser');

/* Healing Spell Whitelist
 * Easier to do this than blacklisting bad spells :^)
 * Unleash Life doesn't benefit from mastery
*/

var heals = [
    "Chain Heal",
    "Healing Wave",
    "Healing Surge",
    "Wellspring",
    "Riptide",
    "Healing Stream Totem",
    "Gift of the Queen",
    "Healing Tide Totem",
    "Queen's Decree",
    "Tidal Totem",
    "Healing Rain",
];

var REPARSE = true;
var mastery = { base: 2800, gear: 0 };
var crit = { base: 1750, gear: 0 };
var vers = { base: 0, gear: 0 };
var int = { base: 7331, gear: 0 };
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

    var isNumeric = function(n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    };

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

    // filter out events we don't need
    self.events = events.filter(function(event) {
        // filter out blacklisted friendlies
        if (self.ignoreFriendliesIDs.indexOf(event.targetID) !== -1) {
            return;
        }

        // check if it's a buff event
        var isHeal = event.type === 'heal';

        // filter out any heals that aren't heals we care about
        if (isHeal && heals.indexOf(event.ability.name) === -1) {
            return;
        }

        // filter out events where the source is not our own
        if (event.sourceID !== self.actorID) {
            return;
        }

        // Filter events that didn't heal at all (i.e. complete overheal)
        if (event.amount === 0) {
            return;
        }

        if (event.sourceIsFriendly === true && event.targetIsFriendly === true) {
            if (event.targetID && typeof self.friendliesById[event.targetID] === "undefined" && event.targetIsFriendly === true) {
               throw new Error("Unknown friendly [" + event.targetID + "]");
            }
 
            if (event.targetID && self.friendliesById[event.targetID].petOwner) {
                return false;
            }
        }
        
        else {
            console.log(event);
        }
 
        if (event.target && event.target.type === 'NPC') {
            return false;
        }
 
        return true;
    });

    self.parsed = false;
};

Parser.heals = heals;

Parser.prototype.friendlyName = function(friendlyID) {
    var self = this;

    if (typeof self.friendliesById[friendlyID] === "undefined") {
        return "Unknown [" + friendlyID + "]";
    }

    return self.friendliesById[friendlyID].name;
};

Parser.prototype._resetState = function() {
    var self = this;

    // tracking our targets
    self.targets = {};

    // stat benefits
    self.statBenefits = {
        mastery: {
            events: [],
            perPoint: 0,
        },
        crit: {
            events: [],
            perPoint: 0,
        },
        vers: {
            events: [],
            perPoint: 0,
        },
        int: {
            events: [],
            perPoint: 0,
        },
    }
};

Parser.prototype._ensureTargetExists = function(targetID) {
    var self = this;

    // ensure target exists
    if (typeof self.targets[targetID] === "undefined") {
        self.targets[targetID] = {
            heals: [],
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
    
    // end of fight, expire any remaining heals
    for (var targetID in self.targets) {
        if (self.targets[targetID].heals.length > 0) {
            var stacks = self.targets[targetID].heals.length;
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
            self._setStats(event);
            // dbg(JSON.stringify(event, null, 4));
            break;

        case 'heal':
            self._processHealEvent(event);
            break;

        default:
            dbg(JSON.stringify(event, null, 4));

            break;
    }
};

Parser.prototype._setStats = function(event) {
    mastery.gear = event.mastery;
    crit.gear = event.critSpell;
    vers.gear = event.versatilityHealingDone;
    int.gear = (event.intellect - int.base)
};

Parser.prototype._processHealEvent = function(event) {
//    if (event.overheal > 0) { console.log(event); }
    var self = this;

    var masteryEvents = self.statBenefits.mastery;
    masteryEvents.events.push(this._processMasteryContribution(event));

    var critEvents = self.statBenefits.crit;
    critEvents.events.push(this._processCritContribution(event));

    var versEvents = self.statBenefits.vers;
    versEvents.events.push(this._processVersContribution(event));

    var intEvents = self.statBenefits.int;
    intEvents.events.push(this._processIntellectContribution(event));
    
};

Parser.prototype._processIntellectContribution = function(event) {
    if (event.hitType !== 2) { event.amount = event.amount / 2 } // normalize for crit, TODO: Cloak
    var totalInt = int.base + int.gear;

    // Calculate vers/mastery modifiers
    var versModifier = 1 + (vers.gear / 40000)
    var masteryEffectiveness = Math.round((1 - (event.hitPoints - event.amount) / event.maxHitPoints) * 10000) / 10000;
    var masteryTotalAmount = mastery.base + mastery.gear;
    var masteryTotalPotential = Math.round((masteryTotalAmount / 350) * 300) / 10000;
    var masteryModifier = 1 + (masteryEffectiveness * masteryTotalPotential);

    // Base heal
    var baseHeal = event.amount / versModifier / masteryModifier;
    var healingFromIntPerPoint = baseHeal / totalInt

    return { healingFromInt: baseHeal, healingPerPoint: healingFromIntPerPoint }
}

Parser.prototype._processCritContribution = function(event) {
    if (event.hitType !== 2) { return }

    var overheal = event.overheal || 0;
    var totalHeal = event.amount + overheal;
    var regularHeal = totalHeal / 2;
    var critHealingAmount = regularHeal - overheal;
    var critTotalAmount = crit.base + crit.gear;
    var critGearRatio = crit.gear / critTotalAmount;
    var healingPerPoint = (critHealingAmount / critTotalAmount) * critGearRatio;

    return { healingFromCrit: critHealingAmount, healingPerPoint: healingPerPoint };
}

Parser.prototype._processVersContribution = function(event) {
    var regularHealModifier = event.hitType === 2 ? 2 : 1;

    var overheal = event.overheal || 0;
    var totalHeal = event.amount + overheal;
    var regularHeal = totalHeal / regularHealModifier;

    var versHealingAmount = (vers.gear / (400 * 100)) * (regularHeal - (regularHealModifier === 2 ? 0 : overheal));
    var healingPerPoint = versHealingAmount / vers.gear;

    return { healingFromVers: versHealingAmount, healingPerPoint: healingPerPoint };
}

Parser.prototype._processMasteryContribution = function(event) {
    var masteryEffectiveness = Math.round((1 - (event.hitPoints - event.amount) / event.maxHitPoints) * 10000) / 10000;
    var masteryTotalAmount = mastery.base + mastery.gear;
    var masteryGearRatio = mastery.gear / masteryTotalAmount;
    var masteryTotalPotential = Math.round((masteryTotalAmount / 350) * 300) / 10000;
    var masteryAmountCoefficient = masteryEffectiveness * masteryTotalPotential;
    var healingByMastery = event.amount * masteryAmountCoefficient
    var healingByGearMastery = healingByMastery * masteryGearRatio;
    var healingPerPoint = healingByGearMastery / mastery.gear;

    return { healingFromMastery: healingByGearMastery, healingPerPoint: healingPerPoint, masteryEffectiveness: masteryEffectiveness };
}

module.exports = exports = Parser;
