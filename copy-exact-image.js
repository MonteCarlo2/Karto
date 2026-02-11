const fs = require('fs');
const path = require('path');

// Explicit path provided by user
const srcPath = 'C:\\Users\\user\\Desktop\\karto-new\\экран визуал свободный.png';
const destPath = 'C:\\Users\\user\\Desktop\\karto-new\\public\\demo\\free-gen-ui.png';

try {
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`SUCCESS: Copied "${srcPath}" to "${destPath}"`);
  } else {
    console.error(`ERROR: Source file not found at "${srcPath}"`);
    // List desktop files to debug if needed
    const desktop = 'C:\\Users\\user\\Desktop\\karto-new';
    console.log('Files in directory:');
    fs.readdirSync(desktop).filter(f => f.includes('экран')).forEach(f => console.log(f));
  }
} catch (err) {
  console.error(`ERROR: ${err.message}`);
}
