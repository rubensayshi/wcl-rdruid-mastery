var assert = require('assert');

var SPELLS = {
    REJUV: "Rejuvenation",
    REJUV_GERM: "Rejuvenation (Germination)",
    CW: "Cenarion Ward",
    CULTI: "Cultivation",
    WG: "Wild Growth",
    REGROWTH: "Regrowth",
    LB: "Lifebloom",
    SB: "Spring Blossoms",
    TRANQ: "Tranquility",
    HT: "Healing Touch",
    DREAMWALKER: "Dreamwalker",
    NATURES_ESSENCE: "Nature's Essence",
    SM: "Swiftmend",
    YSERAS: "Ysera's Gift",
    EFFLO: "Effloresence"
};

var BUFFS = {
    POTA: "Power of the Archdruid"
};

// list of HoTs we take into account for mastery stacks
var HOTS = [
    SPELLS.REJUV,
    SPELLS.REJUV_GERM,
    SPELLS.CW,
    SPELLS.CULTI,
    SPELLS.WG,
    SPELLS.REGROWTH,
    SPELLS.LB,
    SPELLS.SB
];

var MAX_HOTS = HOTS.length;

module.exports = {
    SPELLS: SPELLS,
    CWGUIDS: {
        BUFF: 102351,
        HOT: 102352
    },
    DEFAULT_TYPE_ORDER: ['resurrect', 'cast', 'removebuff', 'applybuff', 'refreshbuff', 'heal'],
    CW_TYPE_ORDER: ['resurrect', 'cast', 'applybuff', 'removebuff', 'refreshbuff', 'heal'],

    TIER20IDS: [
        138324,
        138327,
        138330,
        138336,
        138333,
        138366
    ],
    TEARSTONEID: 137042,

    REJUV_CAST_MARGIN: 100,
    WG_CAST_MARGIN: 100,
    TEARSTONE_MARGIN: 200,
    BUFFS: BUFFS,
    HOTS: HOTS,
    MAX_HOTS: MAX_HOTS
};
