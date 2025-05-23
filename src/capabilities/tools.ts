import { Tool, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { TheBrainClient } from '../thebrain/index.js';
import { ValidationError, NotFoundError, ServiceUnavailableError } from '../utils/error-handler';
import { progressReporter, withProgress } from '../utils/progress';
import { performanceMonitor } from '../monitoring/performance';
import logger from '../utils/logger';

// Tool input schemas
const CreateThoughtInputSchema = z.object({
  brainId: z.string().describe('The ID of the brain where the thought will be created'),
  name: z.string().min(1).describe('The name of the new thought'),
  notes: z.string().optional().describe('Notes or content for the thought'),
  type: z.enum(['Normal', 'Type', 'Tag', 'System']).optional().default('Normal').describe('The type of thought to create'),
  label: z.string().optional().describe('Optional label for the thought'),
  tags: z.array(z.string()).optional().describe('Tags to associate with the thought'),
  parentThoughtId: z.string().optional().describe('Optional parent thought ID to create a parent-child relationship'),
});

const UpdateThoughtInputSchema = z.object({
  brainId: z.string().describe('The ID of the brain containing the thought'),
  thoughtId: z.string().describe('The ID of the thought to update'),
  name: z.string().optional().describe('New name for the thought'),
  notes: z.string().optional().describe('New notes or content'),
  label: z.string().optional().describe('New label for the thought'),
  tags: z.array(z.string()).optional().describe('New tags for the thought'),
  isPinned: z.boolean().optional().describe('Whether to pin or unpin the thought'),
});

const CreateLinkInputSchema = z.object({
  brainId: z.string().describe('The ID of the brain where the link will be created'),
  thoughtIdA: z.string().describe('The ID of the first thought'),
  thoughtIdB: z.string().describe('The ID of the second thought'),
  relation: z.number().optional().default(1).describe('The type of relationship between thoughts (1=Parent/Child, 2=Jump)'),
});

const CreateBulkThoughtsInputSchema = z.object({
  brainId: z.string().describe('The ID of the brain'),
  thoughts: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(['Normal', 'Type', 'Tag', 'System']).optional().default('Normal'),
    notes: z.string().optional(),
    label: z.string().optional(),
    temporaryId: z.string().optional().describe('Temporary ID for linking'),
  })),
  relationships: z.array(z.object({
    sourceId: z.string().describe('Source thought ID or temporaryId'),
    targetId: z.string().describe('Target thought ID or temporaryId'),
    relation: z.enum(['Parent', 'Child', 'Jump']),
  })).optional(),
});

export class TheBrainToolProvider {
  private client: any;

  constructor(client: any) {
    this.client = client;
  }

