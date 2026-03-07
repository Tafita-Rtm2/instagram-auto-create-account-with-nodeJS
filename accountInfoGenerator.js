const _ = require('lodash');

// Génération du nom complet
const generatingName = function () {
    const firstName = ["Alan","Azad","Murat","Cevad","Levent","Erkin","Cem","Aras","Salih","Nur","Mustafa","Kerem","Yusuf"];
    const surName   = ["Abak","Yasar","Kilic","Bilgic","Demir","Noga","Vinos","Shimizer","Dag","Kerim","Levent","Aram","Akdeniz"];
    return _.sample(firstName) + " " + _.sample(surName);
};

// Génération du username — UNIQUEMENT lettres, chiffres, underscores, points
// Instagram interdit les tirets "-"
const username = function () {
    const adjectives = [
        "happy","sunny","cool","smart","brave","calm","kind","fast","neat","bold",
        "wise","strong","bright","clear","sweet","fresh","sharp","quiet","loyal","swift"
    ];
    const nouns = [
        "tiger","eagle","wolf","panda","lion","fox","bear","hawk","deer","owl",
        "star","moon","wave","rock","fire","wind","rain","sky","leaf","tree"
    ];
    const adj  = _.sample(adjectives);
    const noun = _.sample(nouns);
    const num  = Math.floor(Math.random() * 9000) + 1000;
    // Format : adj_noun_1234 — 100% compatible Instagram (pas de tiret)
    return adj + "_" + noun + "_" + num;
};

module.exports = { generatingName, username };
