// Re-export client from adapter (which wraps thebrain-api package)
export { TheBrainClient } from './adapter';

// Re-export types
export {
  type Thought,
  type Link,
  type Brain,
  type Attachment,
  type SearchResult,
  type BrainStatistics,
  type ThoughtGraph,
  type Note,
} from './adapter';