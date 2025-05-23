import { Prompt } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { TheBrainClient } from '../thebrain/index.js';
import logger from '../utils/logger';

export class TheBrainPromptProvider {
  private client: any;
  
  constructor(client: any) {
    this.client = client;
  }
  
  async getPrompts(): Promise<Prompt[]> {
    return [
      {
        name: 'search_thoughts',
        description: 'Guide for effectively searching thoughts in TheBrain',
        arguments: [
          {
            name: 'query',
            description: 'Search query to find relevant thoughts',
            required: true
          },
          {
            name: 'context',
            description: 'Additional context about what you\'re looking for',
            required: false
          }
        ]
      },
      {
        name: 'create_structured_thought',
        description: 'Guide for creating well-structured thoughts with proper metadata',
        arguments: [
          {
            name: 'topic',
            description: 'The main topic or subject of the thought',
            required: true
          },
          {
            name: 'purpose',
            description: 'The purpose or intent of creating this thought',
            required: false
          }
        ]
      }
    ];
  }
  
  async executePrompt(name: string, args: Record<string, string>): Promise<{ content: string }> {
    logger.info(`Executing prompt ${name} with args:`, args);
    
    switch (name) {
      case 'search_thoughts':
        return this.searchThoughtsPrompt(args);
      case 'create_structured_thought':
        return this.createStructuredThoughtPrompt(args);
      default:
        logger.error(`Unknown prompt: ${name}`);
        throw new Error(`Unknown prompt: ${name}`);
    }
  }
  
  private async searchThoughtsPrompt(args: Record<string, string>): Promise<{ content: string }> {
    const query = args.query;
    const context = args.context || '';
    
    const guidance = `# Searching for Thoughts in TheBrain

## Your Search Query
**Query:** "${query}"
${context ? `**Context:** ${context}` : ''}

## Search Strategy

1. **Start with exact matches**: Look for thoughts that contain the exact phrase "${query}"
2. **Broaden to related terms**: If exact matches are limited, search for related concepts
3. **Use filters effectively**:
   - Filter by date if looking for recent or historical information
   - Filter by type if you know what kind of thought you're looking for
   - Use tag filters to narrow down by category

## Recommended Search Actions

### Initial Search
\`\`\`
search_thoughts({
  query: "${query}",
  includeArchived: false,
  limit: 20
})
\`\`\`

### If few results, try broader search
\`\`\`
search_thoughts({
  query: "${query.split(' ').slice(0, 2).join(' ')}",
  searchNotes: true,
  includeArchived: true,
  limit: 30
})
\`\`\`

### For specific time periods
\`\`\`
search_thoughts({
  query: "${query}",
  dateFrom: "2024-01-01",
  dateTo: "2024-12-31"
})
\`\`\`

## Analyzing Results

When reviewing search results:
1. Check the **name** and **notes** fields for relevance
2. Look at **tags** to understand categorization
3. Review **modificationDateTime** for recency
4. Consider **linkCount** - highly connected thoughts are often important

## Next Steps

After finding relevant thoughts:
1. Use \`get_thought\` to view full details
2. Explore connections with \`get_children\`
3. Consider creating new thoughts to link related concepts
4. Update existing thoughts with new insights

Remember: TheBrain is about connections as much as content. Don't just search - explore the network of related thoughts!
`;
    
    return { content: guidance };
  }
  
  private async createStructuredThoughtPrompt(args: Record<string, string>): Promise<{ content: string }> {
    const topic = args.topic;
    const purpose = args.purpose || 'general knowledge capture';
    
    const guidance = `# Creating a Well-Structured Thought in TheBrain

## Your New Thought
**Topic:** "${topic}"
**Purpose:** ${purpose}

## Thought Structure Guidelines

### 1. Choose a Clear, Descriptive Name
- Keep it concise but informative (2-5 words)
- Use title case for better readability
- Avoid generic terms like "Notes" or "Ideas"

**Suggested name:** "${topic.split(' ').slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}"

### 2. Write Comprehensive Notes
Structure your notes with:
- **Overview**: Brief summary of the concept
- **Key Points**: Bullet points for main ideas
- **Details**: Expanded information as needed
- **References**: Links to sources or related materials

\`\`\`markdown
# ${topic}

## Overview
[Brief description of ${topic}]

## Key Points
- Point 1
- Point 2
- Point 3

## Details
[Expanded information]

## References
- Source 1
- Source 2
\`\`\`

### 3. Set Appropriate Type
Choose the thought type that best fits:
- **Type.Normal**: General concepts or topics
- **Type.Task**: Action items or to-dos
- **Type.Event**: Time-specific occurrences
- **Type.Person**: Individual contacts
- **Type.Project**: Multi-step initiatives

### 4. Add Relevant Tags
Tags help with organization and discovery:
- Keep tags lowercase and hyphenated
- Use 2-5 specific tags
- Include both broad and narrow categories

**Suggested tags for "${topic}":**
${this.generateSuggestedTags(topic)}

### 5. Consider Parent-Child Relationships
- **Parent thought**: What broader category does this belong to?
- **Potential children**: What subtopics might branch from this?
- **Related thoughts**: What existing thoughts should this connect to?

## Implementation Example

\`\`\`javascript
create_thought({
  name: "${this.generateThoughtName(topic)}",
  notes: \`# ${topic}

## Overview
${purpose}

## Key Information
- [Add key points here]

## Next Steps
- [Add action items if applicable]
\`,
  type: "Normal",
  label: null,
  tags: ${JSON.stringify(this.generateSuggestedTags(topic))},
  parentThoughtId: null  // Set this if you have a parent thought
})
\`\`\`

## After Creating

1. **Review and refine**: Update the notes with more details as needed
2. **Create connections**: Link to related existing thoughts
3. **Add children**: Break down complex topics into subtopics
4. **Set reminders**: For time-sensitive thoughts, add activation dates

Remember: A well-structured thought is easy to find, understand, and connect!
`;
    
    return { content: guidance };
  }
  
  private generateThoughtName(topic: string): string {
    const words = topic.split(' ').slice(0, 4);
    return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }
  
  private generateSuggestedTags(topic: string): string[] {
    const topicLower = topic.toLowerCase();
    const tags: string[] = [];
    
    // Add general category tags
    if (topicLower.includes('project') || topicLower.includes('plan')) {
      tags.push('project');
    }
    if (topicLower.includes('research') || topicLower.includes('study')) {
      tags.push('research');
    }
    if (topicLower.includes('idea') || topicLower.includes('concept')) {
      tags.push('idea');
    }
    
    // Add specific tags from the topic
    const words = topicLower.split(' ')
      .filter(word => word.length > 3)
      .slice(0, 2);
    
    words.forEach(word => {
      if (!tags.includes(word)) {
        tags.push(word);
      }
    });
    
    // If we don't have enough tags, add a general one
    if (tags.length === 0) {
      tags.push('general');
    }
    
    return tags.slice(0, 5); // Limit to 5 tags
  }
}