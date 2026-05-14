const fs = require('fs');
let c = fs.readFileSync('injection.js', 'utf8');
c = c.replace(/\$ \s*\{/g, '${');
c = c.replace(/\?\s+\./g, '?.');
fs.writeFileSync('injection.js', c);