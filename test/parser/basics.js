var rdruidMastery = require('../../');
var test = require('tape');

test('mastery percentage', function (t) {
    t.plan(2);

    t.equal(rdruidMastery.Parser.masteryPercentageFromRating(5907).toFixed(4), "0.0886");
    t.equal(rdruidMastery.Parser.masteryPercentageFromRating(7733).toFixed(4), "0.1160");
});

test('mastery & tier19 detection', function (t) {
    t.plan(3);

    var fight = {
        start_time: 0,
        end_time: 10 * 1000
    };

    var events = [
        {timestamp: 0, type: 'combatantinfo', sourceID: 1, targetID: 1,
            mastery: 7733,
            talents: [],
            gear: [
            {
                // tier19
                id: 138330,
                itemLevel: 890,
                quality: 4,
                icon: 'inv_helmet_leather_raiddruid_q_01.jpg',
                bonusIDs: [Object],
                gems: [Object]
            },
            {
                // tier19
                id: 138336,
                itemLevel: 890,
                quality: 4,
                icon: 'inv_shoulder_leather_raiddruid_q_01.jpg',
                permanentEnchant: 5883,
                bonusIDs: [Object]
            },
            {
                // tier19
                id: 138333,
                itemLevel: 890,
                quality: 4,
                icon: 'inv_pants_leather_raiddruid_q_01.jpg',
                bonusIDs: [Object]
            },
            {
                // tier19
                id: 138327,
                itemLevel: 890,
                quality: 4,
                icon: 'inv_gloves_leather_raiddruid_q_01.jpg',
                permanentEnchant: 5444,
                bonusIDs: [Object]
            }
        ]}
    ];

    var parser = new rdruidMastery.Parser(fight, 1, [{id: 1, name: 'P1'}, {id: 2, name: 'P2'}], events, []);
    parser.parse();

    t.equal(parser.tier192pc, true);
    t.equal(parser.tier194pc, true);
    t.equal(parser.masteryPercentage().toFixed(4), "0.1820");
});
