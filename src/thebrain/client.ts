import axios from 'axios';
import { z } from 'zod';
import logger from '../utils/logger';
import { TheBrainAPIError, AuthenticationError, NotFoundError, ValidationError } from '../utils/error-handler';

// Configuration schema
const TheBrainConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  baseUrl: z.string().url().default('https://api.bra.in'),
  timeout: z.number().positive().default(30000),
  maxRetries: z.number().int().min(0).max(5).default(3),
  retryDelay: z.number().positive().default(1000),
});

export type TheBrainConfig = z.infer<typeof TheBrainConfigSchema>;

// Response schemas
const BrainSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ThoughtTypeSchema = z.enum(['Normal', 'Type', 'Tag', 'System']);

const ThoughtSchema = z.object({
  id: z.string(),
  brainId: z.string(),
  name: z.string(),
  label: z.string().optional(),
  creationDateTime: z.string(),
  modificationDateTime: z.string(),
  thoughtType: ThoughtTypeSchema,
  isActive: z.boolean(),
  isPinned: z.boolean(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

const LinkTypeSchema = z.enum(['Normal', 'Jump']);

const LinkSchema = z.object({
  id: z.string(),
  brainId: z.string(),
  thoughtIdA: z.string(),
  thoughtIdB: z.string(),
  relation: z.enum(['Parent', 'Child', 'Jump']),
  linkType: LinkTypeSchema,
  creationDateTime: z.string(),
  modificationDateTime: z.string(),
  strength: z.number().min(0).max(100).optional(),
});

const SearchResultSchema = z.object({
  thoughts: z.array(ThoughtSchema),
  links: z.array(LinkSchema),
  totalCount: z.number(),
});

// Type exports
export type Brain = z.infer<typeof BrainSchema>;
export type Thought = z.infer<typeof ThoughtSchema>;
export type ThoughtType = z.infer<typeof ThoughtTypeSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type LinkType = z.infer<typeof LinkTypeSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;

// Request interfaces
export interface CreateThoughtRequest {
  name: string;
  thoughtType?: ThoughtType;
  label?: string;
  color?: string;
  icon?: string;
  parentThoughtId?: string;
}

export interface UpdateThoughtRequest {
  name?: string;
  label?: string;
  color?: string;
  icon?: string;
  isPinned?: boolean;
}

export interface CreateLinkRequest {
  thoughtIdA: string;
  thoughtIdB: string;
  relation: 'Parent' | 'Child' | 'Jump';
  linkType?: LinkType;
  strength?: number;
}

export interface SearchRequest {
  query: string;
  limit?: number;
  offset?: number;
  thoughtTypes?: ThoughtType[];
  includeArchived?: boolean;
}

export class TheBrainClient {
  private config: TheBrainConfig;
  private axios: any; // Using any to avoid axios type issues
  private retryCount: Map<string, number> = new Map();

  constructor(config: Partial<TheBrainConfig>) {
    // Validate and set configuration
    try {
      this.config = TheBrainConfigSchema.parse(config);
    } catch (error) {
      throw new ValidationError('Invalid TheBrain client configuration', error);
    }

    // Create axios instance with defaults
    this.axios = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
    });

    // Add request interceptor for logging
    this.axios.interceptors.request.use(
      (config: any) => {
        logger.debug('TheBrain API request', {
          method: config.method,
          url: config.url,
          params: config.params,
          data: config.data,
        });
        return config;
      },
      (error: any) => {
        logger.error('TheBrain API request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging and error handling
    this.axios.interceptors.response.use(
      (response: any) => {
        logger.debug('TheBrain API response', {
          status: response.status,
          url: response.config.url,
          data: response.data,
        });
        return response;
      },
      async (error: any) => {
        return this.handleApiError(error);
      }
    );
  }

  private async handleApiError(error: any): Promise<any> {
    const requestId = `${error.config?.method}-${error.config?.url}`;
    const retryCount = this.retryCount.get(requestId) || 0;

    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const data = error.response.data as any;
      const message = data?.error?.message || error.message;

      logger.error('TheBrain API error response', {
        status,
        message,
        data,
        url: error.config?.url,
      });

      switch (status) {
        case 401:
          throw new AuthenticationError('Invalid API key or authentication failed', { 
            status, 
            response: data 
          });
        case 404:
          throw new NotFoundError('Resource not found', { 
            status, 
            response: data,
            url: error.config?.url 
          });
        case 400:
          throw new ValidationError('Invalid request parameters', { 
            status, 
            response: data 
          });
        case 429:
          // Rate limiting - implement exponential backoff
          if (retryCount < this.config.maxRetries) {
            const delay = this.config.retryDelay * Math.pow(2, retryCount);
            logger.warn(`Rate limited. Retrying after ${delay}ms...`, { 
              retryCount, 
              url: error.config?.url 
            });
            
            this.retryCount.set(requestId, retryCount + 1);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            return this.axios.request(error.config);
          }
          throw new TheBrainAPIError('Rate limit exceeded', status, { 
            response: data,
            retryCount 
          });
        default:
          throw new TheBrainAPIError(message, status, { 
            response: data 
          });
      }
    } else if (error.request) {
      // Request made but no response received
      if (retryCount < this.config.maxRetries && this.isRetryableError(error)) {
        const delay = this.config.retryDelay * (retryCount + 1);
        logger.warn(`Network error. Retrying after ${delay}ms...`, { 
          retryCount, 
          error: error.message 
        });
        
        this.retryCount.set(requestId, retryCount + 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.axios.request(error.config);
      }
      
      throw new TheBrainAPIError('Network error: No response from server', 0, { 
        error: error.message,
        code: error.code,
        retryCount 
      });
    } else {
      // Something else happened
      throw new TheBrainAPIError('Request configuration error', 0, { 
        error: error.message 
      });
    }
  }

  private isRetryableError(error: any): boolean {
    return error.code === 'ECONNRESET' || 
           error.code === 'ETIMEDOUT' || 
           error.code === 'ENOTFOUND' ||
           error.code === 'ECONNREFUSED';
  }

  // Brain operations
  async getBrains(): Promise<Brain[]> {
    const response = await this.axios.get('/brains');
    return z.array(BrainSchema).parse(response.data);
  }

  async getBrain(brainId: string): Promise<Brain> {
    const response = await this.axios.get(`/brains/${brainId}`);
    return BrainSchema.parse(response.data);
  }

  // Thought operations
  async getThought(brainId: string, thoughtId: string): Promise<Thought> {
    const response = await this.axios.get(`/brains/${brainId}/thoughts/${thoughtId}`);
    return ThoughtSchema.parse(response.data);
  }

  async createThought(brainId: string, request: CreateThoughtRequest): Promise<Thought> {
    const response = await this.axios.post(`/brains/${brainId}/thoughts`, request);
    return ThoughtSchema.parse(response.data);
  }

  async updateThought(
    brainId: string, 
    thoughtId: string, 
    request: UpdateThoughtRequest
  ): Promise<Thought> {
    const response = await this.axios.patch(
      `/brains/${brainId}/thoughts/${thoughtId}`, 
      request
    );
    return ThoughtSchema.parse(response.data);
  }

  async deleteThought(brainId: string, thoughtId: string): Promise<void> {
    await this.axios.delete(`/brains/${brainId}/thoughts/${thoughtId}`);
  }

  async getThoughtChildren(brainId: string, thoughtId: string): Promise<Thought[]> {
    const response = await this.axios.get(
      `/brains/${brainId}/thoughts/${thoughtId}/children`
    );
    return z.array(ThoughtSchema).parse(response.data);
  }

  async getThoughtParents(brainId: string, thoughtId: string): Promise<Thought[]> {
    const response = await this.axios.get(
      `/brains/${brainId}/thoughts/${thoughtId}/parents`
    );
    return z.array(ThoughtSchema).parse(response.data);
  }

  async getThoughtSiblings(brainId: string, thoughtId: string): Promise<Thought[]> {
    const response = await this.axios.get(
      `/brains/${brainId}/thoughts/${thoughtId}/siblings`
    );
    return z.array(ThoughtSchema).parse(response.data);
  }

  // Link operations
  async createLink(brainId: string, request: CreateLinkRequest): Promise<Link> {
    const response = await this.axios.post(`/brains/${brainId}/links`, request);
    return LinkSchema.parse(response.data);
  }

  async updateLink(
    brainId: string, 
    linkId: string, 
    request: Partial<CreateLinkRequest>
  ): Promise<Link> {
    const response = await this.axios.patch(
      `/brains/${brainId}/links/${linkId}`, 
      request
    );
    return LinkSchema.parse(response.data);
  }

  async deleteLink(brainId: string, linkId: string): Promise<void> {
    await this.axios.delete(`/brains/${brainId}/links/${linkId}`);
  }

  async getLink(brainId: string, linkId: string): Promise<Link> {
    const response = await this.axios.get(`/brains/${brainId}/links/${linkId}`);
    return LinkSchema.parse(response.data);
  }

  // Search operations
  async search(brainId: string, request: SearchRequest): Promise<SearchResult> {
    const response = await this.axios.get(`/brains/${brainId}/search`, {
      params: {
        q: request.query,
        limit: request.limit || 50,
        offset: request.offset || 0,
        thoughtTypes: request.thoughtTypes?.join(','),
        includeArchived: request.includeArchived || false,
      },
    });
    return SearchResultSchema.parse(response.data);
  }

  // Utility methods
  async setActiveThought(brainId: string, thoughtId: string): Promise<void> {
    await this.axios.post(`/brains/${brainId}/thoughts/${thoughtId}/activate`);
  }

  async pinThought(brainId: string, thoughtId: string): Promise<Thought> {
    return this.updateThought(brainId, thoughtId, { isPinned: true });
  }

  async unpinThought(brainId: string, thoughtId: string): Promise<Thought> {
    return this.updateThought(brainId, thoughtId, { isPinned: false });
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      await this.axios.get('/health');
      return true;
    } catch (error) {
      logger.error('Health check failed', { error });
      return false;
    }
  }

  // Clear retry count for successful requests
  private clearRetryCount(requestId: string) {
    this.retryCount.delete(requestId);
  }
}

// Factory function
export function createTheBrainClient(config: Partial<TheBrainConfig>): TheBrainClient {
  return new TheBrainClient(config);
}