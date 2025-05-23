import { z } from 'zod';
import { Resource } from '@modelcontextprotocol/sdk/types';
import { TheBrainClient } from '../thebrain';
import logger from '../utils/logger';
import { ServiceUnavailableError } from '../utils/error-handler';

export class TheBrainResourceProvider {
  private client: any;
  
  constructor(client: any) {
    this.client = client;
  }

  async handle(request: any): Promise<{ resources: Resource[] }> {
    const validated = z.object({
      method: z.string(),
      arguments: z.any()
    }).parse(request);

    if (validated.method === 'list') {
      const args = z.object({ uri: z.string() }).parse(validated.arguments);
      return {
        resources: await this._listResources(args.uri)
      };
    }

    if (validated.method === 'read') {
      const args = z.object({ uri: z.string() }).parse(validated.arguments);
      return {
        resources: [await this.readResource(args.uri)]
      };
    }

    throw new Error(`Unsupported method: ${validated.method}`);
  }
  
  // Public API methods for the MCP framework
  async listResources(): Promise<Resource[]> {
    return this.listResourceTemplates();
  }
  
  async getResource(uri: string): Promise<Resource> {
    return this.readResource(uri);
  }

  async listResourceTemplates(): Promise<any[]> {
    return [
      {
        type: 'template',
        uriTemplate: 'thebrain://brains',
        name: 'List Brains',
        description: 'List all available brains',
        mimeType: 'application/json',
      },
      {
        type: 'template',
        uriTemplate: 'thebrain://brains/{brainId}',
        name: 'Brain Details',
        description: 'Get details of a specific brain',
        mimeType: 'application/json',
      },
      {
        type: 'template',
        uriTemplate: 'thebrain://brains/{brainId}/thoughts/{thoughtId}',
        name: 'Thought Details',
        description: 'Get details of a specific thought',
        mimeType: 'application/json',
      },
      {
        type: 'template',
        uriTemplate: 'thebrain://brains/{brainId}/thoughts/{thoughtId}/children',
        name: 'Thought Children',
        description: 'List children of a thought',
        mimeType: 'application/json',
      },
      {
        type: 'template',
        uriTemplate: 'thebrain://brains/{brainId}/thoughts/{thoughtId}/parents',
        name: 'Thought Parents',
        description: 'List parents of a thought',
        mimeType: 'application/json',
      },
      {
        type: 'template',
        uriTemplate: 'thebrain://brains/{brainId}/thoughts/{thoughtId}/siblings',
        name: 'Thought Siblings',
        description: 'List siblings of a thought',
        mimeType: 'application/json',
      },
      {
        type: 'template',
        uriTemplate: 'thebrain://brains/{brainId}/search/{query}',
        name: 'Search Thoughts',
        description: 'Search for thoughts in a brain',
        mimeType: 'application/json',
      },
      {
        type: 'template',
        uriTemplate: 'thebrain://brains/{brainId}/tags',
        name: 'Brain Tags',
        description: 'List all tags in a brain',
        mimeType: 'application/json',
      },
      {
        type: 'template',
        uriTemplate: 'thebrain://brains/{brainId}/types',
        name: 'Brain Types',
        description: 'List all thought types in a brain',
        mimeType: 'application/json',
      },
      {
        type: 'template',
        uriTemplate: 'thebrain://brains/{brainId}/thoughts/{thoughtId}/notes',
        name: 'Thought Notes',
        description: 'Get notes for a thought',
        mimeType: 'text/markdown',
      },
      {
        type: 'template',
        uriTemplate: 'thebrain://brains/{brainId}/thoughts/{thoughtId}/attachments',
        name: 'Thought Attachments',
        description: 'List attachments for a thought',
        mimeType: 'application/json',
      },
      {
        type: 'template',
        uriTemplate: 'thebrain://brains/{brainId}/statistics',
        name: 'Brain Statistics',
        description: 'Get statistics for a brain',
        mimeType: 'application/json',
      },
      {
        type: 'template',
        uriTemplate: 'thebrain://brains/{brainId}/thoughts/{thoughtId}/graph',
        name: 'Thought Graph',
        description: 'Get graph data for a thought and its connections',
        mimeType: 'application/json',
      }
    ];
  }

