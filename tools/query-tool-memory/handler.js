import { toolMemoryStore } from '../_core/tool-memory-store.js';
import { ErrorType } from '../_core/error-types.js';

/**
 * query_tool_memory handler
 *
 * Allows agents to query past tool executions in the conversation.
 * Returns summaries of past calls and can retrieve full responses on demand.
 */
export async function execute(context) {
  const { args, session, clientId } = context;

  // Use session ID if available, otherwise use clientId
  const sessionId = session?.state?.sessionId || clientId;

  if (!sessionId) {
    return {
      ok: false,
      error: {
        type: ErrorType.VALIDATION,
        message: 'No session ID available',
        retryable: false
      },
      intents: [],
      meta: {}
    };
  }

  // Case 1: Get full response for specific call
  if (args.get_full_response_for) {
    return handleGetFullResponse(sessionId, args.get_full_response_for);
  }

  // Case 2: Query tool calls with filters
  return handleQueryToolCalls(sessionId, args);
}

/**
 * Handles retrieving full response for a specific call
 */
function handleGetFullResponse(sessionId, callId) {
  const fullResponse = toolMemoryStore.getFullResponse(sessionId, callId);

  if (!fullResponse) {
    const availableCalls = toolMemoryStore.queryToolCalls(sessionId, { timeRange: 'all' });
    const availableIds = availableCalls.map(c => c.id).join(', ');
    
    return {
      ok: false,
      error: {
        type: ErrorType.NOT_FOUND,
        message: `No full response available for call_id: ${callId}.`,
        retryable: false,
        details: {
          requestedCallId: callId,
          availableCallIds: availableIds || 'none',
          suggestion: 'Check the [SYSTEM CONTEXT] for the correct call IDs from this session. Only recent calls (last 10) keep full responses.'
        }
      },
      intents: [],
      meta: {}
    };
  }

  return {
    ok: true,
    data: {
      full_response: fullResponse,
      call_id: callId
    },
    intents: [],
    meta: {}
  };
}

/**
 * Handles querying tool calls with filters
 */
function handleQueryToolCalls(sessionId, args) {
  // Build filters
  const filters = {
    toolId: args.filter_tool || null,
    timeRange: args.filter_time_range || 'all',
    includeErrors: args.include_errors || false
  };

  // Query the memory store
  const results = toolMemoryStore.queryToolCalls(sessionId, filters);

  if (results.length === 0) {
    return {
      ok: true,
      data: {
        tool_calls: [],
        count: 0,
        message: filters.toolId
          ? `No ${filters.toolId} calls found in this conversation.`
          : 'No tool calls found matching your filters.'
      },
      intents: [],
      meta: {}
    };
  }

  // Format results for agent
  const formattedCalls = results.map(call => ({
    call_id: call.id,
    tool: call.toolId,
    args_summary: summarizeArgs(call.args),
    timestamp: call.timestamp,
    turn: call.turn || 'unknown',
    summary: call.summary || 'Not yet summarized (recent call)',
    success: call.ok,
    duration_ms: call.duration || 0
  }));

  return {
    ok: true,
    data: {
      tool_calls: formattedCalls,
      count: formattedCalls.length,
      filters_applied: filters,
      note: 'Use get_full_response_for with a call_id to retrieve full response data'
    },
    intents: [],
    meta: {}
  };
}

/**
 * Summarizes tool arguments into a readable string
 */
function summarizeArgs(args) {
  if (!args || Object.keys(args).length === 0) {
    return '(no arguments)';
  }

  // Extract the most important arg
  if (args.query) {
    return `query='${args.query}'`;
  }

  if (args.id) {
    return `id='${args.id}'`;
  }

  // Show first few key-value pairs
  const entries = Object.entries(args).slice(0, 2);
  const summary = entries.map(([key, value]) => {
    if (typeof value === 'string') {
      const truncated = value.length > 30 ? value.substring(0, 30) + '...' : value;
      return `${key}='${truncated}'`;
    }
    return `${key}=${JSON.stringify(value)}`;
  }).join(', ');

  return summary;
}
