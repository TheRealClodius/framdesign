#!/usr/bin/env node

/**
 * Text Agent Test CLI Tool
 * 
 * Tests the text agent using the actual /api/chat endpoint with complete observability.
 * Supports both non-interactive mode (5 prebaked questions) and interactive mode.
 */

import { config } from 'dotenv';
import readline from 'readline';
import { checkServerRunning, countConversationTokens } from './text-agent-test-utils.js';
import { sendChatRequest } from './text-agent-test-client.js';
import {
  formatQuestionHeader,
  formatContextStack,
  formatToolCall,
  formatStepHeader,
  formatFinalResponse,
  formatTestSummary,
  formatError
} from './text-agent-test-formatter.js';
import { TEST_QUESTIONS } from './text-agent-test-questions.js';

// Load environment variables from .env.local (Next.js convention)
// Falls back to .env if .env.local doesn't exist
config({ path: '.env.local' });
config({ path: '.env' });

// Parse command line arguments
const args = process.argv.slice(2);
const isInteractive = args.includes('--interactive');
const isNonInteractive = args.includes('--non-interactive');

if (!isInteractive && !isNonInteractive) {
  console.error(formatError('Please specify --interactive or --non-interactive'));
  console.log('\nUsage:');
  console.log('  node scripts/text-agent-test.js --non-interactive   # Run 5 test questions');
  console.log('  node scripts/text-agent-test.js --interactive       # Manual Q&A loop');
  process.exit(1);
}

// Conversation state
let conversationHistory = [];
let testSummary = {
  totalDuration: 0,
  questions: 0,
  responses: 0,
  successful: 0,
  failed: 0,
  toolCalls: {},
  totalToolCalls: 0,
  avgResponseTime: 0,
  startTime: Date.now(),
  tokenMetrics: {
    // Input tokens - cumulative server-reported (conversation, excluding cached)
    totalInputTokens: 0,
    // Output tokens - cumulative (model responses)
    totalOutputTokens: 0,
    // Cached tokens - cumulative (system prompt + tools, saved per request)
    totalCachedTokens: 0
  }
};

/**
 * Process a single question
 */
async function processQuestion(question, questionIndex = null, totalQuestions = null) {
  const questionStartTime = Date.now();
  
  // Display question header
  if (questionIndex !== null && totalQuestions !== null) {
    console.log(formatQuestionHeader(questionIndex + 1, totalQuestions, question));
  } else {
    console.log(`\n${'━'.repeat(80)}\nQuestion: "${question}"\n${'━'.repeat(80)}\n`);
  }

  // Add user message to history
  conversationHistory.push({
    role: 'user',
    content: question
  });

  try {
    // Make API request (don't stream chunks - we'll show formatted output instead)
    const response = await sendChatRequest(conversationHistory, false);
    
    const questionDuration = Date.now() - questionStartTime;
    testSummary.responses++;
    testSummary.questions++;

    // Calculate local token count using tiktoken
    const localTokens = countConversationTokens(conversationHistory);

    // Display context stack with local token count
    if (response.observability?.contextStack) {
      console.log(formatContextStack(response.observability.contextStack, localTokens.total));
      
      // Track input tokens (server-reported conversation tokens)
      const serverInputTokens = response.observability.contextStack.estimatedTokens || 0;
      testSummary.tokenMetrics.totalInputTokens += serverInputTokens;
      
      // Track cached tokens (system prompt + tools saved per request)
      const cachedTokens = response.observability.contextStack.cachedTokens || 0;
      testSummary.tokenMetrics.totalCachedTokens += cachedTokens;
    }

    // Display tool calls
    if (response.observability?.toolCalls && response.observability.toolCalls.length > 0) {
      console.log(formatStepHeader(1));
      
      for (const toolCall of response.observability.toolCalls) {
        const isChained = toolCall.chainPosition > 0;
        console.log(formatToolCall(toolCall, isChained));
        
        // Update summary
        if (!testSummary.toolCalls[toolCall.toolId]) {
          testSummary.toolCalls[toolCall.toolId] = {
            count: 0,
            totalDuration: 0
          };
        }
        testSummary.toolCalls[toolCall.toolId].count++;
        testSummary.toolCalls[toolCall.toolId].totalDuration += toolCall.duration;
        testSummary.totalToolCalls++;
      }
    } else {
      console.log(formatStepHeader(1));
    }

    // Display final response
    if (response.text) {
      console.log(formatFinalResponse(response.text));
      testSummary.successful++;
    } else if (response.data) {
      // JSON response (tool call result)
      console.log(formatFinalResponse(JSON.stringify(response.data, null, 2)));
      testSummary.successful++;
    }

    // Add assistant response to history and track output tokens
    if (response.text) {
      conversationHistory.push({
        role: 'assistant',
        content: response.text
      });
      
      // Track output tokens (model responses)
      const responseTokens = countConversationTokens([{ role: 'assistant', content: response.text }]);
      testSummary.tokenMetrics.totalOutputTokens += responseTokens.total;
    }

    // Update average response time
    const totalTime = testSummary.responses > 0 
      ? (testSummary.totalDuration + questionDuration) / testSummary.responses
      : questionDuration;
    testSummary.avgResponseTime = totalTime;
    testSummary.totalDuration += questionDuration;

    console.log(`\n${'━'.repeat(80)}\n`);

  } catch (error) {
    testSummary.responses++;
    testSummary.failed++;
    console.error(formatError(error.message));
    console.log(`\n${'━'.repeat(80)}\n`);
  }
}

