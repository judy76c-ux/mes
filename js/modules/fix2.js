const fs = require('fs');
const files = ['injection.js', 'injection_part1.js', 'injection_part2.js', 'injection_part3.js'];
files.forEach(f => {
    try {
        let c = fs.readFileSync(f, 'utf8');
        c = c.replace(/\$\s*\{\s*/g, '${');
        c = c.replace(/\?\s+\./g, '?.');
        c = c.replace(/\?\s+\?/g, '??');
        fs.writeFileSync(f, c);
        console.log(`Fixed ${f}`);
    } catch (e) {
        console.error(`Error on ${f}:`, e.message);
    }
});