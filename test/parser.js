var rdruidMastery = require('../');
var test = require('tape');

test('simple fight, 1 target, end of fight', function (t) {
    t.plan(1);

    var fight = {
        start_time: 0,
        end_time: 10 * 1000
    };

    var events = [
        {timestamp: 0, type: 'applybuff', sourceID: 1, targetID: 1, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 1 * 1000, type: 'applybuff', sourceID: 1, targetID: 1, ability: {name: 'Lifebloom', guid: 2}}
    ];

    var parser = new rdruidMastery.Parser(fight, 1, [{id: 1, name: 'P1'}, {id: 2, name: 'P2'}], events, []);
    parser.parse();

    t.deepEqual(parser.masteryStacks, {
        1: 1000,
        2: 9000,
        3: 0,
        4: 0,
        5: 0,
        6: 0,
        7: 0
    });
});

test('simple fight, 1 target, removebuff', function (t) {
    t.plan(1);

    var fight = {
        start_time: 0,
        end_time: 10 * 1000
    };

    var events = [
        {timestamp: 0, type: 'applybuff', sourceID: 1, targetID: 1, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 1 * 1000, type: 'applybuff', sourceID: 1, targetID: 1, ability: {name: 'Lifebloom', guid: 2}},
        {timestamp: 5 * 1000, type: 'removebuff', sourceID: 1, targetID: 1, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 7 * 1000, type: 'removebuff', sourceID: 1, targetID: 1, ability: {name: 'Lifebloom', guid: 2}}
    ];

    var parser = new rdruidMastery.Parser(fight, 1, [{id: 1, name: 'P1'}, {id: 2, name: 'P2'}], events, []);
    parser.parse();

    t.deepEqual(parser.masteryStacks, {
        1: 3000,
        2: 4000,
        3: 0,
        4: 0,
        5: 0,
        6: 0,
        7: 0
    });
});

test('simple fight, 2 targets, end of fight', function (t) {
    t.plan(1);

    var fight = {
        start_time: 0,
        end_time: 10 * 1000
    };

    var events = [
        {timestamp: 0, type: 'applybuff', sourceID: 1, targetID: 1, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 0, type: 'applybuff', sourceID: 1, targetID: 2, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 1 * 1000, type: 'applybuff', sourceID: 1, targetID: 1, ability: {name: 'Lifebloom', guid: 2}},
        {timestamp: 1 * 1000, type: 'applybuff', sourceID: 1, targetID: 2, ability: {name: 'Lifebloom', guid: 2}}
    ];

    var parser = new rdruidMastery.Parser(fight, 1, [{id: 1, name: 'P1'}, {id: 2, name: 'P2'}], events, []);
    parser.parse();

    t.deepEqual(parser.masteryStacks, {
        1: 2000,
        2: 18000,
        3: 0,
        4: 0,
        5: 0,
        6: 0,
        7: 0
    });
});

test('simple fight, 2 targets, removebuff, end of fight', function (t) {
    t.plan(1);

    var fight = {
        start_time: 0,
        end_time: 10 * 1000
    };

    var events = [
        {timestamp: 0, type: 'applybuff', sourceID: 1, targetID: 1, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 0, type: 'applybuff', sourceID: 1, targetID: 2, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 1 * 1000, type: 'applybuff', sourceID: 1, targetID: 1, ability: {name: 'Lifebloom', guid: 2}},
        {timestamp: 1 * 1000, type: 'applybuff', sourceID: 1, targetID: 2, ability: {name: 'Lifebloom', guid: 2}},
        {timestamp: 5 * 1000, type: 'removebuff', sourceID: 1, targetID: 1, ability: {name: 'Rejuvenation', guid: 1}}
    ];

    var parser = new rdruidMastery.Parser(fight, 1, [{id: 1, name: 'P1'}, {id: 2, name: 'P2'}], events, []);
    parser.parse();

    t.deepEqual(parser.masteryStacks, {
        1: 7000,
        2: 13000,
        3: 0,
        4: 0,
        5: 0,
        6: 0,
        7: 0
    });
});

test('simple fight, 2 druids, 2 targets, removebuff, end of fight', function (t) {
    t.plan(1);

    var fight = {
        start_time: 0,
        end_time: 10 * 1000
    };

    var events = [
        {timestamp: 0, type: 'applybuff', sourceID: 1, targetID: 1, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 0, type: 'applybuff', sourceID: 2, targetID: 1, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 0, type: 'applybuff', sourceID: 1, targetID: 2, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 0, type: 'applybuff', sourceID: 2, targetID: 2, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 1 * 1000, type: 'applybuff', sourceID: 1, targetID: 1, ability: {name: 'Lifebloom', guid: 2}},
        {timestamp: 1 * 1000, type: 'applybuff', sourceID: 2, targetID: 1, ability: {name: 'Lifebloom', guid: 2}},
        {timestamp: 1 * 1000, type: 'applybuff', sourceID: 1, targetID: 2, ability: {name: 'Lifebloom', guid: 2}},
        {timestamp: 1 * 1000, type: 'applybuff', sourceID: 2, targetID: 2, ability: {name: 'Lifebloom', guid: 2}},
        {timestamp: 5 * 1000, type: 'removebuff', sourceID: 1, targetID: 1, ability: {name: 'Rejuvenation', guid: 1}},
        {timestamp: 5 * 1000, type: 'removebuff', sourceID: 2, targetID: 1, ability: {name: 'Rejuvenation', guid: 1}}
    ];

    var parser = new rdruidMastery.Parser(fight, 1, [{id: 1, name: 'P1'}, {id: 2, name: 'P2'}], events, []);
    parser.parse();

    t.deepEqual(parser.masteryStacks, {
        1: 7000,
        2: 13000,
        3: 0,
        4: 0,
        5: 0,
        6: 0,
        7: 0
    });
});
