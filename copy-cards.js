const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname);
const destDir = path.join(__dirname, 'public', 'gallery');

const files = [
  { src: 'карточка 1.png', dest: 'card-1.png' },
  { src: 'карточка 2.png', dest: 'card-2.png' },
  { src: 'карточка 3.png', dest: 'card-3.png' },
  { src: 'карточка 4.png', dest: 'card-4.png' },
  { src: 'карточка 5.png', dest: 'card-5.png' },
  { src: 'карточка 6.png', dest: 'card-6.png' },
  { src: 'карточка 7.jpeg', dest: 'card-7.jpeg' },
  { src: 'карточка 8.png', dest: 'card-8.png' },
];

files.forEach(({ src, dest }) => {
  const srcPath = path.join(srcDir, src);
  const destPath = path.join(destDir, dest);
  try {
    fs.copyFileSync(srcPath, destPath);
    console.log('OK:', dest);
  } catch (err) {
    console.error('Error:', src, err.message);
  }
});
