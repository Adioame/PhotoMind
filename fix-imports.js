// fix-imports.js - Add .js extension to ESM imports (only if missing)
const fs = require('fs');
const path = require('path');

const dirs = ['main', 'services', 'database', 'preload'];

dirs.forEach(dir => {
  const dirPath = path.join('dist-electron', dir);
  if (!fs.existsSync(dirPath)) return;

  fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.js'))
    .forEach(f => {
      const filePath = path.join(dirPath, f);
      let content = fs.readFileSync(filePath, 'utf8');
      // Match imports that don't already end with .js
      const fixed = content.replace(/from '(\.\.?\/[^']*)(?<!\.js)(')/g, "from '$1.js$2");
      if (content !== fixed) {
        fs.writeFileSync(filePath, fixed);
        console.log(`Fixed: ${dir}/${f}`);
      }
    });
});

console.log('Done fixing imports');