  private async _listResources(uri: string): Promise<Resource[]> {
    const match = uri.match(/^thebrain:\/\/(brains|search)/);
    if (!match) {
      throw new Error(`Invalid URI format: ${uri}`);
    }

    const [_, type] = match;

    if (type === 'brains') {
      const brains = await this.client.getBrains();
      return brains.map((brain: any) => ({
        uri: `thebrain://brains/${brain.id}`,
        name: brain.name || brain.id,
        description: 'Brain',
        mimeType: 'application/json',
      }));
    }

    return [];
  }

  private async readResource(uri: string): Promise<Resource> {
    logger.info('Reading resource', { uri });
    
    const segments = uri.replace('thebrain://', '').split('/');
    
    try {
      if (segments[0] === 'brains') {
        if (segments.length === 1) {
          return await this.getAllBrainsResource();
        }
        
        const brainId = segments[1];
        
        if (segments.length === 2) {
          return await this.getBrainResource(brainId);
        }
        
        if (segments[2] === 'thoughts' && segments[3]) {
          const thoughtId = segments[3];
          
          if (segments.length === 4) {
            return await this.getThoughtResource(brainId, thoughtId);
          }
          
          if (segments[4] === 'children') {
            return await this.getThoughtChildrenResource(brainId, thoughtId);
          }
          
          if (segments[4] === 'parents') {
            return await this.getThoughtParentsResource(brainId, thoughtId);
          }
          
          if (segments[4] === 'siblings') {
            return await this.getThoughtSiblingsResource(brainId, thoughtId);
          }
          
          if (segments[4] === 'notes') {
            return await this.getNotesResource(brainId, thoughtId);
          }
          
          if (segments[4] === 'attachments') {
            return await this.getAttachmentsResource(brainId, thoughtId);
          }
          
          if (segments[4] === 'graph') {
            return await this.getGraphResource(brainId, thoughtId);
          }
        }
        
        if (segments[2] === 'search' && segments[3]) {
          const query = decodeURIComponent(segments[3]);
          return await this.getSearchResource(brainId, query);
        }
        
        if (segments[2] === 'tags') {
          return await this.getTagsResource(brainId);
        }
        
        if (segments[2] === 'types') {
          return await this.getTypesResource(brainId);
        }
        
        if (segments[2] === 'statistics') {
          return await this.getStatisticsResource(brainId);
        }
      }
      
      throw new Error(`Invalid resource URI: ${uri}`);
    } catch (error) {
      throw new ServiceUnavailableError(
        'Failed to read resource',
        { uri, error: error instanceof Error ? error.message : String(error) },
        'Could not retrieve the requested resource. Please try again.'
      );
    }
  }

  private formatThought(thought: any): any {
    return {
      id: thought.id,
      name: thought.name || '',
      label: thought.label,
      color: thought.foregroundColor,
      backgroundColor: thought.backgroundColor,
      kind: thought.kind,
      createdAt: thought.creationDateTime,
      modifiedAt: thought.modificationDateTime,
    };
  }

  private formatAttachment(attachment: any): any {
    return {
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      size: attachment.dataLength,
      location: attachment.location,
      createdAt: attachment.creationDateTime,
      modifiedAt: attachment.modificationDateTime,
    };
  }

  private formatSearchResult(result: any): any {
    return {
      thought: this.formatThought(result.thought),
      brain: {
        id: result.brainId,
        name: result.brainName,
      },
      score: result.score,
      highlights: result.highlights,
    };
  }

  private async getAllBrainsResource(): Promise<Resource> {
    const brains = await this.client.getBrains();
    
    return {
      uri: 'thebrain://brains',
      name: 'Available Brains',
      description: `Found ${brains.length} brain(s)`,
      mimeType: 'application/json',
      contents: {
        type: 'text',
        text: JSON.stringify({
          count: brains.length,
          brains: brains.map((brain: any) => ({
            id: brain.id,
            name: brain.name || 'Unnamed Brain',
            homeThoughtId: brain.homeThoughtId,
            uri: `thebrain://brains/${brain.id}`,
          })),
        }, null, 2),
      },
    };
  }

