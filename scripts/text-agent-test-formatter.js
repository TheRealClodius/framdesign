/**
 * Output Formatter for Text Agent Test Tool
 * 
 * Formats terminal output with colors and structured sections
 */

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  gray: '\x1b[90m'
};

/**
 * Create a separator line
 */
function separator() {
  return '━'.repeat(80);
}

/**
 * Format question header
 */
export function formatQuestionHeader(index, total, question) {
  return `${colors.cyan}${separator()}${colors.reset}\n` +
         `${colors.bright}Question ${index}/${total}: "${question}"${colors.reset}\n` +
         `${colors.cyan}${separator()}${colors.reset}\n`;
}

/**
 * Format context stack display
 * @param {object} contextStack - Context stack from API
 * @param {number|null} localTokenCount - Token count calculated locally with tiktoken
 */
export function formatContextStack(contextStack, localTokenCount = null) {
  if (!contextStack) return '';
  
  let output = `\n${colors.magenta}📋 Context Stack:${colors.reset}\n`;
  output += `  • System prompt: ${contextStack.systemPromptSource || 'N/A'}\n`;
  output += `  • Chat history: ${contextStack.recentMessages || 0} agent-user turns`;
  if (contextStack.totalMessages !== contextStack.recentMessages) {
    output += ` (${contextStack.totalMessages} total)`;
  }
  output += '\n';
  output += `  • Message summary: ${contextStack.summaryPresent ? `Yes (up to index ${contextStack.summaryUpToIndex})` : 'None (no compacting)'}\n`;
  output += `  • Cached content: ${contextStack.cachedContentUsed ? 'Yes' : 'No'}\n`;
  
  // Token display with tiktoken
  if (localTokenCount !== null) {
    output += `  • Tokens (tiktoken): ${localTokenCount} local`;
    if (contextStack.estimatedTokens) {
      output += ` / ${contextStack.estimatedTokens} server`;
    }
    output += '\n';
  } else {
    output += `  • Tokens (tiktoken): ${contextStack.estimatedTokens || 0}\n`;
  }
  
  if (contextStack.timeoutExpired) {
    output += `  • ${colors.yellow}Timeout expired: Yes${colors.reset}\n`;
  }
  
  return output;
}

/**
 * Format tool call display
 */
export function formatToolCall(toolCall, isChained = false) {
  const indent = isChained ? '  └─ ' : '  └─ ';
  let output = `\n${indent}${colors.blue}Tool Call: ${toolCall.toolId}${colors.reset}\n`;
  
  if (toolCall.thoughtSignature) {
    output += `     ${colors.italic}thought: "${toolCall.thoughtSignature}"${colors.reset}\n`;
  }
  
  output += `     ${colors.dim}Args IN:${colors.reset}\n`;
  output += formatJson(toolCall.args, 6);
  
  if (toolCall.result) {
    // Check for timing breakdown (kb_search)
    if (toolCall.result._timing) {
      const timing = toolCall.result._timing;
      output += `     ${colors.dim}Generating embedding... (${(timing.embeddingDuration / 1000).toFixed(1)}s)${colors.reset}\n`;
      output += `     ${colors.dim}Executing vector search... (${(timing.searchDuration / 1000).toFixed(1)}s)${colors.reset}\n`;
    }
    
    output += `     ${colors.dim}Total: ${(toolCall.duration / 1000).toFixed(1)}s${colors.reset}\n`;
    output += `     ${colors.dim}Args OUT:${colors.reset}\n`;
    output += formatJson(toolCall.result, 6);
  } else if (toolCall.error) {
    output += `     ${colors.red}Error: ${toolCall.error.message || JSON.stringify(toolCall.error)}${colors.reset}\n`;
  }
  
  return output;
}

/**
 * Format JSON with indentation
 */
function formatJson(obj, indent = 0) {
  const spaces = ' '.repeat(indent);
  try {
    const json = JSON.stringify(obj, null, 2);
    return json.split('\n').map(line => `${spaces}${line}`).join('\n') + '\n';
  } catch {
    return `${spaces}${JSON.stringify(obj)}\n`;
  }
}

/**
 * Format agent step header
 */
export function formatStepHeader(stepNumber) {
  return `\n${colors.bright}[Step ${stepNumber}] Agent Response${colors.reset}`;
}

/**
 * Format final response
 */
export function formatFinalResponse(text) {
  return `\n${colors.green}Final Response:${colors.reset}\n"${text}"\n`;
}

/**
 * Format test summary
 */
export function formatTestSummary(summary) {
  let output = `\n${colors.cyan}${separator()}${colors.reset}\n`;
  output += `${colors.bright}Test Summary${colors.reset}\n`;
  output += `${colors.cyan}${separator()}${colors.reset}\n\n`;
  
  output += `Total Execution Time: ${(summary.totalDuration / 1000).toFixed(1)}s\n`;
  output += `Questions: ${summary.questions}\n`;
  output += `Responses: ${summary.responses} (${summary.successful} successful${summary.failed > 0 ? `, ${summary.failed} failed` : ''})\n\n`;
  
  // Token metrics
  if (summary.tokenMetrics) {
    output += `${colors.bright}Token Metrics (tiktoken):${colors.reset}\n`;
    output += `  • Final conversation: ${summary.tokenMetrics.finalConversationTokens} tokens\n`;
    output += `  • Peak server-reported: ${summary.tokenMetrics.peakServerTokens} tokens\n`;
    if (summary.tokenMetrics.avgTokensPerTurn > 0) {
      output += `  • Avg tokens/response: ${summary.tokenMetrics.avgTokensPerTurn.toFixed(0)} tokens\n`;
    }
    output += '\n';
  }
  
  if (summary.toolCalls && Object.keys(summary.toolCalls).length > 0) {
    output += `Tool Calls:\n`;
    for (const [toolId, stats] of Object.entries(summary.toolCalls)) {
      output += `  • ${toolId}: ${stats.count} call${stats.count !== 1 ? 's' : ''}`;
      if (stats.avgDuration) {
        output += ` (avg ${(stats.avgDuration / 1000).toFixed(1)}s)`;
      }
      output += '\n';
    }
    output += '\n';
  }
  
  output += `Total Tool Calls: ${summary.totalToolCalls}\n`;
  if (summary.avgResponseTime) {
    output += `Average Response Time: ${(summary.avgResponseTime / 1000).toFixed(1)}s\n`;
  }
  
  output += `\n${colors.cyan}${separator()}${colors.reset}\n`;
  
  return output;
}

/**
 * Format error message
 */
export function formatError(message) {
  return `${colors.red}Error: ${message}${colors.reset}\n`;
}
