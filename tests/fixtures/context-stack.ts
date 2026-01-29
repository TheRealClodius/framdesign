/**
 * Test fixtures for context stack restructuring tests
 */

// Mock tool registry data
export const mockToolRegistry = {
  version: '1.0.0',
  generatedAt: '2024-01-28T12:00:00Z',
  tools: [
    {
      toolId: 'kb_search',
      version: '1.0.0',
      description: 'Search the knowledge base',
      documentation: `# kb_search

Semantic search across the knowledge base.

## Parameters
- query (required): Search query string

## Examples
**Finding projects:**
\`\`\`json
{ "query": "wearable design projects" }
\`\`\`

## Watch Out
- Use specific terms for better results`,
      jsonSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
    {
      toolId: 'kb_get',
      version: '1.0.0',
      description: 'Get full entity from knowledge base',
      documentation: `# kb_get

Retrieve a complete entity document by ID.

## Parameters
- id (required): Entity ID (e.g., "project:vector_watch")

## Examples
**Get a project:**
\`\`\`json
{ "id": "project:vector_watch" }
\`\`\``,
      jsonSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Entity ID' },
        },
        required: ['id'],
      },
    },
    {
      toolId: 'no_docs_tool',
      version: '1.0.0',
      description: 'Tool without documentation',
      // intentionally no documentation field
      jsonSchema: {
        type: 'object',
        properties: {},
      },
    },
  ],
};

// Mock tool registry with empty tools array
export const emptyToolRegistry = {
  version: '1.0.0',
  generatedAt: '2024-01-28T12:00:00Z',
  tools: [],
};

// Mock messages with timestamps
// Base: Jan 28, 2024 00:00:00 UTC = 1706400000000
export const mockMessages = [
  {
    role: 'user' as const,
    content: 'Hello there',
    timestamp: 1706452200000, // Jan 28, 2024 14:30:00 UTC (1706400000 + 14*3600 + 30*60) * 1000
  },
  {
    role: 'assistant' as const,
    content: 'Hi! How can I help you today?',
    // No timestamp for assistant messages
  },
  {
    role: 'user' as const,
    content: 'Tell me about design projects',
    timestamp: 1706455800000, // Jan 28, 2024 15:30:00 UTC (1706400000 + 15*3600 + 30*60) * 1000
  },
];

// Messages without timestamps (legacy)
export const legacyMessages = [
  {
    role: 'user' as const,
    content: 'Hello',
  },
  {
    role: 'assistant' as const,
    content: 'Hi there',
  },
];

// Messages spanning multiple days
export const multiDayMessages = [
  {
    role: 'user' as const,
    content: 'First day message',
    timestamp: 1706400000000, // Jan 28, 2024 00:00:00 UTC
  },
  {
    role: 'user' as const,
    content: 'Second day message',
    timestamp: 1706486400000, // Jan 29, 2024 00:00:00 UTC
  },
];

// Messages crossing year boundary
export const crossYearMessages = [
  {
    role: 'user' as const,
    content: 'End of year message',
    timestamp: 1703980800000, // Dec 31, 2023 00:00:00 UTC
  },
  {
    role: 'assistant' as const,
    content: 'Response from last year',
  },
  {
    role: 'user' as const,
    content: 'New year message',
    timestamp: 1704067200000, // Jan 1, 2024 00:00:00 UTC
  },
];

// Single message (edge case for date range)
export const singleMessage = [
  {
    role: 'user' as const,
    content: 'Only message',
    timestamp: 1706452200000, // Jan 28, 2024 14:30:00 UTC
  },
];

// Same-day messages for testing single-day summary
// Base: Jan 28, 2024 00:00:00 UTC = 1706400000000
export const sameDayMessages = [
  {
    role: 'user' as const,
    content: 'Morning message',
    timestamp: 1706430000000, // Jan 28, 2024 08:20:00 UTC (1706400000 + 8*3600 + 20*60) * 1000
  },
  {
    role: 'user' as const,
    content: 'Evening message',
    timestamp: 1706473200000, // Jan 28, 2024 20:20:00 UTC (1706400000 + 20*3600 + 20*60) * 1000
  },
];

// Mock core.md content
export const mockCorePrompt = `## Prime Directive

You exist to help visitors understand what matters to them.

## Who You Are

You are Fram - a polar bear who guards and represents Fram Design.

## How You Communicate

Be concise, but not cold. Be clear, but not mechanical.`;
