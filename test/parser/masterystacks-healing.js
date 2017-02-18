var rdruidMastery = require('../../');
var test = require('tape');

test('simple fight, 1 target, 1 HoT', function (t) {
    t.plan(1);

    var fight = {
        start_time: 0,
        end_time: 10 * 1000
    };

    var events = [
        {timestamp: 0, type: 'combatantinfo', sourceID: 1, targetID: 1, gear: []},
        {timestamp: 0, type: 'applybuff', sourceID: 1, targetID: 1, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 1 * 1000, type: 'heal', sourceID: 1, targetID: 1, amount: 1000, overheal: 1000, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 1 * 1000, type: 'heal', sourceID: 1, targetID: 1, amount: 1000, overheal: 1000, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 1 * 1000, type: 'heal', sourceID: 1, targetID: 1, amount: 1000, overheal: 1000, ability: {name: 'Rejuvenation', guid: 1}}
    ];

    var parser = new rdruidMastery.Parser(fight, 1, [{id: 1, name: 'P1'}, {id: 2, name: 'P2'}], events, []);
    parser.parse();

    t.deepEqual(parser.result().masteryStacksHealingRaw, {
        0: 0,
        1: 3000,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
        6: 0,
        7: 0,
        8: 0
    });
});

test('simple fight, 1 target, 1 HoT', function (t) {
    t.plan(1);

    var fight = {
        start_time: 0,
        end_time: 10 * 1000
    };

    var events = [
        {timestamp: 0, type: 'combatantinfo', sourceID: 1, targetID: 1, gear: []},
        {timestamp: 1 * 1000, type: 'heal', sourceID: 1, targetID: 1, amount: 1000, overheal: 1000, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 1 * 1000, type: 'heal', sourceID: 1, targetID: 1, amount: 1000, overheal: 1000, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 0, type: 'applybuff', sourceID: 1, targetID: 1, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 1 * 1000, type: 'heal', sourceID: 1, targetID: 1, amount: 1000, overheal: 1000, ability: {name: 'Rejuvenation', guid: 1}}
    ];

    var parser = new rdruidMastery.Parser(fight, 1, [{id: 1, name: 'P1'}, {id: 2, name: 'P2'}], events, []);
    parser.parse();

    t.deepEqual(parser.result().masteryStacksHealingRaw, {
        0: 2000,
        1: 1000,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
        6: 0,
        7: 0,
        8: 0
    });
});

test('simple fight, 1 target, 2 HoTs', function (t) {
    t.plan(1);

    var fight = {
        start_time: 0,
        end_time: 10 * 1000
    };

    var events = [
        {timestamp: 0, type: 'combatantinfo', sourceID: 1, targetID: 1, gear: []},
        {timestamp: 1 * 1000, type: 'heal', sourceID: 1, targetID: 1, amount: 1000, overheal: 1000, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 1 * 1000, type: 'heal', sourceID: 1, targetID: 1, amount: 1000, overheal: 1000, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 0, type: 'applybuff', sourceID: 1, targetID: 1, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 1 * 1000, type: 'heal', sourceID: 1, targetID: 1, amount: 1000, overheal: 1000, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 0, type: 'applybuff', sourceID: 1, targetID: 1, ability: {name: 'Lifebloom', guid: 2}},
        {timestamp: 1 * 1000, type: 'heal', sourceID: 1, targetID: 1, amount: 1000, overheal: 1000, ability: {name: 'Rejuvenation', guid: 1}}
    ];

    var parser = new rdruidMastery.Parser(fight, 1, [{id: 1, name: 'P1'}, {id: 2, name: 'P2'}], events, []);
    parser.parse();

    t.deepEqual(parser.result().masteryStacksHealingRaw, {
        0: 2000,
        1: 1000,
        2: 1000,
        3: 0,
        4: 0,
        5: 0,
        6: 0,
        7: 0,
        8: 0
    });
});