  private async getThoughtResource(brainId: string, thoughtId: string): Promise<Resource> {
    const thought = await this.client.getThought(brainId, thoughtId);
    
    // Get related information
    const [children, parents, siblings] = await Promise.all([
      this.client.getThoughtChildren(brainId, thoughtId).catch(() => []),
      this.client.getThoughtParents(brainId, thoughtId).catch(() => []),
      this.client.getThoughtSiblings(brainId, thoughtId).catch(() => []),
    ]);
    
    return {
      uri: `thebrain://brains/${brainId}/thoughts/${thoughtId}`,
      name: thought.name || thought.id || 'Unnamed',
      description: thought.label || 'Thought',
      mimeType: 'application/json',
      contents: {
        type: 'text',
        text: JSON.stringify({
          thought: this.formatThought(thought),
          relationships: {
            children: children.map((t: any) => this.formatThought(t)),
            parents: parents.map((t: any) => this.formatThought(t)),
            siblings: siblings.map((t: any) => this.formatThought(t)),
          },
          metadata: {
            kind: thought.kind,
            acType: thought.acType,
            createdAt: thought.creationDateTime,
            modifiedAt: thought.modificationDateTime,
          },
        }, null, 2),
      },
    };
  }

  private async getBrainResource(brainId: string): Promise<Resource> {
    const brain = await this.client.getBrain(brainId);
    
    return {
      uri: `thebrain://brains/${brainId}`,
      name: brain.name || brain.id,
      description: `Brain ID: ${brainId}`,
      mimeType: 'application/json',
      contents: {
        type: 'text',
        text: JSON.stringify({
          id: brain.id,
          name: brain.name,
          homeThoughtId: brain.homeThoughtId,
        }, null, 2),
      },
    };
  }

  private async getThoughtChildrenResource(brainId: string, thoughtId: string): Promise<Resource> {
    const [thought, children] = await Promise.all([
      this.client.getThought(brainId, thoughtId),
      this.client.getThoughtChildren(brainId, thoughtId),
    ]);
    
    return {
      uri: `thebrain://brains/${brainId}/thoughts/${thoughtId}/children`,
      name: 'Thought Children',
      description: `Children of "${thought.name || thought.id}"`,
      mimeType: 'application/json',
      contents: {
        type: 'text',
        text: JSON.stringify({
          parentThought: this.formatThought(thought),
          children: children.map((child: any) => this.formatThought(child)),
          count: children.length,
        }, null, 2),
      },
    };
  }

  private async getThoughtParentsResource(brainId: string, thoughtId: string): Promise<Resource> {
    const [thought, parents] = await Promise.all([
      this.client.getThought(brainId, thoughtId),
      this.client.getThoughtParents(brainId, thoughtId),
    ]);
    
    return {
      uri: `thebrain://brains/${brainId}/thoughts/${thoughtId}/parents`,
      name: 'Thought Parents',
      description: `Parents of "${thought.name || thought.id}"`,
      mimeType: 'application/json',
      contents: {
        type: 'text',
        text: JSON.stringify({
          childThought: this.formatThought(thought),
          parents: parents.map((parent: any) => this.formatThought(parent)),
          count: parents.length,
        }, null, 2),
      },
    };
  }

  private async getThoughtSiblingsResource(brainId: string, thoughtId: string): Promise<Resource> {
    const [thought, siblings] = await Promise.all([
      this.client.getThought(brainId, thoughtId),
      this.client.getThoughtSiblings(brainId, thoughtId),
    ]);
    
    return {
      uri: `thebrain://brains/${brainId}/thoughts/${thoughtId}/siblings`,
      name: 'Thought Siblings',
      description: `Siblings of "${thought.name || thought.id}"`,
      mimeType: 'application/json',
      contents: {
        type: 'text',
        text: JSON.stringify({
          thought: this.formatThought(thought),
          siblings: siblings.map((sibling: any) => this.formatThought(sibling)),
          count: siblings.length,
        }, null, 2),
      },
    };
  }

  private async getSearchResource(brainId: string, query: string): Promise<Resource> {
    const result = await this.client.search(brainId, query);
    
    const resultData = result as any;
    const thoughts = resultData.thoughts || [];
    
    return {
      uri: `thebrain://brains/${brainId}/search/${encodeURIComponent(query)}`,
      name: 'Search Results',
      description: `Found ${thoughts.length} results for "${query}"`,
      mimeType: 'application/json',
      contents: {
        type: 'text',
        text: JSON.stringify({
          query,
          count: thoughts.length,
          thoughts: thoughts.map((t: any) => this.formatThought(t)),
        }, null, 2),
      },
    };
  }

