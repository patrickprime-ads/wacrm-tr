const fs = require('fs');
const path = require('path');

const target = path.resolve(__dirname, '..', 'pt-BR.json');
const translations = JSON.parse(fs.readFileSync(target, 'utf8'));

fs.writeFileSync(target, `${JSON.stringify(translations, null, 2)}\n`, 'utf8');
console.log('Traduções validadas e formatadas.');
