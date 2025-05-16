import { Resource, ResourceTemplate } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { TheBrainClient, Thought, Brain, SearchResult } from '../thebrain';
import { NotFoundError, TheBrainAPIError } from '../utils/error-handler';
import logger from '../utils/logger';

// Resource URI schemas
const BrainsResourceSchema = z.object({
  uri: z.literal('thebrain://brains'),
});

const ThoughtResourceSchema = z.object({
  uri: z.string().regex(/^thebrain:\/\/brains\/[^/]+\/thoughts\/[^/]+$/),
  brainId: z.string(),
  thoughtId: z.string(),
});

const SearchResourceSchema = z.object({
  uri: z.string().regex(/^thebrain:\/\/brains\/[^/]+\/search\?.+$/),
  brainId: z.string(),
  query: z.string(),
  limit: z.number().optional(),
  thoughtTypes: z.array(z.enum(['Normal', 'Type', 'Tag', 'System'])).optional(),
});

const ChildrenResourceSchema = z.object({
  uri: z.string().regex(/^thebrain:\/\/brains\/[^/]+\/thoughts\/[^/]+\/children$/),
  brainId: z.string(),
  thoughtId: z.string(),
});

// Define type for resource templates
type ResourceTemplateMap = Record<string, ResourceTemplate>;

export class TheBrainResourceProvider {
  private client: TheBrainClient;

  constructor(client: TheBrainClient) {
    this.client = client;
  }

  // Get resource templates that describe available resources
  async getResourceTemplates(): Promise<ResourceTemplateMap> {
    return {
      brains: {
        uriTemplate: 'thebrain://brains',
        name: 'Available Brains',
        description: 'List all available brains in your TheBrain account',
        mimeType: 'application/json',
      },
      thought: {
        uriTemplate: 'thebrain://brains/{brainId}/thoughts/{thoughtId}',
        name: 'Get Thought',
        description: 'Retrieve a specific thought by its ID',
        mimeType: 'application/json',
      },
      search: {
        uriTemplate: 'thebrain://brains/{brainId}/search?q={query}&limit={limit}&types={types}',
        name: 'Search Thoughts',
        description: 'Search for thoughts by keywords with optional filters',
        mimeType: 'application/json',
      },
      children: {
        uriTemplate: 'thebrain://brains/{brainId}/thoughts/{thoughtId}/children',
        name: 'Child Thoughts',
        description: 'Get all child thoughts of a specific thought',
        mimeType: 'application/json',
      },
    };
  }

  // Get a specific resource by URI
  async getResource(uri: string): Promise<Resource> {
    logger.info('Fetching resource', { uri });

    try {
      // Handle brains list
      if (uri === 'thebrain://brains') {
        return await this.getBrainsResource();
      }

      // Handle thought resource
      const thoughtMatch = uri.match(/^thebrain:\/\/brains\/([^/]+)\/thoughts\/([^/]+)$/);
      if (thoughtMatch) {
        const [, brainId, thoughtId] = thoughtMatch;
        return await this.getThoughtResource(brainId, thoughtId);
      }

      // Handle search resource
      const searchMatch = uri.match(/^thebrain:\/\/brains\/([^/]+)\/search\?(.+)$/);
      if (searchMatch) {
        const [, brainId, queryParams] = searchMatch;
        return await this.getSearchResource(brainId, queryParams);
      }

      // Handle children resource
      const childrenMatch = uri.match(/^thebrain:\/\/brains\/([^/]+)\/thoughts\/([^/]+)\/children$/);
      if (childrenMatch) {
        const [, brainId, thoughtId] = childrenMatch;
        return await this.getChildrenResource(brainId, thoughtId);
      }

      throw new NotFoundError(`Unknown resource URI: ${uri}`);
    } catch (error) {
      logger.error('Error fetching resource', { uri, error });
      throw error;
    }
  }

  // List all available resources
  async listResources(): Promise<Resource[]> {
    try {
      const brains = await this.client.getBrains();
      const resources: Resource[] = [
        {
          uri: 'thebrain://brains',
          name: 'Available Brains',
          description: 'List of all available brains',
          mimeType: 'application/json',
        },
      ];

      // Add resources for each brain
      for (const brain of brains) {
        resources.push({
          uri: `thebrain://brains/${brain.id}`,
          name: brain.name,
          description: brain.description || 'TheBrain knowledge base',
          mimeType: 'application/json',
        });
      }

      return resources;
    } catch (error) {
      logger.error('Error listing resources', { error });
      throw error;
    }
  }

