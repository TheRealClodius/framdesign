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
 * Format detailed context composition breakdown
 * Shows exactly what's in the model's context window
 * @param {object} contextStack - Context stack from API
 * @param {object} toolMemoryState - Tool memory state from API
 */
export function formatDetailedContextBreakdown(contextStack, toolMemoryState = null) {
  if (!contextStack) return '';

  let output = `\n${colors.cyan}${'─'.repeat(80)}${colors.reset}\n`;
  output += `${colors.bright}${colors.cyan}📊 DETAILED CONTEXT COMPOSITION${colors.reset}\n`;
  output += `${colors.cyan}${'─'.repeat(80)}${colors.reset}\n\n`;

  // Section 1: System Prompt & Tools
  output += `${colors.bright}[1] System Prompt & Tool Schemas${colors.reset}\n`;
  output += `    ${colors.dim}├─ ${colors.reset}Source: ${contextStack.systemPromptSource || 'N/A'}\n`;

  if (contextStack.toolCount !== undefined) {
    output += `    ${colors.dim}├─ ${colors.reset}Tools available: ${contextStack.toolCount}\n`;
    if (contextStack.toolIds && contextStack.toolIds.length > 0) {
      output += `    ${colors.dim}└─ ${colors.reset}Tool IDs: ${contextStack.toolIds.join(', ')}\n`;
    }
  }

  if (contextStack.cachedContentUsed) {
    output += `    ${colors.green}✓ Cached (system + tools)${colors.reset}\n`;
  }
  output += '\n';

  // Section 2: Tool Memory Context
  output += `${colors.bright}[2] Tool Memory Context${colors.reset}\n`;
  if (toolMemoryState && toolMemoryState.totalCalls > 0) {
    output += `    ${colors.dim}├─ ${colors.reset}Status: ${colors.green}Active${colors.reset}\n`;
    output += `    ${colors.dim}├─ ${colors.reset}Total calls recorded: ${toolMemoryState.totalCalls}\n`;
    output += `    ${colors.dim}├─ ${colors.reset}Calls with full responses: ${toolMemoryState.callsWithFullResponse}\n`;
    output += `    ${colors.dim}├─ ${colors.reset}Calls with summaries: ${toolMemoryState.callsWithSummary}\n`;

    if (toolMemoryState.toolBreakdown) {
      output += `    ${colors.dim}└─ ${colors.reset}By tool:\n`;
      for (const [toolId, count] of Object.entries(toolMemoryState.toolBreakdown)) {
        output += `       ${colors.dim}• ${toolId}: ${count} call${count !== 1 ? 's' : ''}${colors.reset}\n`;
      }
    }
  } else {
    output += `    ${colors.dim}└─ ${colors.reset}Status: ${colors.gray}Empty (no tools executed yet)${colors.reset}\n`;
  }
  output += '\n';

  // Section 3: Conversation Context
  output += `${colors.bright}[3] Conversation Messages${colors.reset}\n`;

  if (contextStack.summaryPresent) {
    output += `    ${colors.dim}├─ ${colors.reset}Summary: ${colors.yellow}Yes${colors.reset} (messages 0-${contextStack.summaryUpToIndex})\n`;
    if (contextStack.summaryLength) {
      output += `    ${colors.dim}│  └─ ${colors.reset}Length: ${contextStack.summaryLength} chars\n`;
    }
    if (contextStack.summaryPreview) {
      output += `    ${colors.dim}│  └─ ${colors.reset}Preview: "${contextStack.summaryPreview}"\n`;
    }
  } else {
    output += `    ${colors.dim}├─ ${colors.reset}Summary: ${colors.gray}None${colors.reset}\n`;
  }

  output += `    ${colors.dim}├─ ${colors.reset}Recent messages: ${contextStack.recentMessages}\n`;
  output += `    ${colors.dim}└─ ${colors.reset}Total messages: ${contextStack.totalMessages}\n`;
  output += '\n';

  // Section 4: Special Context Injections
  output += `${colors.bright}[4] Special Context Injections${colors.reset}\n`;

  let hasSpecialContext = false;

  if (contextStack.timeoutExpired) {
    output += `    ${colors.dim}├─ ${colors.reset}${colors.yellow}[TIMEOUT CONTEXT]${colors.reset} Timeout expired message injected\n`;
    hasSpecialContext = true;
  }

  if (toolMemoryState && toolMemoryState.totalCalls > 0) {
    output += `    ${colors.dim}├─ ${colors.reset}${colors.blue}[TOOL MEMORY SUMMARY]${colors.reset} Session tool history injected\n`;
    hasSpecialContext = true;
  }

  if (!hasSpecialContext) {
    output += `    ${colors.dim}└─ ${colors.reset}${colors.gray}None${colors.reset}\n`;
  }
  output += '\n';

  // Section 5: Token Budget
  output += `${colors.bright}[5] Token Budget${colors.reset}\n`;
  output += `    ${colors.dim}├─ ${colors.reset}Estimated total: ${contextStack.estimatedTokens || 0} tokens\n`;
  if (contextStack.cachedTokens) {
    const cachedPercent = contextStack.estimatedTokens > 0
      ? ((contextStack.cachedTokens / (contextStack.estimatedTokens + contextStack.cachedTokens)) * 100).toFixed(1)
      : 0;
    output += `    ${colors.dim}├─ ${colors.reset}Cached tokens: ${contextStack.cachedTokens} (${cachedPercent}% of total)\n`;
  }
  output += `    ${colors.dim}└─ ${colors.reset}Uncached tokens: ${contextStack.estimatedTokens || 0}\n`;

  output += `\n${colors.cyan}${'─'.repeat(80)}${colors.reset}\n`;

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
    // Check for timing breakdown (kb_search, kb_get)
    if (toolCall.result._timing) {
      const timing = toolCall.result._timing;
      // Handle both old (embeddingDuration) and new (embedding) field names
      const embedTime = timing.embeddingDuration || timing.embedding;
      const searchTime = timing.searchDuration || timing.search;
      if (embedTime) {
        output += `     ${colors.dim}Generating embedding... (${(embedTime / 1000).toFixed(1)}s)${colors.reset}\n`;
      }
      if (searchTime) {
        output += `     ${colors.dim}Executing vector search... (${(searchTime / 1000).toFixed(1)}s)${colors.reset}\n`;
      }
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
    const totalIn = summary.tokenMetrics.totalInputTokens;
    const totalOut = summary.tokenMetrics.totalOutputTokens;
    const totalCached = summary.tokenMetrics.totalCachedTokens;
    const grandTotal = totalIn + totalOut + totalCached;
    const cachedPercent = grandTotal > 0 ? ((totalCached / grandTotal) * 100).toFixed(1) : 0;
    
    output += `${colors.bright}Token Metrics (tiktoken):${colors.reset}\n`;
    output += `  • Total input:  ${totalIn} tokens\n`;
    output += `  • Total output: ${totalOut} tokens\n`;
    output += `  • Total cached: ${totalCached} tokens (${cachedPercent}% of total)\n`;
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

/**
 * Format tool usage analysis
 * Helps debug why tools like query_tool_memory might be misused
 * @param {Array} toolCalls - Tool calls from observability
 * @param {object} toolMemoryState - Tool memory state
 */
export function formatToolUsageAnalysis(toolCalls, toolMemoryState) {
  if (!toolCalls || toolCalls.length === 0) {
    return '';
  }

  let output = `\n${colors.yellow}${'─'.repeat(80)}${colors.reset}\n`;
  output += `${colors.bright}${colors.yellow}🔍 TOOL USAGE ANALYSIS${colors.reset}\n`;
  output += `${colors.yellow}${'─'.repeat(80)}${colors.reset}\n\n`;

  // Analyze query_tool_memory usage
  const queryToolMemoryCalls = toolCalls.filter(call => call.toolId === 'query_tool_memory');

  if (queryToolMemoryCalls.length > 0) {
    output += `${colors.bright}query_tool_memory Usage:${colors.reset}\n`;

    for (const call of queryToolMemoryCalls) {
      output += `  ${colors.dim}├─ ${colors.reset}Call #${call.position}`;
      if (call.chainPosition > 0) {
        output += ` (chained)`;
      }
      output += '\n';

      // Show args
      const args = call.args || {};
      output += `  ${colors.dim}│  ├─ ${colors.reset}Args:\n`;
      if (args.filter_tool) {
        output += `  ${colors.dim}│  │  • filter_tool: ${args.filter_tool}${colors.reset}\n`;
      }
      if (args.get_full_response_for) {
        output += `  ${colors.dim}│  │  • get_full_response_for: ${args.get_full_response_for}${colors.reset}\n`;
      }
      if (args.filter_time_range) {
        output += `  ${colors.dim}│  │  • filter_time_range: ${args.filter_time_range}${colors.reset}\n`;
      }
      if (args.include_errors !== undefined) {
        output += `  ${colors.dim}│  │  • include_errors: ${args.include_errors}${colors.reset}\n`;
      }

      // Show result
      if (call.result) {
        const data = call.result.data || call.result;
        if (data.tool_calls) {
          output += `  ${colors.dim}│  └─ ${colors.reset}Result: Found ${data.tool_calls.length} call${data.tool_calls.length !== 1 ? 's' : ''}\n`;
        } else if (data.full_response) {
          output += `  ${colors.dim}│  └─ ${colors.reset}Result: Retrieved full response\n`;
        } else if (data.error) {
          output += `  ${colors.dim}│  └─ ${colors.reset}${colors.red}Error: ${data.error}${colors.reset}\n`;
        }
      }

      // Contextual analysis
      output += `  ${colors.dim}│${colors.reset}\n`;
      output += `  ${colors.dim}│  ${colors.reset}${colors.italic}Context at this turn:${colors.reset}\n`;
      if (toolMemoryState && toolMemoryState.totalCalls > 0) {
        output += `  ${colors.dim}│  ${colors.reset}• Tool memory had ${toolMemoryState.totalCalls} recorded call${toolMemoryState.totalCalls !== 1 ? 's' : ''}\n`;

        // Check if this is a valid use case
        if (args.get_full_response_for) {
          output += `  ${colors.dim}│  ${colors.reset}${colors.green}✓ Valid use: Retrieving full response by call_id${colors.reset}\n`;
        } else if (args.filter_tool) {
          output += `  ${colors.dim}│  ${colors.reset}${colors.green}✓ Valid use: Querying past ${args.filter_tool} calls${colors.reset}\n`;
        } else {
          output += `  ${colors.dim}│  ${colors.reset}${colors.yellow}⚠ Check: Broad query without specific filter${colors.reset}\n`;
        }
      } else {
        output += `  ${colors.dim}│  ${colors.reset}${colors.red}✗ Issue: Tool memory was EMPTY - no prior tool calls to query!${colors.reset}\n`;
        output += `  ${colors.dim}│  ${colors.reset}${colors.red}  This call should NOT have been made.${colors.reset}\n`;
      }
      output += '\n';
    }
  }

  // Analyze other tool patterns
  const kbSearchCalls = toolCalls.filter(call => call.toolId === 'kb_search');
  const perplexitySearchCalls = toolCalls.filter(call => call.toolId === 'perplexity_search');

  if (kbSearchCalls.length > 1 || perplexitySearchCalls.length > 1) {
    output += `${colors.bright}Potential Redundancy:${colors.reset}\n`;

    if (kbSearchCalls.length > 1) {
      output += `  ${colors.dim}├─ ${colors.reset}${colors.yellow}kb_search called ${kbSearchCalls.length} times${colors.reset}\n`;
      for (let i = 0; i < kbSearchCalls.length; i++) {
        const call = kbSearchCalls[i];
        const query = call.args?.query || 'N/A';
        output += `  ${colors.dim}│  ${i + 1}. ${colors.reset}"${query}" (position ${call.position})\n`;
      }

      if (queryToolMemoryCalls.length === 0) {
        output += `  ${colors.dim}│  ${colors.reset}${colors.red}✗ Agent did NOT check tool memory before repeat calls${colors.reset}\n`;
      } else {
        output += `  ${colors.dim}│  ${colors.reset}${colors.green}✓ Agent checked tool memory${colors.reset}\n`;
      }
    }

    if (perplexitySearchCalls.length > 1) {
      output += `  ${colors.dim}├─ ${colors.reset}${colors.yellow}perplexity_search called ${perplexitySearchCalls.length} times${colors.reset}\n`;
    }
    output += '\n';
  }

  output += `${colors.yellow}${'─'.repeat(80)}${colors.reset}\n`;

  return output;
}
