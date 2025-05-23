import fs from 'fs';
import path from 'path';

async function updateClientInitialization() {
  const rootDir = process.cwd();
  const testDirs = [
    path.join(rootDir, 'src/__tests__'),
    path.join(rootDir, 'src/__tests__/e2e'),
    path.join(rootDir, 'src/__tests__/integration')
  ];
  
  // Process each directory
  for (const dir of testDirs) {
    if (!fs.existsSync(dir)) continue;
    
    // Get all test files in the directory
    const files = fs.readdirSync(dir)
      .filter(file => file.endsWith('.test.ts'))
      .map(file => path.join(dir, file));
    
    // Process each file
    for (const filePath of files) {
      console.log(`Checking ${filePath}...`);
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Replace the client initialization syntax
      // Find any instance where a TheBrainClient is initialized with an object
      const hasChanged = content.includes('new TheBrainClient({');
      
      if (hasChanged) {
        content = content.replace(
          /const (\w+) = new TheBrainClient\(\{\s*apiKey: ['"]([^'"]+)['"](?:,\s*baseUrl: ['"]([^'"]+)['"])?\s*\}\);/g,
          (match, varName, apiKey, baseUrl) => {
            const url = baseUrl || 'https://api.bra.in';
            return `const ${varName} = new TheBrainClient(\n        '${url}',\n        '${apiKey}'\n      );`;
          }
        );
        
        fs.writeFileSync(filePath, content);
        console.log(`  Updated client initialization in ${filePath}`);
      }
    }
  }
  
  console.log('All client initializations updated!');
}

updateClientInitialization().catch(console.error);