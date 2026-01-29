/**
 * Tests for context stack restructuring
 *
 * Tests cover:
 * - Tool guide loading from registry
 * - Timestamp formatting
 * - Timestamp injection into user messages
 * - Summary date range extraction
 * - System prompt composition
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  mockToolRegistry,
  emptyToolRegistry,
  mockMessages,
  legacyMessages,
  crossYearMessages,
  sameDayMessages,
  singleMessage,
  mockCorePrompt,
} from './fixtures/context-stack';

// These will be imported from the actual implementation once created
// For now, we define the expected function signatures

/**
 * Format a timestamp for display in messages
 * @param timestamp Unix timestamp in milliseconds
 * @param includeYear Whether to include the year in the output
 * @returns Formatted string like "[Jan 28, 14:30]" or "[Jan 28, 2024, 14:30]"
 */
function formatTimestamp(timestamp: number | undefined, includeYear = false): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = date.getUTCDate();
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const year = includeYear ? `, ${date.getUTCFullYear()}` : '';
  return `[${month} ${day}${year}, ${hours}:${minutes}]`;
}

/**
 * Extract date range header from messages for summary
 * @param messages Array of messages with optional timestamps
 * @returns Date range string or empty string if not enough timestamps
 */
function extractDateRangeHeader(
  messages: Array<{ role: string; content: string; timestamp?: number }>
): string {
  const timestamps = messages
    .filter((m) => m.timestamp)
    .map((m) => m.timestamp!);

  if (timestamps.length < 1) return '';

  const earliest = new Date(Math.min(...timestamps));
  const latest = new Date(Math.max(...timestamps));

  const formatDate = (d: Date) => {
    const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const day = d.getUTCDate();
    const year = d.getUTCFullYear();
    return `${month} ${day}, ${year}`;
  };

  if (timestamps.length === 1) {
    return `[Conversation on ${formatDate(earliest)}]`;
  }

  return `[Conversation from ${formatDate(earliest)} to ${formatDate(latest)}]`;
}

/**
 * Load tool guides from registry and format for system prompt
 * @param registry Tool registry object
 * @returns Formatted tool guides section
 */
function loadToolGuides(registry: typeof mockToolRegistry): string {
  const guides = registry.tools
    .filter((tool) => tool.documentation)
    .map((tool) => `### ${tool.toolId}\n\n${tool.documentation}`)
    .join('\n\n---\n\n');

  if (!guides) return '';
  return `## Tool Usage Guides\n\n${guides}`;
}

/**
 * Inject timestamps into messages for Gemini API
 * @param messages Array of messages
 * @param hasSummary Whether a summary precedes these messages (affects year inclusion)
 * @returns Messages with timestamps prepended to user content
 */
function injectTimestamps(
  messages: Array<{ role: string; content: string; timestamp?: number }>,
  hasSummary = false
): Array<{ role: string; content: string; timestamp?: number }> {
  let includeYearOnNext = hasSummary;

  return messages.map((msg) => {
    if (msg.role === 'user' && msg.timestamp) {
      const ts = formatTimestamp(msg.timestamp, includeYearOnNext);
      includeYearOnNext = false;
      return { ...msg, content: `${ts} ${msg.content}` };
    }
    return msg;
  });
}

