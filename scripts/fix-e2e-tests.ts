import fs from 'fs';
import path from 'path';

async function updateE2ETests() {
  const e2eDir = path.join(process.cwd(), 'src/__tests__/e2e');
  const files = fs.readdirSync(e2eDir);
  const testFiles = files.filter(file => file.endsWith('.test.ts'))
                          .map(file => path.join(e2eDir, file));
  
  for (const filePath of testFiles) {
    console.log(`Updating ${filePath}...`);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Update import
    content = content.replace(
      `import { TheBrainClient } from '../../thebrain/client';`, 
      `import { TheBrainClient } from '../../thebrain';`
    );
    
    // Update client initialization
    content = content.replace(
      /client = new TheBrainClient\(\{\s*apiKey: process\.env\.THEBRAIN_API_KEY(?:,\s*baseUrl: ['"]https:\/\/api\.bra\.in['"])?\s*\}\);/g,
      `client = new TheBrainClient(
      'https://api.bra.in',
      process.env.THEBRAIN_API_KEY || ''
    );`
    );
    
    fs.writeFileSync(filePath, content);
  }
  
  console.log('All E2E test files updated successfully!');
}

updateE2ETests().catch(console.error);