var consts = require('./consts');

var Tick = function(ts) {
    this.ts = ts;
    this.byGuid = {};
    this.guids = [];
};

Tick.prototype.containsCastOfGuid = function(guid) {
    if (this.guids.indexOf(guid) === -1) {
        return false;
    }

    var castEvents = this.byGuid[guid].events.filter(function(event) {
        return event.type === 'cast';
    });

    if (!castEvents.length) {
        return false;
    }

    // sanity, we can't cast twice in 1 tick!?
    if (castEvents.length > 1) {
        throw new Error("WTF?");
    }

    return true;
};

Tick.prototype.addEvent = function(event) {
    var guid = event.ability && event.ability.guid || 0;
    var type = consts.DEFAULT_TYPE_ORDER.indexOf(event.type) !== -1 ? event.type : 'rest';

    this.prepare(guid, type);

    this.byGuid[guid].events.push(event);
    this.byGuid[guid].byType[type].push(event);
};

Tick.prototype.prepare = function(guid, type) {
    if (typeof this.byGuid[guid] === "undefined") {
        this.byGuid[guid] = {
            byType: [],
            events: []
        };
        this.guids.push(guid);
    }
    if (typeof this.byGuid[guid].byType[type] === "undefined") {
        this.byGuid[guid].byType[type] = [];
    }
};

Tick.prototype.deaths = function() {
    if (this.guids.indexOf(0) === -1) {
        return [];
    }

    return this.byGuid[0].events.filter(function(event) {
        return event.type === 'death';
    });
};

Tick.prototype.containsApplyBuffOfGuid = function(guid) {
    if (this.guids.indexOf(guid) === -1) {
        return false;
    }

    var applyEvents = this.byGuid[guid].events.filter(function(event) {
        return event.type === 'applybuff';
    });

    if (!applyEvents.length) {
        return false;
    }

    return true;
};

module.exports = Tick;
