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
  
  // Negative cases
  "Tell me about a project that doesn't exist",
  "Who is John Smith?"
];
