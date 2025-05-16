// Re-export all types and functions from the client
export {
  // Client and factory
  TheBrainClient,
  createTheBrainClient,
  
  // Configuration
  TheBrainConfig,
  
  // Types
  Brain,
  Thought,
  ThoughtType,
  Link,
  LinkType,
  SearchResult,
  
  // Request interfaces
  CreateThoughtRequest,
  UpdateThoughtRequest,
  CreateLinkRequest,
  SearchRequest,
} from './client';