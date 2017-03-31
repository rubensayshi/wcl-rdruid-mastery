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

var SPELLS_GUID = {
    REJUV: 774,
    REJUV_GERM: 155777,

    CW: 102352,
    CW_BUFF: 102351,

    POTA: 189877
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
    SPELLS_GUID: SPELLS_GUID,
    CWGUIDS: {
        BUFF: SPELLS_GUID.CW_BUFF,
        HOT: SPELLS_GUID.CW
    },
    GUID_ORDER: [SPELLS_GUID.POTA, SPELLS_GUID.REJUV, SPELLS_GUID.REJUV_GERM],
    DEFAULT_TYPE_ORDER: ['resurrect', 'cast', 'removebuff', 'applybuff', 'refreshbuff', 'heal'],
    CW_TYPE_ORDER: ['resurrect', 'cast', 'applybuff', 'removebuff', 'refreshbuff', 'heal'],

    BASE_MASTERY: 0.048,

    STAT_RATINGS: {
        MASTERY: 666.67
    },

    TALENTS: {
        // 15
        PROSP: 200383,
        CW: 102351,
        ABUNDANCE: 207383,
        // 75
        SOTF: 158478,
        TOL: 33891,
        CULTI: 200390,
        // 90
        SB: 207385,
        IP: 197073,
        GERM: 155675,
        // 100
        FLOURISH: 207385
    },

    TIER19IDS: [
        138324,
        138327,
        138330,
        138336,
        138333,
        138366
    ],
    TIER19_2PC_UPTIME: 0.3,
    TEARSTONEID: 137042,

    LEGSHOULDERSID: 137072,

    REJUV_CAST_MARGIN: 100,
    WG_CAST_MARGIN: 100,
    TEARSTONE_MARGIN: 200,
    BUFFS: BUFFS,
    HOTS: HOTS,
    MAX_HOTS: MAX_HOTS
};
