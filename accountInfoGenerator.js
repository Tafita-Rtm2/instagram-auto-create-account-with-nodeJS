const _ = require('lodash');

const firstNames = [
    "tafita","miora","haja","noro","fara","nirina","tojo","mamy","tsiry","hery",
    "luca","matteo","hugo","leo","noah","arthur","theo","tom","alex","max",
    "emma","sofia","camille","chloe","lea","sarah","marie","julie","laura","alice",
    "james","john","mike","david","chris","ryan","kevin","brian","jason","tyler",
    "mohamed","omar","youssef","adam","karim","bilal","amine","rayan","samir","nabil",
    "ana","maria","elena","lucia","valentina","natalia","paula","diana","rosa","vera"
];

const lastNames = [
    "rakoto","rabe","raharison","andriamaro","randria","razafy","rasolofomanana",
    "smith","johnson","williams","brown","jones","davis","wilson","taylor","thomas",
    "garcia","martinez","rodriguez","lopez","sanchez","gomez","torres","flores",
    "martin","bernard","dubois","moreau","simon","laurent","michel","leroy","petit",
    "ali","hassan","ibrahim","khalil","mansour","salem","nasser","farid","zaki"
];

const generatingName = function() {
    const first = _.sample(firstNames);
    const last  = _.sample(lastNames);
    return first.charAt(0).toUpperCase() + first.slice(1) + ' ' +
           last.charAt(0).toUpperCase() + last.slice(1);
};

// Usernames style vrai humain : tafita128, miora.rabe, hugo_2003, etc.
const username = function() {
    const first = _.sample(firstNames);
    const last  = _.sample(lastNames);
    const num   = Math.floor(Math.random() * 900) + 100;   // 100-999
    const year  = 1995 + Math.floor(Math.random() * 15);   // 1995-2010
    const yy    = String(year).slice(2);                    // "03", "98"
    const style = Math.floor(Math.random() * 8);
    const sep   = Math.random() > 0.6 ? '_' : '.';

    switch(style) {
        case 0: return first + num;                         // tafita128
        case 1: return first + sep + last;                  // tafita.rabe
        case 2: return first + sep + last + num;            // tafita_rabe42
        case 3: return first + yy;                          // tafita03
        case 4: return first + sep + yy;                    // hugo_03
        case 5: return first + sep + last + sep + yy;       // hugo.smith.02
        case 6: return first + last + num;                  // tafitarabe128
        case 7: return last + sep + first + num;            // rabe_tafita7
        default: return first + num;
    }
};

module.exports = { generatingName, username };
