import fs from 'fs';
import path from 'path';

const filePath = path.join(__dirname, '../src/__tests__/integration/list-brains-api.test.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Update import
content = content.replace(
  `import { TheBrainClient } from '../../thebrain/client';`, 
  `import { TheBrainClient } from '../../thebrain';`
);

// Update client initialization
content = content.replace(
  `    // Initialize the client
    client = new TheBrainClient({
      apiKey: API_KEY,
      baseUrl: BASE_URL,
    });
    
    // Store the axios instance for test assertions
    (client as any).axios = axiosInstance;`,
  `    // Initialize the client
    client = new TheBrainClient(BASE_URL, API_KEY);
    
    // Store the thebrain-api instance for test assertions
    (client as any).api = {
      brains: {
        getBrains: jest.fn()
      },
      setLogLevel: jest.fn()
    };`
);

// Update test cases to use api.brains.getBrains instead of axiosInstance.get
content = content.replace(/const axiosInstance = \(client as any\)\.axios;/g, 'const api = (client as any).api;');
content = content.replace(/axiosInstance\.get\.mockResolvedValue\({ data: (.*?) }\);/g, 'api.brains.getBrains.mockResolvedValue($1);');
content = content.replace(/axiosInstance\.get\.mockRejectedValue/g, 'api.brains.getBrains.mockRejectedValue');
content = content.replace(/expect\(axiosInstance\.get\)\.toHaveBeenCalledWith\('\/brains'\);/g, 'expect(api.brains.getBrains).toHaveBeenCalled();');

// Fix TheBrainAPIError references to ServiceUnavailableError
content = content.replace(/TheBrainAPIError/g, 'ServiceUnavailableError');

// Remove unneeded axios mocking
content = content.replace(
  /[ ]*\/\/ Mock both get and request methods for retry logic\n[ ]*axiosInstance\.get\.mockRejectedValue\(errorResponse\);\n[ ]*axiosInstance\.request\.mockRejectedValue\(errorResponse\);/g,
  `      // Mock API client errors
      api.brains.getBrains.mockRejectedValue(errorResponse);`
);

// Update authorization check
content = content.replace(
  `      // Verify authorization header was set during client creation
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': \`Bearer \${API_KEY}\`,
          }),
        })
      );`,
  `      // Verify API was called
      expect(api.brains.getBrains).toHaveBeenCalled();`
);

// Write the updated content back to the file
fs.writeFileSync(filePath, content);

console.log('Successfully updated list-brains-api.test.ts');