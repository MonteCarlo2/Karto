const fs = require('fs');
const path = require('path');

const srcDir = 'C:\\Users\\user\\Desktop\\karto-new';
const destDir = 'C:\\Users\\user\\Desktop\\karto-new\\public\\demo';

// Mapping user provided filenames to destination filenames
const filesToCopy = [
  { src: 'экран 2, этап 1.png', dest: 'step2-1.png' },
  { src: 'экран 2, этап 2.png', dest: 'step2-2.png' }
];

filesToCopy.forEach(file => {
  const srcPath = path.join(srcDir, file.src);
  const destPath = path.join(destDir, file.dest);
  
  try {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${file.src} to ${file.dest}`);
  } catch (err) {
    console.error(`Error copying ${file.src}:`, err.message);
  }
});
