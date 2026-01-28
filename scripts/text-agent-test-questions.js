/**
 * Test Questions Configuration
 * 
 * Comprehensive test questions for non-interactive mode testing
 */

export const TEST_QUESTIONS = [
  // Basic identity
  "Tell me about Fram",
  "Who is Fram's owner?",
  
  // Contact retrieval (tests kb_search + specific data extraction)
  "Give me Andrei's email",
  "Give me Andrei's linkedin account",
  
  // Multi-result and specific lookups
  "What projects has Fram worked on?",
  "Tell me about the Vector Watch project",
  "What's Andrei's background?",
  
  // Chained tool calls
  "Compare Andrei's work at Fitbit and UiPath",
  "Show me the complete details of the Vector Watch project",

  // Multimodal image follow-up (ensure asset is re-fetched with image data)
  "Show me an image of Desktop Agent",
  "Describe the image visuals",
  
  // Negative cases
  "Tell me about a project that doesn't exist",
  "Who is John Smith?",
  
  // Additional questions to trigger compaction (need 12+ for >20 messages)
  "What technologies does Fram work with?",
  "How can I contact Fram Design?",
  "What makes Fram different from other design studios?",
  
  // Perplexity search test (requires real-time information)
  "What are the latest developments in AI as of 2026?"
];