  private async getTagsResource(brainId: string): Promise<Resource> {
    const tags = await this.client.getTags(brainId);
    
    return {
      uri: `thebrain://brains/${brainId}/tags`,
      name: 'Brain Tags',
      description: `Found ${tags.length} tags`,
      mimeType: 'application/json',
      contents: {
        type: 'text',
        text: JSON.stringify({
          brainId,
          count: tags.length,
          tags: tags.map((tag: any) => this.formatThought(tag)),
        }, null, 2),
      },
    };
  }

  private async getTypesResource(brainId: string): Promise<Resource> {
    const types = await this.client.getTypes(brainId);
    
    return {
      uri: `thebrain://brains/${brainId}/types`,
      name: 'Brain Types',
      description: `Found ${types.length} thought types`,
      mimeType: 'application/json',
      contents: {
        type: 'text',
        text: JSON.stringify({
          brainId,
          count: types.length,
          types: types.map((type: any) => this.formatThought(type)),
        }, null, 2),
      },
    };
  }

  private async getNotesResource(brainId: string, thoughtId: string): Promise<Resource> {
    const notes = await this.client.getNotes(brainId, thoughtId);
    const thought = await this.client.getThought(brainId, thoughtId);
    
    return {
      uri: `thebrain://brains/${brainId}/thoughts/${thoughtId}/notes`,
      name: 'Thought Notes',
      description: `Notes for thought: ${thought.name || thought.id}`,
      mimeType: 'text/markdown',
      contents: {
        brainId,
        thoughtId,
        thoughtName: thought.name || thought.id,
        markdown: notes.content || '',
        modifiedAt: notes.metadata?.modificationDateTime,
      },
    };
  }

  private async getAttachmentsResource(brainId: string, thoughtId: string): Promise<Resource> {
    const [thought, attachments] = await Promise.all([
      this.client.getThought(brainId, thoughtId),
      this.client.getThoughtAttachments(brainId, thoughtId),
    ]);
    
    return {
      uri: `thebrain://brains/${brainId}/thoughts/${thoughtId}/attachments`,
      name: 'Thought Attachments',
      description: `Attachments for "${thought.name || thought.id}"`,
      mimeType: 'application/json',
      contents: {
        type: 'text',
        text: JSON.stringify({
          thought: this.formatThought(thought),
          attachments: attachments.map((att: any) => this.formatAttachment(att)),
          count: attachments.length,
        }, null, 2),
      },
    };
  }

  private async getStatisticsResource(brainId: string): Promise<Resource> {
    const [brain, stats] = await Promise.all([
      this.client.getBrain(brainId),
      this.client.getBrainStatistics(brainId),
    ]);
    
    return {
      uri: `thebrain://brains/${brainId}/statistics`,
      name: 'Brain Statistics',
      description: `Statistics for "${brain.name || brain.id}"`,
      mimeType: 'application/json',
      contents: {
        type: 'text',
        text: JSON.stringify({
          brainId,
          brainName: brain.name,
          statistics: stats,
        }, null, 2),
      },
    };
  }

  private async getGraphResource(brainId: string, thoughtId: string): Promise<Resource> {
    const [thought, graph] = await Promise.all([
      this.client.getThought(brainId, thoughtId),
      this.client.getThoughtGraph(brainId, thoughtId),
    ]);
    
    return {
      uri: `thebrain://brains/${brainId}/thoughts/${thoughtId}/graph`,
      name: 'Thought Graph',
      description: `Graph data for "${thought.name || thought.id}"`,
      mimeType: 'application/json',
      contents: {
        brainId,
        thoughtId,
        thoughtName: thought.name,
        graph: {
          activeThought: graph.activeThought ? this.formatThought(graph.activeThought) : null,
          parents: (graph.parents || []).map((t: any) => this.formatThought(t)),
          children: (graph.children || []).map((t: any) => this.formatThought(t)),
          siblings: (graph.siblings || []).map((t: any) => this.formatThought(t)),
          links: graph.links || [],
          nodeCount: (graph.parents?.length || 0) + (graph.children?.length || 0) + (graph.siblings?.length || 0) + 1,
          edgeCount: graph.links?.length || 0,
        },
      },
    };
  }
}

// Factory function
export function createResourceProvider(client: TheBrainClient): TheBrainResourceProvider {
  return new TheBrainResourceProvider(client);
}