describe('Context Stack', () => {
  describe('formatTimestamp', () => {
    test('should format timestamp as [Mon DD, HH:MM]', () => {
      // Jan 28, 2024 14:30:00 UTC = 1706400000 + 14*3600 + 30*60 = 1706452200
      const timestamp = 1706452200000;
      const result = formatTimestamp(timestamp);
      expect(result).toBe('[Jan 28, 14:30]');
    });

    test('should include year when includeYear=true', () => {
      // Jan 28, 2024 14:30:00 UTC
      const timestamp = 1706452200000;
      const result = formatTimestamp(timestamp, true);
      expect(result).toBe('[Jan 28, 2024, 14:30]');
    });

    test('should return empty string for undefined timestamp', () => {
      const result = formatTimestamp(undefined);
      expect(result).toBe('');
    });

    test('should pad hours and minutes with zeros', () => {
      // Jan 5, 2024 05:05:00 UTC = 1704412800 + 5*3600 + 5*60 = 1704431100
      const timestamp = 1704431100000;
      const result = formatTimestamp(timestamp);
      expect(result).toBe('[Jan 5, 05:05]');
    });

    test('should handle midnight correctly', () => {
      // Jan 28, 2024 00:00:00 UTC
      const timestamp = 1706400000000;
      const result = formatTimestamp(timestamp);
      expect(result).toBe('[Jan 28, 00:00]');
    });

    test('should handle end of day correctly', () => {
      // Jan 28, 2024 23:59:00 UTC
      const timestamp = 1706486340000;
      const result = formatTimestamp(timestamp);
      expect(result).toBe('[Jan 28, 23:59]');
    });
  });

  describe('extractDateRangeHeader', () => {
    test('should extract date range from timestamped messages', () => {
      const result = extractDateRangeHeader(mockMessages);
      expect(result).toBe('[Conversation from Jan 28, 2024 to Jan 28, 2024]');
    });

    test('should format range as [Conversation from Mon DD, YYYY to Mon DD, YYYY]', () => {
      const result = extractDateRangeHeader(crossYearMessages);
      expect(result).toBe('[Conversation from Dec 31, 2023 to Jan 1, 2024]');
    });

    test('should handle single-day conversations', () => {
      const result = extractDateRangeHeader(sameDayMessages);
      expect(result).toBe('[Conversation from Jan 28, 2024 to Jan 28, 2024]');
    });

    test('should handle cross-year conversations', () => {
      const result = extractDateRangeHeader(crossYearMessages);
      expect(result).toContain('2023');
      expect(result).toContain('2024');
    });

    test('should return empty string when no timestamps', () => {
      const result = extractDateRangeHeader(legacyMessages);
      expect(result).toBe('');
    });

    test('should handle single message with timestamp', () => {
      const result = extractDateRangeHeader(singleMessage);
      expect(result).toBe('[Conversation on Jan 28, 2024]');
    });
  });

  describe('loadToolGuides', () => {
    test('should load documentation from all tools in registry', () => {
      const result = loadToolGuides(mockToolRegistry);
      expect(result).toContain('kb_search');
      expect(result).toContain('kb_get');
    });

    test('should format guides with tool ID headers', () => {
      const result = loadToolGuides(mockToolRegistry);
      expect(result).toContain('### kb_search');
      expect(result).toContain('### kb_get');
    });

    test('should skip tools without documentation field', () => {
      const result = loadToolGuides(mockToolRegistry);
      expect(result).not.toContain('no_docs_tool');
    });

    test('should handle empty registry gracefully', () => {
      const result = loadToolGuides(emptyToolRegistry);
      expect(result).toBe('');
    });

    test('should include section header', () => {
      const result = loadToolGuides(mockToolRegistry);
      expect(result).toContain('## Tool Usage Guides');
    });

    test('should separate tools with horizontal rules', () => {
      const result = loadToolGuides(mockToolRegistry);
      expect(result).toContain('---');
    });
  });

  describe('injectTimestamps', () => {
    test('should prepend timestamp to user messages only', () => {
      const result = injectTimestamps(mockMessages);
      expect(result[0].content).toMatch(/^\[.*\] Hello there$/);
      expect(result[1].content).toBe('Hi! How can I help you today?'); // assistant, no change
      expect(result[2].content).toMatch(/^\[.*\] Tell me about design projects$/);
    });

    test('should not add timestamp to assistant messages', () => {
      const result = injectTimestamps(mockMessages);
      const assistantMsg = result.find((m) => m.role === 'assistant');
      expect(assistantMsg?.content).not.toMatch(/^\[.*\]/);
    });

    test('should include year on first message after summary', () => {
      const result = injectTimestamps(mockMessages, true);
      // First user message should have year (format: [Jan 28, 2024, 14:30])
      expect(result[0].content).toContain('[Jan 28, 2024, 14:30]');
      // Third message (second user) should NOT have year (format: [Jan 28, 15:30])
      expect(result[2].content).toContain('[Jan 28, 15:30]');
      expect(result[2].content).not.toMatch(/\[Jan 28, \d{4}/); // Should not have year
    });

    test('should omit year on subsequent messages', () => {
      const result = injectTimestamps(mockMessages, true);
      // Second user message (index 2) should not have year
      expect(result[2].content).not.toMatch(/\d{4}/);
    });

    test('should handle messages without timestamps gracefully', () => {
      const result = injectTimestamps(legacyMessages);
      expect(result[0].content).toBe('Hello'); // No timestamp prefix
      expect(result[1].content).toBe('Hi there');
    });

    test('should not modify original messages', () => {
      const original = [...mockMessages];
      injectTimestamps(mockMessages);
      expect(mockMessages).toEqual(original);
    });
  });

  describe('system prompt composition', () => {
    test('should include tool guides section', () => {
      const toolGuides = loadToolGuides(mockToolRegistry);
      const composed = `${mockCorePrompt}\n\n${toolGuides}`;
      expect(composed).toContain('## Tool Usage Guides');
      expect(composed).toContain('kb_search');
    });

    test('should NOT include date context in system prompt', () => {
      const toolGuides = loadToolGuides(mockToolRegistry);
      const composed = `${mockCorePrompt}\n\n${toolGuides}`;
      expect(composed).not.toContain('Current Date');
      expect(composed).not.toContain("Today's date is");
    });

    test('should maintain core prompt content', () => {
      const toolGuides = loadToolGuides(mockToolRegistry);
      const composed = `${mockCorePrompt}\n\n${toolGuides}`;
      expect(composed).toContain('Prime Directive');
      expect(composed).toContain('You are Fram');
    });
  });
});