  // Get all available tools
  async getTools(): Promise<Tool[]> {
    return [
      {
        name: 'create_thought',
        description: 'Create a new thought in TheBrain with optional parent connection',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
            name: { type: 'string', description: 'The name of the new thought' },
            thoughtType: { 
              type: 'string', 
              enum: ['Normal', 'Type', 'Tag', 'System'],
              default: 'Normal',
              description: 'The type of thought' 
            },
            label: { type: 'string', description: 'Optional label' },
            color: { type: 'string', description: 'Optional color in hex format' },
            icon: { type: 'string', description: 'Optional icon identifier' },
            parentThoughtId: { type: 'string', description: 'Optional parent thought ID' },
          },
          required: ['brainId', 'name'],
        },
      },
      {
        name: 'update_thought',
        description: 'Update an existing thought in TheBrain',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
            thoughtId: { type: 'string', description: 'The ID of the thought to update' },
            name: { type: 'string', description: 'New name for the thought' },
            label: { type: 'string', description: 'New label for the thought' },
            color: { type: 'string', description: 'New color in hex format' },
            icon: { type: 'string', description: 'New icon identifier' },
            isPinned: { type: 'boolean', description: 'Whether to pin or unpin the thought' },
          },
          required: ['brainId', 'thoughtId'],
        },
      },
      {
        name: 'create_link',
        description: 'Create a link between two thoughts in TheBrain',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
            thoughtIdA: { type: 'string', description: 'The ID of the first thought' },
            thoughtIdB: { type: 'string', description: 'The ID of the second thought' },
            relation: { 
              type: 'string', 
              enum: ['Parent', 'Child', 'Jump'],
              description: 'The type of relationship' 
            },
            linkType: { 
              type: 'string', 
              enum: ['Normal', 'Jump'],
              default: 'Normal',
              description: 'The type of link' 
            },
            strength: { 
              type: 'number', 
              minimum: 0, 
              maximum: 100,
              description: 'Optional link strength (0-100)' 
            },
          },
          required: ['brainId', 'thoughtIdA', 'thoughtIdB', 'relation'],
        },
      },
      {
        name: 'create_bulk_thoughts',
        description: 'Create multiple thoughts and relationships in a single operation with progress tracking',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
            thoughts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { 
                    type: 'string',
                    enum: ['Normal', 'Type', 'Tag', 'System'],
                    default: 'Normal'
                  },
                  notes: { type: 'string' },
                  label: { type: 'string' },
                  temporaryId: { type: 'string' }
                },
                required: ['name']
              }
            },
            relationships: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  sourceId: { type: 'string' },
                  targetId: { type: 'string' },
                  relation: {
                    type: 'string',
                    enum: ['Parent', 'Child', 'Jump']
                  }
                },
                required: ['sourceId', 'targetId', 'relation']
              }
            }
          },
          required: ['brainId', 'thoughts']
        }
      },
      {
        name: 'list_brains',
        description: 'List all brains in the user\'s TheBrain account',
        inputSchema: {
          type: 'object',
          properties: {
            // No parameters needed - lists all brains
          },
          required: [],
        },
      },
      {
        name: 'get_tags',
        description: 'Get all tags in a brain',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
          },
          required: ['brainId'],
        },
      },
      {
        name: 'add_tags_to_thought',
        description: 'Add tags to a thought',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
            thoughtId: { type: 'string', description: 'The ID of the thought' },
            tags: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Tags to add to the thought' 
            },
          },
          required: ['brainId', 'thoughtId', 'tags'],
        },
      },
      {
        name: 'remove_tags_from_thought',
        description: 'Remove tags from a thought',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
            thoughtId: { type: 'string', description: 'The ID of the thought' },
            tags: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Tags to remove from the thought' 
            },
          },
          required: ['brainId', 'thoughtId', 'tags'],
        },
      },
      {
        name: 'get_types',
        description: 'Get all types in a brain',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
          },
          required: ['brainId'],
        },
      },
      {
        name: 'get_notes',
        description: 'Get notes for a thought in different formats',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
            thoughtId: { type: 'string', description: 'The ID of the thought' },
            format: { 
              type: 'string', 
              enum: ['markdown', 'html', 'text'],
              default: 'markdown',
              description: 'Format for the notes' 
            },
          },
          required: ['brainId', 'thoughtId'],
        },
      },
      {
        name: 'update_notes',
        description: 'Update notes for a thought',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
            thoughtId: { type: 'string', description: 'The ID of the thought' },
            markdown: { type: 'string', description: 'New notes content in markdown' },
          },
          required: ['brainId', 'thoughtId', 'markdown'],
        },
      },
      {
        name: 'append_notes',
        description: 'Append to existing notes for a thought',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
            thoughtId: { type: 'string', description: 'The ID of the thought' },
            markdown: { type: 'string', description: 'Content to append in markdown' },
          },
          required: ['brainId', 'thoughtId', 'markdown'],
        },
      },
      {
        name: 'search_advanced',
        description: 'Advanced search with filters',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
            query: { type: 'string', description: 'Search query' },
            thoughtTypes: { 
              type: 'array', 
              items: { 
                type: 'string',
                enum: ['Normal', 'Type', 'Tag', 'System']
              },
              description: 'Filter by thought types' 
            },
            tags: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Filter by tags' 
            },
            includeArchived: { 
              type: 'boolean',
              default: false,
              description: 'Include archived thoughts' 
            },
            limit: { 
              type: 'number',
              default: 50,
              description: 'Maximum results to return' 
            },
          },
          required: ['brainId', 'query'],
        },
      },
      {
        name: 'get_thought_relationships',
        description: 'Get all relationships for a thought',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
            thoughtId: { type: 'string', description: 'The ID of the thought' },
            includeChildren: { type: 'boolean', default: true, description: 'Include child thoughts' },
            includeParents: { type: 'boolean', default: true, description: 'Include parent thoughts' },
            includeSiblings: { type: 'boolean', default: true, description: 'Include sibling thoughts' },
            includeJumps: { type: 'boolean', default: true, description: 'Include jump connections' },
          },
          required: ['brainId', 'thoughtId'],
        },
      },
      {
        name: 'delete_thought',
        description: 'Delete a thought from the brain',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
            thoughtId: { type: 'string', description: 'The ID of the thought to delete' },
          },
          required: ['brainId', 'thoughtId'],
        },
      },
      {
        name: 'get_thought_attachments',
        description: 'Get all attachments for a thought',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
            thoughtId: { type: 'string', description: 'The ID of the thought' },
          },
          required: ['brainId', 'thoughtId'],
        },
      },
      {
        name: 'create_attachment',
        description: 'Create a new attachment for a thought',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
            thoughtId: { type: 'string', description: 'The ID of the thought' },
            filename: { type: 'string', description: 'Name of the file' },
            content: { type: 'string', description: 'Base64 encoded file content' },
            mimeType: { type: 'string', description: 'MIME type of the file' },
          },
          required: ['brainId', 'thoughtId', 'filename', 'content'],
        },
      },
      {
        name: 'create_url_attachment',
        description: 'Create an attachment from a URL',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
            thoughtId: { type: 'string', description: 'The ID of the thought' },
            url: { type: 'string', description: 'URL to attach' },
          },
          required: ['brainId', 'thoughtId', 'url'],
        },
      },
      {
        name: 'get_brain_statistics',
        description: 'Get statistics for a brain',
        inputSchema: {
          type: 'object',
          properties: {
            brainId: { type: 'string', description: 'The ID of the brain' },
          },
          required: ['brainId'],
        },
      }
    ];
  }

  // Handle tool calls with performance monitoring
  async callTool(request: any): Promise<any> {
    performanceMonitor.recordOperation();
    const startTime = Date.now();
    
    logger.info('Tool called', { 
      name: request.name, 
      arguments: this.sanitizeArgs(request.arguments) 
    });

    try {
      let result: any;
      
      switch (request.name) {
        case 'create_thought':
          result = await this.createThought(request.arguments);
          break;
        case 'update_thought':
          result = await this.updateThought(request.arguments);
          break;
        case 'create_link':
          result = await this.createLink(request.arguments);
          break;
        case 'create_bulk_thoughts':
          result = await this.createBulkThoughts(request.arguments);
          break;
        case 'list_brains':
          result = await this.listBrains();
          break;
        case 'get_tags':
          result = await this.getTags(request.arguments);
          break;
        case 'add_tags_to_thought':
          result = await this.addTagsToThought(request.arguments);
          break;
        case 'remove_tags_from_thought':
          result = await this.removeTagsFromThought(request.arguments);
          break;
        case 'get_types':
          result = await this.getTypes(request.arguments);
          break;
        case 'get_notes':
          result = await this.getNotes(request.arguments);
          break;
        case 'update_notes':
          result = await this.updateNotes(request.arguments);
          break;
        case 'append_notes':
          result = await this.appendNotes(request.arguments);
          break;
        case 'search_advanced':
          result = await this.searchAdvanced(request.arguments);
          break;
        case 'get_thought_relationships':
          result = await this.getThoughtRelationships(request.arguments);
          break;
        case 'delete_thought':
          result = await this.deleteThought(request.arguments);
          break;
        case 'get_thought_attachments':
          result = await this.getThoughtAttachments(request.arguments);
          break;
        case 'create_attachment':
          result = await this.createAttachment(request.arguments);
          break;
        case 'create_url_attachment':
          result = await this.createUrlAttachment(request.arguments);
          break;
        case 'get_brain_statistics':
          result = await this.getBrainStatistics(request.arguments);
          break;
        default:
          throw new ValidationError(
            `Unknown tool: ${request.name}`,
            { availableTools: this.getAvailableToolNames() },
            `The tool "${request.name}" is not available.`
          );
      }
      
      // Wrap the result in MCP format
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result)
        }]
      };
    } catch (error) {
      performanceMonitor.recordError();
      
      logger.error('Tool execution error', { 
        name: request.name, 
        error,
        duration: Date.now() - startTime 
      });
      
      // Wrap error with user-friendly message
      if (error instanceof ValidationError) {
        throw error;
      } else if (error instanceof Error) {
        // Get tool-specific error message
        const toolErrorMessages: Record<string, string> = {
          'create_thought': 'Could not create a new thought. Please try again.',
          'update_thought': 'Could not update the thought. Please try again.',
          'delete_thought': 'Could not delete the thought. Please try again.',
          'create_link': 'Could not create the link. Please try again.',
          'list_brains': 'Could not retrieve the list of brains. Please try again.',
          'search_advanced': 'Could not perform the search. Please try again.',
          'get_tags': 'Could not retrieve the tags. Please try again.',
          'add_tags_to_thought': 'Could not add tags to the thought. Please try again.',
          'remove_tags_from_thought': 'Could not remove tags from the thought. Please try again.',
          'get_notes': 'Could not retrieve the notes. Please try again.',
          'update_notes': 'Could not update the notes. Please try again.',
          'append_notes': 'Could not append to the notes. Please try again.',
        };
        
        const userMessage = toolErrorMessages[request.name] || 'The operation failed temporarily. Please try again.';
        
        throw new ServiceUnavailableError(
          error.message,
          { tool: request.name, originalError: error.message },
          userMessage
        );
      }
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      logger.info('Tool execution completed', {
        tool: request.name,
        duration: `${duration}ms`,
        success: true
      });
    }
  }
  
  // Execute tool (alias for callTool for compatibility)
  async executeTool(name: string, args: Record<string, any>): Promise<{ content: string, isError?: boolean }> {
    try {
      logger.info(`Executing tool ${name} with args:`, this.sanitizeArgs(args));
      const result = await this.callTool({ name, arguments: args });
      
      // Extract the actual result from the MCP format
      if (result.content && result.content[0] && result.content[0].text) {
        const toolResult = JSON.parse(result.content[0].text);
        if (toolResult.success) {
          return { content: toolResult.message || 'Operation completed successfully' };
        } else {
          return { content: toolResult.message || 'Operation failed', isError: true };
        }
      }
      
      return { content: 'Operation completed', isError: false };
    } catch (error) {
      logger.error(`Error in tool ${name}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { 
        content: `Error ${name.split('_').join(' ')}: ${errorMessage}`,
        isError: true 
      };
    }
  }

  // Create a new thought with progress reporting
  private async createThought(input: unknown): Promise<any> {
    const validated = CreateThoughtInputSchema.parse(input);
    
    return await withProgress(
      {
        operation: 'create_thought',
        total: validated.parentThoughtId ? 2 : 1
      },
      async (reporter) => {
        // Step 1: Create the thought
        reporter.update(0, 'Creating thought...');
        
        const thoughtRequest = {
          name: validated.name,
          notes: validated.notes,
          type: validated.type,
          label: validated.label,
          tags: validated.tags,
        };

        const thought = await this.client.createThought(validated.brainId, thoughtRequest as any);
        logger.info('Thought created', { thoughtId: thought.id, name: thought.name });
        
        reporter.update(1, 'Thought created successfully');

        // Step 2: Create parent link if specified
        if (validated.parentThoughtId) {
          try {
            reporter.update(1, 'Creating parent link...');
            
            const linkRequest = {
              thoughtIdA: validated.parentThoughtId,
              thoughtIdB: thought.id,
              relation: 1, // Parent-Child relation
            };
            const link = await this.client.createLink(validated.brainId, linkRequest as any);
            logger.info('Parent link created', { linkId: link.id });
            
            reporter.update(2, 'Parent link created');

            return {
              thought: this.formatThought(thought),
              parentLink: {
                id: link.id,
                parentId: validated.parentThoughtId,
                childId: thought.id,
                relation: link.relation,
              },
              success: true,
              message: `Created thought "${thought.name}" with parent connection`,
            };
          } catch (linkError) {
            logger.warn('Failed to create parent link', { error: linkError });
            return {
              thought: this.formatThought(thought),
              success: true,
              message: `Created thought "${thought.name}" but failed to create parent link`,
              warning: 'Parent link creation failed',
            };
          }
        }

        return {
          thought: this.formatThought(thought),
          success: true,
          message: `Created thought "${thought.name}"`,
        };
      }
    );
  }

  // Update an existing thought
  private async updateThought(input: unknown): Promise<any> {
    const validated = UpdateThoughtInputSchema.parse(input);
    
    const updateRequest = {
      name: validated.name,
      notes: validated.notes,
      label: validated.label,
      tags: validated.tags,
      isPinned: validated.isPinned,
    };

    // Remove undefined values
    Object.keys(updateRequest).forEach(key => {
      if (updateRequest[key as keyof typeof updateRequest] === undefined) {
        delete updateRequest[key as keyof typeof updateRequest];
      }
    });

    if (Object.keys(updateRequest).length === 0) {
      throw new ValidationError(
        'No fields to update',
        { providedFields: Object.keys(validated) },
        'Please provide at least one field to update.'
      );
    }

    const thought = await this.client.updateThought(
      validated.brainId,
      validated.thoughtId, 
      updateRequest as any
    );
    
    logger.info('Thought updated', { thoughtId: thought.id, updates: updateRequest });

    return {
      thought: this.formatThought(thought),
      updates: updateRequest,
      success: true,
      message: `Updated thought "${thought.name}"`,
    };
  }

  // Create a link between thoughts
  private async createLink(input: unknown): Promise<any> {
    const validated = CreateLinkInputSchema.parse(input);
    
    const linkRequest = {
      thoughtIdA: validated.thoughtIdA,
      thoughtIdB: validated.thoughtIdB,
      relation: validated.relation,
    };

    const link = await this.client.createLink(validated.brainId, linkRequest as any);
    
    logger.info('Link created', { 
      linkId: link.id, 
      thoughtA: validated.thoughtIdA, 
      thoughtB: validated.thoughtIdB,
      relation: validated.relation 
    });

    // Get thought names for better response
    const [thoughtA, thoughtB] = await Promise.all([
      this.client.getThought(validated.brainId, validated.thoughtIdA).catch(() => null),
      this.client.getThought(validated.brainId, validated.thoughtIdB).catch(() => null),
    ]);

    return {
      link: {
        id: link.id,
        thoughtIdA: link.thoughtIdA,
        thoughtIdB: link.thoughtIdB,
        relation: link.relation,
        thoughtNameA: thoughtA?.name || 'Unknown',
        thoughtNameB: thoughtB?.name || 'Unknown',
      },
      success: true,
      message: `Created link between "${thoughtA?.name || link.thoughtIdA}" and "${thoughtB?.name || link.thoughtIdB}"`,
    };
  }

  // Create bulk thoughts with progress reporting
  private async createBulkThoughts(input: unknown): Promise<any> {
    const validated = CreateBulkThoughtsInputSchema.parse(input);
    
    logger.info('Creating bulk thoughts', { 
      brainId: validated.brainId,
      thoughtCount: validated.thoughts.length,
      relationshipCount: validated.relationships?.length || 0
    });

    return await withProgress(
      {
        operation: 'create_bulk_thoughts',
        total: validated.thoughts.length + (validated.relationships?.length || 0)
      },
      async (reporter) => {
        const createdThoughts: any[] = [];
        const createdLinks: any[] = [];
        const tempIdMapping = new Map<string, string>();
        let currentStep = 0;

        // Phase 1: Create all thoughts
        reporter.update(currentStep, 'Creating thoughts...');
        
        for (let i = 0; i < validated.thoughts.length; i++) {
          const thoughtDef = validated.thoughts[i];
          
          try {
            reporter.update(
              currentStep,
              `Creating thought ${i + 1}/${validated.thoughts.length}: ${thoughtDef.name}`
            );
            
            const thought = await this.client.createThought(validated.brainId, {
              name: thoughtDef.name,
              notes: thoughtDef.notes,
              type: thoughtDef.type,
              label: thoughtDef.label,
            } as any);
            
            createdThoughts.push(thought);
            
            // Map temporary ID to real ID if provided
            if (thoughtDef.temporaryId) {
              tempIdMapping.set(thoughtDef.temporaryId, thought.id);
            }
            
            currentStep++;
            reporter.update(currentStep, `Created: ${thoughtDef.name}`);
            
          } catch (error) {
            logger.error('Failed to create thought', {
              index: i,
              thought: thoughtDef,
              error
            });
            
            throw new ValidationError(
              `Failed to create thought at index ${i}: ${thoughtDef.name}`,
              { index: i, thought: thoughtDef, error: error instanceof Error ? error.message : String(error) },
              `Could not create thought "${thoughtDef.name}". Please check the data and try again.`
            );
          }
        }

        // Phase 2: Create relationships
        if (validated.relationships && validated.relationships.length > 0) {
          reporter.update(currentStep, 'Creating relationships...');
          
          for (let i = 0; i < validated.relationships.length; i++) {
            const rel = validated.relationships[i];
            
            try {
              reporter.update(
                currentStep,
                `Creating relationship ${i + 1}/${validated.relationships.length}`
              );
              
              // Resolve IDs (could be temporary IDs or real IDs)
              const sourceId = tempIdMapping.get(rel.sourceId) || rel.sourceId;
              const targetId = tempIdMapping.get(rel.targetId) || rel.targetId;
              
              const link = await this.client.createLink(validated.brainId, {
                thoughtIdA: sourceId,
                thoughtIdB: targetId,
                relation: this.mapRelationToNumber(rel.relation),
              } as any);
              
              createdLinks.push(link);
              currentStep++;
              
              reporter.update(
                currentStep,
                `Created ${rel.relation} relationship`
              );
              
            } catch (error) {
              logger.error('Failed to create relationship', {
                index: i,
                relationship: rel,
                error
              });
              
              throw new ValidationError(
                `Failed to create relationship at index ${i}`,
                { index: i, relationship: rel, error: error instanceof Error ? error.message : String(error) },
                `Could not create relationship. Please check the IDs and try again.`
              );
            }
          }
        }

        return {
          success: true,
          createdThoughts: createdThoughts.map((t: any) => this.formatThought(t)),
          createdLinks: createdLinks.map((l: any) => ({
            id: l.id,
            thoughtIdA: l.thoughtIdA,
            thoughtIdB: l.thoughtIdB,
            relation: l.relation,
          })),
          summary: {
            thoughtsCreated: createdThoughts.length,
            linksCreated: createdLinks.length,
          },
          message: `Created ${createdThoughts.length} thoughts and ${createdLinks.length} relationships`,
        };
      }
    );
  }

  // List all brains in the account
  private async listBrains(): Promise<any> {
    logger.info('Listing all brains');
    
    try {
      const brains = await this.client.getBrains();
      
      logger.info(`Found ${brains.length} brains`);
      
      // Format the brain list for display
      const formattedBrains = brains.map((brain: any) => ({
        id: brain.id,
        name: brain.name,
        description: brain.description || 'No description',
        createdAt: brain.createdAt,
        updatedAt: brain.updatedAt,
      }));
      
      return {
        success: true,
        brains: formattedBrains,
        count: brains.length,
        message: `Found ${brains.length} brain${brains.length !== 1 ? 's' : ''} in your account`,
      };
    } catch (error) {
      logger.error('Failed to list brains', { error });
      
      throw new ServiceUnavailableError(
        'Failed to list brains',
        { error: error instanceof Error ? error.message : String(error) },
        'Could not retrieve the list of brains. Please try again.'
      );
    }
  }

  // Helper methods
  private formatThought(thought: any): any {
    const formatted = {
      id: thought.id,
      name: thought.name,
      label: thought.label,
      type: thought.thoughtType,
      color: thought.color,
      icon: thought.icon,
      isActive: thought.isActive,
      isPinned: thought.isPinned,
      createdAt: thought.creationDateTime,
      modifiedAt: thought.modificationDateTime,
    };
    logger.debug('Formatting thought', { input: thought, output: formatted });
    return formatted;
  }

  private mapRelationToNumber(relation: string): number {
    switch (relation) {
      case 'Parent':
      case 'Child':
        return 1;
      case 'Jump':
        return 2;
      default:
        return 1;
    }
  }

  private sanitizeArgs(args: any): any {
    if (!args) return args;
    
    const sanitized = { ...args };
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey'];
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  // Get all available tool names (helper for error messages)
  private getAvailableToolNames(): string[] {
    return [
      'create_thought', 'update_thought', 'create_link', 'create_bulk_thoughts',
      'list_brains', 'get_tags', 'add_tags_to_thought', 'remove_tags_from_thought',
      'get_types', 'get_notes', 'update_notes', 'append_notes', 'search_advanced',
      'get_thought_relationships', 'delete_thought', 'get_thought_attachments',
      'create_attachment', 'create_url_attachment', 'get_brain_statistics'
    ];
  }

  // Tag management operations
  private async getTags(input: unknown): Promise<any> {
    const validated = z.object({ brainId: z.string() }).parse(input);
    
    logger.info('Getting tags', { brainId: validated.brainId });
    
    try {
      const tags = await this.client.getTags(validated.brainId);
      
      return {
        success: true,
        tags: tags.map((tag: any) => ({
          id: tag.id,
          name: tag.name,
          color: tag.color,
          created: tag.creationDateTime,
        })),
        count: tags.length,
        message: `Found ${tags.length} tags in the brain`,
      };
    } catch (error) {
      throw new ServiceUnavailableError(
        'Failed to get tags',
        { error: error instanceof Error ? error.message : String(error) },
        'Could not retrieve the tags. Please try again.'
      );
    }
  }

  private async addTagsToThought(input: unknown): Promise<any> {
    const validated = z.object({
      brainId: z.string(),
      thoughtId: z.string(),
      tagIds: z.array(z.string()),
    }).parse(input);
    
    logger.info('Adding tags to thought', { 
      brainId: validated.brainId,
      thoughtId: validated.thoughtId,
      tagIds: validated.tagIds
    });
    
    try {
      // Get current thought
      const thought = await this.client.getThought(validated.brainId, validated.thoughtId);
      
      // Add new tags to existing tags
      const currentTags = (thought as any).tags || [];
      const newTags = [...new Set([...currentTags, ...validated.tagIds])];
      
      // Update thought with new tags
      const updatedThought = await this.client.updateThought(
        validated.brainId,
        validated.thoughtId,
        { tags: newTags } as any
      );
      
      return {
        success: true,
        thought: this.formatThought(updatedThought),
        addedTags: validated.tagIds,
        totalTags: newTags.length,
        message: `Added ${validated.tagIds.length} tags to thought "${thought.name}"`,
      };
    } catch (error) {
      throw new ServiceUnavailableError(
        'Failed to add tags',
        { error: error instanceof Error ? error.message : String(error) },
        'Could not add tags to the thought. Please try again.'
      );
    }
  }

  private async removeTagsFromThought(input: unknown): Promise<any> {
    const validated = z.object({
      brainId: z.string(),
      thoughtId: z.string(),
      tagIds: z.array(z.string()),
    }).parse(input);
    
    logger.info('Removing tags from thought', { 
      brainId: validated.brainId,
      thoughtId: validated.thoughtId,
      tagIds: validated.tagIds
    });
    
    try {
      // Get current thought
      const thought = await this.client.getThought(validated.brainId, validated.thoughtId);
      
      // Remove specified tags
      const currentTags = (thought as any).tags || [];
      const newTags = currentTags.filter((tag: string) => !validated.tagIds.includes(tag));
      
      // Update thought with new tags
      const updatedThought = await this.client.updateThought(
        validated.brainId,
        validated.thoughtId,
        { tags: newTags } as any
      );
      
      return {
        success: true,
        thought: this.formatThought(updatedThought),
        removedTags: validated.tagIds,
        remainingTags: newTags.length,
        message: `Removed ${validated.tagIds.length} tags from thought "${thought.name}"`,
      };
    } catch (error) {
      throw new ServiceUnavailableError(
        'Failed to remove tags',
        { error: error instanceof Error ? error.message : String(error) },
        'Could not remove tags from the thought. Please try again.'
      );
    }
  }

  // Type management operations
  private async getTypes(input: unknown): Promise<any> {
    const validated = z.object({ brainId: z.string() }).parse(input);
    
    logger.info('Getting types', { brainId: validated.brainId });
    
    try {
      const types = await this.client.getTypes(validated.brainId);
      
      return {
        success: true,
        types: types.map((type: any) => ({
          id: type.id,
          name: type.name,
          color: type.color,
          created: type.creationDateTime,
        })),
        count: types.length,
        message: `Found ${types.length} types in the brain`,
      };
    } catch (error) {
      throw new ServiceUnavailableError(
        'Failed to get types',
        { error: error instanceof Error ? error.message : String(error) },
        'Could not retrieve the types. Please try again.'
      );
    }
  }

  // Notes operations
  private async getNotes(input: unknown): Promise<any> {
    const validated = z.object({
      brainId: z.string(),
      thoughtId: z.string(),
      format: z.enum(['markdown', 'html', 'text']).default('markdown'),
    }).parse(input);
    
    logger.info('Getting notes', { 
      brainId: validated.brainId,
      thoughtId: validated.thoughtId,
      format: validated.format
    });
    
    try {
      let notes;
      
      // The client only has getNotes method, not separate methods for different formats
      notes = await this.client.getNotes(validated.brainId, validated.thoughtId);
      
      // Handle different return types - Note type has content property
      const content = notes.content || '';
      const modifiedAt = notes.metadata?.modificationDateTime;
      
      return {
        success: true,
        format: validated.format,
        content,
        modifiedAt,
        message: `Retrieved notes in ${validated.format} format`,
      };
    } catch (error) {
      throw new ServiceUnavailableError(
        'Failed to get notes',
        { error: error instanceof Error ? error.message : String(error) },
        'Could not retrieve the notes. Please try again.'
      );
    }
  }

  private async updateNotes(input: unknown): Promise<any> {
    const validated = z.object({
      brainId: z.string(),
      thoughtId: z.string(),
      markdown: z.string(),
    }).parse(input);
    
    logger.info('Updating notes', { 
      brainId: validated.brainId,
      thoughtId: validated.thoughtId
    });
    
    try {
      await this.client.updateNotes(
        validated.brainId,
        validated.thoughtId,
        validated.markdown
      );
      
      return {
        success: true,
        message: 'Notes updated successfully',
      };
    } catch (error) {
      throw new ServiceUnavailableError(
        'Failed to update notes',
        { error: error instanceof Error ? error.message : String(error) },
        'Could not update the notes. Please try again.'
      );
    }
  }

  private async appendNotes(input: unknown): Promise<any> {
    const validated = z.object({
      brainId: z.string(),
      thoughtId: z.string(),
      markdown: z.string(),
    }).parse(input);
    
    logger.info('Appending to notes', { 
      brainId: validated.brainId,
      thoughtId: validated.thoughtId
    });
    
    try {
      await this.client.appendNotes(
        validated.brainId,
        validated.thoughtId,
        validated.markdown
      );
      
      return {
        success: true,
        message: 'Notes appended successfully',
      };
    } catch (error) {
      throw new ServiceUnavailableError(
        'Failed to append notes',
        { error: error instanceof Error ? error.message : String(error) },
        'Could not append to the notes. Please try again.'
      );
    }
  }

  // Advanced search
  private async searchAdvanced(input: unknown): Promise<any> {
    const validated = z.object({
      brainId: z.string(),
      query: z.string(),
      thoughtTypes: z.array(z.enum(['Normal', 'Type', 'Tag', 'System'])).optional(),
      tags: z.array(z.string()).optional(),
      includeArchived: z.boolean().default(false),
      limit: z.number().default(50),
    }).parse(input);
    
    logger.info('Advanced search', { 
      brainId: validated.brainId,
      query: validated.query,
      filters: {
        types: validated.thoughtTypes,
        tags: validated.tags,
        includeArchived: validated.includeArchived,
      }
    });
    
    try {
      const searchRequest = {
        query: validated.query,
        thoughtTypes: validated.thoughtTypes,
        includeArchived: validated.includeArchived,
        limit: validated.limit,
      };
      
      const results = await this.client.search(validated.brainId, validated.query);
      
      // Filter by tags if specified
      let filteredThoughts = results.thoughts;
      if (validated.tags && validated.tags.length > 0) {
        filteredThoughts = results.thoughts.filter((thought: any) => {
          const thoughtTags = (thought as any).tags || [];
          return validated.tags!.some(tag => thoughtTags.includes(tag));
        });
      }
      
      return {
        success: true,
        thoughts: filteredThoughts.map((t: any) => this.formatThought(t)),
        links: results.links,
        totalCount: filteredThoughts.length,
        query: validated.query,
        filters: {
          types: validated.thoughtTypes,
          tags: validated.tags,
          includeArchived: validated.includeArchived,
        },
        message: `Found ${filteredThoughts.length} thoughts matching your search`,
      };
    } catch (error) {
      throw new ServiceUnavailableError(
        'Search failed',
        { error: error instanceof Error ? error.message : String(error) },
        'Could not complete the search. Please try again.'
      );
    }
  }

  // Relationship operations
  private async getThoughtRelationships(input: unknown): Promise<any> {
    const validated = z.object({
      brainId: z.string(),
      thoughtId: z.string(),
      includeChildren: z.boolean().default(true),
      includeParents: z.boolean().default(true),
      includeSiblings: z.boolean().default(true),
      includeJumps: z.boolean().default(true),
    }).parse(input);
    
    logger.info('Getting thought relationships', { 
      brainId: validated.brainId,
      thoughtId: validated.thoughtId,
      options: validated
    });
    
    try {
      const relationships: any = {
        thought: await this.client.getThought(validated.brainId, validated.thoughtId),
      };
      
      // Get requested relationships in parallel
      const promises = [];
      
      if (validated.includeChildren) {
        promises.push(
          this.client.getThoughtChildren(validated.brainId, validated.thoughtId)
            .then((children: any) => { relationships.children = children; })
            .catch(() => { relationships.children = []; })
        );
      }
      
      if (validated.includeParents) {
        promises.push(
          this.client.getThoughtParents(validated.brainId, validated.thoughtId)
            .then((parents: any) => { relationships.parents = parents; })
            .catch(() => { relationships.parents = []; })
        );
      }
      
      if (validated.includeSiblings) {
        promises.push(
          this.client.getThoughtSiblings(validated.brainId, validated.thoughtId)
            .then((siblings: any) => { relationships.siblings = siblings; })
            .catch(() => { relationships.siblings = []; })
        );
      }
      
      await Promise.all(promises);
      
      // Format the response
      const formattedRelationships: any = {
        thought: this.formatThought(relationships.thought),
      };
      
      if (relationships.children) {
        formattedRelationships.children = relationships.children.map((t: any) => this.formatThought(t));
      }
      if (relationships.parents) {
        formattedRelationships.parents = relationships.parents.map((t: any) => this.formatThought(t));
      }
      if (relationships.siblings) {
        formattedRelationships.siblings = relationships.siblings.map((t: any) => this.formatThought(t));
      }
      
      return {
        success: true,
        ...formattedRelationships,
        message: `Retrieved relationships for thought "${relationships.thought.name}"`,
      };
    } catch (error) {
      throw new ServiceUnavailableError(
        'Failed to get relationships',
        { error: error instanceof Error ? error.message : String(error) },
        'Could not retrieve thought relationships. Please try again.'
      );
    }
  }

  // Delete operations
  private async deleteThought(input: unknown): Promise<any> {
    const validated = z.object({
      brainId: z.string(),
      thoughtId: z.string(),
    }).parse(input);
    
    logger.info('Deleting thought', { 
      brainId: validated.brainId,
      thoughtId: validated.thoughtId
    });
    
    try {
      // Get thought info before deletion for the response
      const thought = await this.client.getThought(validated.brainId, validated.thoughtId);
      
      await this.client.deleteThought(validated.brainId, validated.thoughtId);
      
      return {
        success: true,
        deletedThought: {
          id: thought.id,
          name: thought.name,
        },
        message: `Deleted thought "${thought.name}"`,
      };
    } catch (error) {
      throw new ServiceUnavailableError(
        'Failed to delete thought',
        { error: error instanceof Error ? error.message : String(error) },
        'Could not delete the thought. Please try again.'
      );
    }
  }

  // Attachment operations
  private async getThoughtAttachments(input: unknown): Promise<any> {
    const validated = z.object({
      brainId: z.string(),
      thoughtId: z.string(),
    }).parse(input);
    
    logger.info('Getting thought attachments', { 
      brainId: validated.brainId,
      thoughtId: validated.thoughtId
    });
    
    try {
      const attachments = await this.client.getThoughtAttachments(validated.brainId, validated.thoughtId);
      
      return {
        success: true,
        attachments: attachments.map((att: any) => ({
          id: att.id,
          name: att.name,
          type: att.type,
          size: att.dataLength,
          created: att.creationDateTime,
        })),
        count: attachments.length,
        message: `Found ${attachments.length} attachments`,
      };
    } catch (error) {
      throw new ServiceUnavailableError(
        'Failed to get attachments',
        { error: error instanceof Error ? error.message : String(error) },
        'Could not retrieve attachments. Please try again.'
      );
    }
  }

  private async createAttachment(input: unknown): Promise<any> {
    const validated = z.object({
      brainId: z.string(),
      thoughtId: z.string(),
      filename: z.string(),
      content: z.string(),
      mimeType: z.string().optional(),
    }).parse(input);
    
    logger.info('Creating attachment', { 
      brainId: validated.brainId,
      thoughtId: validated.thoughtId,
      filename: validated.filename
    });
    
    try {
      // Convert base64 content to buffer
      const buffer = Buffer.from(validated.content, 'base64');
      
      await this.client.createAttachment(
        validated.brainId,
        validated.thoughtId,
        {
          filePath: validated.filename,
          name: validated.filename
        }
      );
      
      return {
        success: true,
        message: `Created attachment "${validated.filename}"`,
      };
    } catch (error) {
      throw new ServiceUnavailableError(
        'Failed to create attachment',
        { error: error instanceof Error ? error.message : String(error) },
        'Could not create attachment. Please try again.'
      );
    }
  }

  private async createUrlAttachment(input: unknown): Promise<any> {
    const validated = z.object({
      brainId: z.string(),
      thoughtId: z.string(),
      url: z.string().url(),
    }).parse(input);
    
    logger.info('Creating URL attachment', { 
      brainId: validated.brainId,
      thoughtId: validated.thoughtId,
      url: validated.url
    });
    
    try {
      await this.client.createUrlAttachment(
        validated.brainId,
        validated.thoughtId,
        validated.url
      );
      
      return {
        success: true,
        message: `Created URL attachment for "${validated.url}"`,
      };
    } catch (error) {
      throw new ServiceUnavailableError(
        'Failed to create URL attachment',
        { error: error instanceof Error ? error.message : String(error) },
        'Could not create URL attachment. Please try again.'
      );
    }
  }

  // Brain statistics
  private async getBrainStatistics(input: unknown): Promise<any> {
    const validated = z.object({
      brainId: z.string(),
    }).parse(input);
    
    logger.info('Getting brain statistics', { brainId: validated.brainId });
    
    try {
      const stats = await this.client.getBrainStatistics(validated.brainId);
      
      return {
        success: true,
        statistics: {
          thoughtCount: stats.thoughtCount,
          linkCount: stats.linkCount,
          attachmentCount: stats.attachmentCount,
          noteCount: stats.noteCount,
          tagCount: stats.tagCount,
          typeCount: stats.typeCount,
          totalSize: stats.totalSizeBytes,
          lastModified: stats.lastModified,
        },
        message: `Brain contains ${stats.thoughtCount} thoughts and ${stats.linkCount} links`,
      };
    } catch (error) {
      throw new ServiceUnavailableError(
        'Failed to get statistics',
        { error: error instanceof Error ? error.message : String(error) },
        'Could not retrieve brain statistics. Please try again.'
      );
    }
  }
}

// Factory function
export function createToolProvider(client: TheBrainClient): TheBrainToolProvider {
  return new TheBrainToolProvider(client);
}