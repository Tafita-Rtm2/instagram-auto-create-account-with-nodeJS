const _ = require('lodash');
const userName = require('random-username-generator');

// Génération d'un nom aléatoire réaliste
const generatingName = function () {
    const firstName = ["Alan", "Azad", "Murat", "Cevad", "Levent", "Erkin", "Cem", "Aras", "Salih", "Nur", "Mustafa", "Kerem", "Yusuf"];
    const surName = ["Abak", "Yasar", "Kilic", "Bilgic", "Demir", "Noga", "Vinos", "Shimizer", "Dag", "Kerim", "Levent", "Aram", "Akdeniz"];
    return _.sample(firstName) + " " + _.sample(surName);
};

// Génération d'un username unique
const username = function () {
    userName.setSeperator('_');
    userName.setNames('erkinalan');
    const base = userName.generate();
    // Ajouter un nombre pour garantir l'unicité
    return base + "_" + Math.floor(Math.random() * 9999);
};

module.exports = { generatingName, username };
