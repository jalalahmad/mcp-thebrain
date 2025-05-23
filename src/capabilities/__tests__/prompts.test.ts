import { TheBrainPromptProvider } from '../prompts';
import { TheBrainClient } from '../../thebrain';

// Mock dependencies
jest.mock('../../thebrain');
jest.mock('../../utils/logger');

describe('TheBrainPromptProvider', () => {
  let promptProvider: TheBrainPromptProvider;
  let mockClient: jest.Mocked<TheBrainClient>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new TheBrainClient('https://api.bra.in', 'test-key') as jest.Mocked<TheBrainClient>;
    promptProvider = new TheBrainPromptProvider(mockClient);
  });
  
  describe('getPrompts', () => {
    it('should return all available prompts', async () => {
      const prompts = await promptProvider.getPrompts();
      
      expect(prompts).toHaveLength(2);
      expect(prompts.map(p => p.name)).toEqual([
        'search_thoughts',
        'create_structured_thought'
      ]);
      
      // Verify prompt structures
      const searchPrompt = prompts.find(p => p.name === 'search_thoughts');
      expect(searchPrompt).toBeDefined();
      expect(searchPrompt?.description).toContain('Guide for effectively searching');
      expect(searchPrompt?.arguments).toHaveLength(2);
      expect(searchPrompt?.arguments?.[0]).toEqual({
        name: 'query',
        description: 'Search query to find relevant thoughts',
        required: true
      });
      
      const createPrompt = prompts.find(p => p.name === 'create_structured_thought');
      expect(createPrompt).toBeDefined();
      expect(createPrompt?.description).toContain('Guide for creating well-structured thoughts');
      expect(createPrompt?.arguments).toHaveLength(2);
    });
  });
  
  describe('executePrompt', () => {
    describe('search_thoughts', () => {
      it('should generate search guidance with query only', async () => {
        const result = await promptProvider.executePrompt('search_thoughts', {
          query: 'machine learning'
        });
        
        expect(result.content).toContain('Searching for Thoughts in TheBrain');
        expect(result.content).toContain('Query:** "machine learning"');
        expect(result.content).toContain('search_thoughts({');
        expect(result.content).toContain('query: "machine learning"');
        expect(result.content).toContain('Search Strategy');
        expect(result.content).toContain('Analyzing Results');
      });
      
      it('should include context when provided', async () => {
        const result = await promptProvider.executePrompt('search_thoughts', {
          query: 'neural networks',
          context: 'Looking for recent research papers'
        });
        
        expect(result.content).toContain('Query:** "neural networks"');
        expect(result.content).toContain('Context:** Looking for recent research papers');
        expect(result.content).toContain('dateFrom: "2024-01-01"');
      });
    });
    
    describe('create_structured_thought', () => {
      it('should generate creation guidance with topic only', async () => {
        const result = await promptProvider.executePrompt('create_structured_thought', {
          topic: 'Quantum Computing Basics'
        });
        
        expect(result.content).toContain('Creating a Well-Structured Thought');
        expect(result.content).toContain('Topic:** "Quantum Computing Basics"');
        expect(result.content).toContain('Purpose:** general knowledge capture');
        expect(result.content).toContain('Suggested name:** "Quantum Computing Basics"');
        expect(result.content).toContain('create_thought({');
        expect(result.content).toContain('name: "Quantum Computing Basics"');
        expect(result.content).toContain('Thought Structure Guidelines');
      });
      
      it('should include purpose when provided', async () => {
        const result = await promptProvider.executePrompt('create_structured_thought', {
          topic: 'Project Timeline',
          purpose: 'tracking development milestones'
        });
        
        expect(result.content).toContain('Topic:** "Project Timeline"');
        expect(result.content).toContain('Purpose:** tracking development milestones');
        expect(result.content).toContain('type: "Normal"');
      });
      
      it('should generate appropriate tags', async () => {
        const result = await promptProvider.executePrompt('create_structured_thought', {
          topic: 'Research Project on AI Ethics'
        });
        
        expect(result.content).toContain('tags: [');
        expect(result.content).toContain('"research"');
        expect(result.content).toContain('"project"');
      });
    });
    
    it('should throw error for unknown prompt', async () => {
      await expect(
        promptProvider.executePrompt('unknown_prompt', {})
      ).rejects.toThrow('Unknown prompt: unknown_prompt');
    });
  });
  
  describe('Helper methods', () => {
    it('should generate thought names correctly', async () => {
      // Test by executing a prompt and checking the generated name
      const result = await promptProvider.executePrompt('create_structured_thought', {
        topic: 'advanced machine learning techniques'
      });
      
      expect(result.content).toContain('Suggested name:** "Advanced Machine Learning"');
    });
    
    it('should generate appropriate tags for different topics', async () => {
      // Test research-related topic
      const researchResult = await promptProvider.executePrompt('create_structured_thought', {
        topic: 'Deep Learning Research Study'
      });
      expect(researchResult.content).toContain('"research"');
      
      // Test project-related topic
      const projectResult = await promptProvider.executePrompt('create_structured_thought', {
        topic: 'Web Development Project Plan'
      });
      expect(projectResult.content).toContain('"project"');
      
      // Test idea-related topic
      const ideaResult = await promptProvider.executePrompt('create_structured_thought', {
        topic: 'New App Idea Concept'
      });
      expect(ideaResult.content).toContain('"idea"');
      
      // Test general topic
      const generalResult = await promptProvider.executePrompt('create_structured_thought', {
        topic: 'Note'
      });
      expect(generalResult.content).toContain('"note"');
    });
  });
});