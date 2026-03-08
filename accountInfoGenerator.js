const _ = require('lodash');

// Prénoms et noms internationaux naturels
const firstNames = [
    "James","John","Robert","Michael","William","David","Richard","Joseph","Thomas","Charles",
    "Emma","Olivia","Ava","Isabella","Sophia","Mia","Charlotte","Amelia","Harper","Evelyn",
    "Lucas","Liam","Noah","Oliver","Elijah","Mason","Logan","Ethan","Aiden","Jackson",
    "Sofia","Camila","Valentina","Isabella","Luna","Natalia","Sara","Laura","Maria","Ana",
    "Mohammed","Omar","Youssef","Ahmed","Ali","Hassan","Adam","Rayan","Karim","Bilal",
    "Leo","Hugo","Louis","Nathan","Tom","Alexis","Maxime","Antoine","Nicolas","Pierre"
];

const lastNames = [
    "Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Martinez","Wilson",
    "Anderson","Taylor","Thomas","Jackson","White","Harris","Martin","Thompson","Young","Lee",
    "Walker","Hall","Allen","Young","King","Wright","Scott","Green","Baker","Adams",
    "Lopez","Gonzalez","Rodriguez","Sanchez","Ramirez","Torres","Flores","Rivera","Gomez","Diaz",
    "Dupont","Martin","Bernard","Dubois","Thomas","Robert","Richard","Petit","Moreau","Simon"
];

const generatingName = function() {
    return _.sample(firstNames) + ' ' + _.sample(lastNames);
};

// Usernames réalistes — style vrai utilisateur Instagram
const username = function() {
    const first = _.sample(firstNames).toLowerCase();
    const last  = _.sample(lastNames).toLowerCase();
    const style = Math.floor(Math.random() * 6);
    const num   = Math.floor(Math.random() * 999);
    const year  = 1990 + Math.floor(Math.random() * 25); // ex: 2003
    const sep   = Math.random() > 0.5 ? '_' : '.';

    switch(style) {
        case 0: return first + sep + last;                          // john.smith
        case 1: return first + sep + last + num;                    // john_smith42
        case 2: return first + String(year).slice(2);               // john03
        case 3: return first + sep + last + sep + String(year).slice(2); // john.smith03
        case 4: return first + num;                                 // john247
        case 5: return last + sep + first;                          // smith_john
        default: return first + sep + last;
    }
};

module.exports = { generatingName, username };
