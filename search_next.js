import fs from 'fs';
import path from 'path';

function searchInDir(dir, pattern) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules') searchInDir(fullPath, pattern);
    } else if (file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(pattern)) {
        console.log(`Found "${pattern}" in ${fullPath}`);
      }
    }
  }
}

searchInDir('./backend', 'next =');
searchInDir('./backend', 'next(');