  // Private helper methods
  private async getBrainsResource(): Promise<Resource> {
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
          brains: brains.map(brain => ({
            id: brain.id,
            name: brain.name,
            description: brain.description,
            createdAt: brain.createdAt,
            updatedAt: brain.updatedAt,
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
      name: thought.name,
      description: thought.label || 'Thought',
      mimeType: 'application/json',
      contents: {
        type: 'text',
        text: JSON.stringify({
          thought: this.formatThought(thought),
          relationships: {
            children: children.map(t => this.formatThought(t)),
            parents: parents.map(t => this.formatThought(t)),
            siblings: siblings.map(t => this.formatThought(t)),
          },
          metadata: {
            thoughtType: thought.thoughtType,
            isActive: thought.isActive,
            isPinned: thought.isPinned,
            createdAt: thought.creationDateTime,
            modifiedAt: thought.modificationDateTime,
          },
        }, null, 2),
      },
    };
  }

  private async getSearchResource(brainId: string, queryParams: string): Promise<Resource> {
    const params = new URLSearchParams(queryParams);
    const query = params.get('q') || '';
    const limit = params.has('limit') ? parseInt(params.get('limit')!) : 50;
    const types = params.get('types')?.split(',') as Array<'Normal' | 'Type' | 'Tag' | 'System'> || undefined;
    
    const searchResult = await this.client.search(brainId, {
      query,
      limit,
      thoughtTypes: types,
    });
    
    return {
      uri: `thebrain://brains/${brainId}/search?${queryParams}`,
      name: `Search: "${query}"`,
      description: `Found ${searchResult.totalCount} results`,
      mimeType: 'application/json',
      contents: {
        type: 'text',
        text: JSON.stringify({
          query,
          totalCount: searchResult.totalCount,
          thoughts: searchResult.thoughts.map(t => this.formatThought(t)),
          links: searchResult.links.map(l => ({
            id: l.id,
            thoughtA: l.thoughtIdA,
            thoughtB: l.thoughtIdB,
            relation: l.relation,
            type: l.linkType,
            strength: l.strength,
          })),
          metadata: {
            limit,
            types,
            resultCount: searchResult.thoughts.length,
          },
        }, null, 2),
      },
    };
  }

  private async getChildrenResource(brainId: string, thoughtId: string): Promise<Resource> {
    const thought = await this.client.getThought(brainId, thoughtId);
    const children = await this.client.getThoughtChildren(brainId, thoughtId);
    
    return {
      uri: `thebrain://brains/${brainId}/thoughts/${thoughtId}/children`,
      name: `Children of "${thought.name}"`,
      description: `${children.length} child thought(s)`,
      mimeType: 'application/json',
      contents: {
        type: 'text',
        text: JSON.stringify({
          parent: this.formatThought(thought),
          children: children.map(t => this.formatThought(t)),
          metadata: {
            parentId: thoughtId,
            parentName: thought.name,
            childCount: children.length,
          },
        }, null, 2),
      },
    };
  }

  // Format thought data for AI consumption
  private formatThought(thought: Thought): any {
    return {
      id: thought.id,
      name: thought.name,
      label: thought.label,
      type: thought.thoughtType,
      color: thought.color,
      icon: thought.icon,
      uri: `thebrain://brains/${thought.brainId}/thoughts/${thought.id}`,
      isActive: thought.isActive,
      isPinned: thought.isPinned,
    };
  }

  // Subscribe to resource changes (if supported)
  async subscribeToResource(uri: string): Promise<void> {
    logger.info('Resource subscription requested', { uri });
    // TheBrain API doesn't currently support real-time subscriptions
    // This would need to be implemented with polling or webhooks
    throw new TheBrainAPIError('Resource subscriptions not currently supported', 501);
  }

  // Unsubscribe from resource changes
  async unsubscribeFromResource(uri: string): Promise<void> {
    logger.info('Resource unsubscription requested', { uri });
    // Not implemented as subscriptions aren't supported
  }

  // Validate resource URI format
  validateResourceUri(uri: string): boolean {
    return (
      uri === 'thebrain://brains' ||
      /^thebrain:\/\/brains\/[^/]+$/.test(uri) ||
      /^thebrain:\/\/brains\/[^/]+\/thoughts\/[^/]+$/.test(uri) ||
      /^thebrain:\/\/brains\/[^/]+\/search\?.+$/.test(uri) ||
      /^thebrain:\/\/brains\/[^/]+\/thoughts\/[^/]+\/(children|parents|siblings)$/.test(uri)
    );
  }
}

// Factory function
export function createResourceProvider(client: TheBrainClient): TheBrainResourceProvider {
  return new TheBrainResourceProvider(client);
}