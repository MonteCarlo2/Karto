const fs = require('fs');
const path = require('path');

// Source file provided by user (using the specific ID from context)
// image-0827c106-d8d4-4835-8808-faa900c2e3b5.png
const srcDir = 'C:\\Users\\user\\.cursor\\projects\\c-Users-user-Desktop-karto-new\\assets\\c__Users_user_AppData_Roaming_Cursor_User_workspaceStorage_72d059fcaf7d7bab51467b7343cf1f2c_images_image-0827c106-d8d4-4835-8808-faa900c2e3b5.png';
const destPath = 'C:\\Users\\user\\Desktop\\karto-new\\public\\demo\\free-gen-ui.png';

try {
  fs.copyFileSync(srcDir, destPath);
  console.log(`Successfully copied image to ${destPath}`);
} catch (err) {
  console.error(`Error copying image:`, err.message);
  // Fallback try assuming file might be in a different relative path if absolute fails
  try {
      // Try listing dir to find it if needed, but absolute path from context usually works
  } catch (e) {}
}
