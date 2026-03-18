const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build');
const indexPath = path.join(buildDir, 'index.html');
const destPath = path.join(buildDir, '404.html');

try {
  if (fs.existsSync(indexPath)) {
    fs.copyFileSync(indexPath, destPath);
    console.log('Copied index.html to 404.html');
  } else {
    console.error('index.html not found — run `npm run build` first.');
    process.exit(1);
  }
} catch (err) {
  console.error(err);
  process.exit(1);
}
