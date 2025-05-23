import fs from 'fs';
import path from 'path';

const filePath = path.join(__dirname, '../src/capabilities/__tests__/resources-enhanced.test.ts');
const content = fs.readFileSync(filePath, 'utf8');

// Replace all occurrences of result.contents.text with (result.contents as any).text
const updatedContent = content
  .replace(/result\.contents\.text/g, '(result.contents as any).text')
  .replace(/result\.contents\.type/g, '(result.contents as any).type')
  .replace(/result\.contents\.markdown/g, '(result.contents as any).markdown');

// Write the updated content back to the file
fs.writeFileSync(filePath, updatedContent);

console.log('Successfully updated resources-enhanced.test.ts');