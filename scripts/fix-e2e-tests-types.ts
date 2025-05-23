import fs from 'fs';
import path from 'path';

async function updateE2ETestTypes() {
  const e2eDir = path.join(process.cwd(), 'src/__tests__/e2e');
  const files = fs.readdirSync(e2eDir);
  const testFiles = files.filter(file => file.endsWith('.test.ts'))
                          .map(file => path.join(e2eDir, file));
  
  for (const filePath of testFiles) {
    console.log(`Updating ${filePath}...`);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace string | undefined declarations
    content = content.replace(
      /let (\w+)(?:Id|ID|Guid|GUID): string \| undefined;/g, 
      'let $1Id = \'\';'
    );
    
    // Fix field access assertions
    content = content.replace(
      /(\w+)Id = (\w+)\.id;/g,
      '$1Id = $2.id as string; // Assert we have a string ID'
    );
    
    fs.writeFileSync(filePath, content);
  }
  
  console.log('All E2E test files types fixed!');
}

updateE2ETestTypes().catch(console.error);