const fs = require('fs');
const path = require('path');

function getFiles(dir) {
  const files = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory() && !['node_modules', '.next'].includes(f)) {
      files.push(...getFiles(full));
    } else if (f.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

const files = getFiles('src');
const regex = /["'`]([A-Z][a-zA-Z ]{2,40})["'`]/g;
const found = new Set();

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = regex.exec(content)) !== null) {
    found.add(match[1]);
  }
}

console.log([...found].sort().join('\n'));