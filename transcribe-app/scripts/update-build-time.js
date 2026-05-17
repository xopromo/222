const fs = require('fs');
const path = require('path');

const time = new Date().toISOString();
const content = `export const BUILD_TIME = '${time}';\n`;
const filePath = path.join(__dirname, '../src/BUILD_TIME.js');

fs.writeFileSync(filePath, content, 'utf8');
console.log(`BUILD_TIME updated: ${time}`);