/**
 * Non-interactive mode: Run 5 prebaked questions
 */
async function runNonInteractive() {
  console.log('Running non-interactive mode with 5 test questions...\n');

  for (let i = 0; i < TEST_QUESTIONS.length; i++) {
    await processQuestion(TEST_QUESTIONS[i], i, TEST_QUESTIONS.length);
  }

  // Display summary
  testSummary.totalDuration = Date.now() - testSummary.startTime;
  
  // Calculate average durations for tools
  for (const toolId in testSummary.toolCalls) {
    const stats = testSummary.toolCalls[toolId];
    stats.avgDuration = stats.totalDuration / stats.count;
  }
  
  // Calculate final token metrics
  const finalTokens = countConversationTokens(conversationHistory);
  testSummary.tokenMetrics.finalConversationTokens = finalTokens.total;
  
  console.log(formatTestSummary(testSummary));
}

/**
 * Interactive mode: Manual Q&A loop
 */
async function runInteractive() {
  console.log('Running interactive mode. Type your questions (or "exit" to quit).\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const askQuestion = () => {
    rl.question('You: ', async (question) => {
      if (question.toLowerCase() === 'exit' || question.toLowerCase() === 'quit') {
        rl.close();
        
        // Display summary
        testSummary.totalDuration = Date.now() - testSummary.startTime;
        for (const toolId in testSummary.toolCalls) {
          const stats = testSummary.toolCalls[toolId];
          stats.avgDuration = stats.totalDuration / stats.count;
        }
        // Calculate final token metrics
        const finalTokens = countConversationTokens(conversationHistory);
        testSummary.tokenMetrics.finalConversationTokens = finalTokens.total;
        console.log(formatTestSummary(testSummary));
        process.exit(0);
      }

      await processQuestion(question);
      askQuestion();
    });
  };

  askQuestion();
}

/**
 * Main entry point
 */
async function main() {
  // Check if server is running
  console.log('Checking if Next.js server is running...');
  const serverRunning = await checkServerRunning();
  
  if (!serverRunning) {
    console.error(formatError('Next.js server is not running on port 3000'));
    console.log('\nPlease start the server with: npm run dev');
    process.exit(1);
  }

  console.log('✓ Server is running\n');

  // Verify environment variables
  if (!process.env.GEMINI_API_KEY) {
    console.warn('Warning: GEMINI_API_KEY not set. Some features may not work.\n');
  }

  // Run appropriate mode
  if (isNonInteractive) {
    await runNonInteractive();
  } else {
    await runInteractive();
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\nInterrupted. Displaying summary...');
  testSummary.totalDuration = Date.now() - testSummary.startTime;
  for (const toolId in testSummary.toolCalls) {
    const stats = testSummary.toolCalls[toolId];
    stats.avgDuration = stats.totalDuration / stats.count;
  }
  // Calculate final token metrics
  const finalTokens = countConversationTokens(conversationHistory);
  testSummary.tokenMetrics.finalConversationTokens = finalTokens.total;
  console.log(formatTestSummary(testSummary));
  process.exit(0);
});

main().catch((error) => {
  console.error(formatError(`Fatal error: ${error.message}`));
  process.exit(1);
});
