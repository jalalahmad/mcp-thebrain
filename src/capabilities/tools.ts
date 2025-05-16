import { Tool, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { TheBrainClient } from '../thebrain/client.js';
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
  private client: TheBrainClient;

  constructor(client: TheBrainClient) {
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
      switch (request.name) {
        case 'create_thought':
          return await this.createThought(request.arguments);
        case 'update_thought':
          return await this.updateThought(request.arguments);
        case 'create_link':
          return await this.createLink(request.arguments);
        case 'create_bulk_thoughts':
          return await this.createBulkThoughts(request.arguments);
        default:
          throw new ValidationError(
            `Unknown tool: ${request.name}`,
            { availableTools: ['create_thought', 'update_thought', 'create_link', 'create_bulk_thoughts'] },
            `The tool "${request.name}" is not available.`
          );
      }
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
        throw new ServiceUnavailableError(
          error.message,
          { tool: request.name, originalError: error.message },
          'The operation failed temporarily. Please try again.'
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
      
      if (result.success) {
        return { content: result.message || 'Operation completed successfully' };
      } else {
        return { content: result.message || 'Operation failed', isError: true };
      }
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
          createdThoughts: createdThoughts.map(t => this.formatThought(t)),
          createdLinks: createdLinks.map(l => ({
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

  // Helper methods
  private formatThought(thought: any): any {
    return {
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
}

// Factory function
export function createToolProvider(client: TheBrainClient): TheBrainToolProvider {
  return new TheBrainToolProvider(client);
}