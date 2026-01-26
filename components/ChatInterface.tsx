"use client";

/**
 * CHAT SECTION COMPONENT
 * 
 * This component renders the chat interface section of the website, featuring:
 * - Interactive chat interface with user and assistant messages
 * - Streaming response support with real-time updates
 * - Markdown and Mermaid diagram rendering for assistant responses
 * - Timeout/blocking functionality for inappropriate user behavior
 * - Auto-scrolling message container
 * - Responsive design with mobile and desktop layouts
 * 
 * Location: components/ChatInterface.tsx
 * Used in: app/[locale]/page.tsx (main landing page, below hero section)
 * API Endpoint: /api/chat (handles chat requests and streaming responses)
 * 
 * HEIGHT SYSTEM EXPLANATION:
 * 
 * The height is controlled through a cascading flexbox system:
 * 
 * NESTING STRUCTURE (Desktop):
 * ┌─────────────────────────────────────────────────┐
 * │ page.tsx: form-container (md:h-[100vh])         │ ← 100vh viewport height
 * │   ┌───────────────────────────────────────────┐ │
 * │   │ ChatInterface section (md:flex-1)        │ │ ← Takes remaining space
 * │   │   ┌────────────────────────────────────┐ │ │
 * │   │   │ HEADER (line 983)                  │ │ │ ← Fixed height
 * │   │   │ - "FRAM ASSISTANT" + Clear button  │ │ │   mb-10 (2.5rem)
 * │   │   │ - flex-shrink-0                     │ │ │   flex-shrink-0
 * │   │   └────────────────────────────────────┘ │ │
 * │   │   ┌────────────────────────────────────┐ │ │
 * │   │   │ Messages Wrapper (md:flex-1)      │ │ │ ← Flexible, fills space
 * │   │   │   ┌──────────────────────────────┐ │ │ │
 * │   │   │   │ Messages Container           │ │ │ │ ← Scrollable area
 * │   │   │   │ (md:flex-1, overflow-y-auto) │ │ │ │   md:flex-1
 * │   │   │   └──────────────────────────────┘ │ │ │
 * │   │   │   ┌──────────────────────────────┐ │ │ │
 * │   │   │   │ PROMPT BOX (line 1068)       │ │ │ │ ← Fixed height
 * │   │   │   │ - Textarea form              │ │ │ │   flex-shrink-0
 * │   │   │   │ - Auto-grows (max-h-[120px]) │ │ │ │   Auto height
 * │   │   │   │ - Voice controls below        │ │ │ │
 * │   │   │   └──────────────────────────────┘ │ │ │
 * │   │   └────────────────────────────────────┘ │ │
 * │   └───────────────────────────────────────────┘ │
 * │   ┌───────────────────────────────────────────┐ │
 * │   │ FOOTER (page.tsx line 26)                 │ │ ← Fixed height
 * │   │ - Copyright text                          │ │   pt-8 pb-9
 * │   │ - flex-shrink-0                           │ │   flex-shrink-0
 * │   └───────────────────────────────────────────┘ │
 * └─────────────────────────────────────────────────┘
 * 
 * DETAILED HEIGHT BREAKDOWN:
 * 
 * 1. PARENT CONTAINER (page.tsx line 23):
 *    - Mobile: No fixed height (content-driven)
 *    - Desktop: `md:h-[100vh]` - Sets container to 100% of viewport height
 *    - Desktop: `md:flex md:flex-col` - Enables flexbox column layout
 * 
 * 2. CHAT SECTION (line 982):
 *    - Mobile: `h-fit` - Height fits content naturally
 *    - Desktop: `md:flex-1` - Takes up remaining space in parent flex container
 *    - Desktop: `md:flex md:flex-col` - Becomes flex container for children
 *    - Desktop: `md:min-h-0` - Critical! Allows flex children to shrink below content size
 *    - Padding: `pt-12 pb-9` (top: 3rem, bottom: 2.25rem)
 * 
 * 3. HEADER (line 983):
 *    - Contains: "FRAM ASSISTANT" text + Clear button
 *    - Height: Content height (text + button)
 *    - Spacing: `mb-10` (margin-bottom: 2.5rem)
 *    - Behavior: `flex-shrink-0` - Never shrinks, maintains fixed height
 *    - To edit header height: Change `mb-10` or add explicit height class
 * 
 * 4. MESSAGES WRAPPER (line 994):
 *    - Mobile: `h-[600px]` - Fixed 600px height
 *    - Desktop: `md:flex-1` - Fills available space in chat section
 *    - Desktop: `md:min-h-0` - Allows proper scrolling behavior
 *    - Contains: Messages container + Prompt box + Voice controls
 * 
 * 5. MESSAGES CONTAINER (line 995):
 *    - Mobile: `h-[600px]` - Fixed 600px height with scroll
 *    - Desktop: `md:flex-1` - Fills available space
 *    - Desktop: `md:min-h-0` - Enables overflow scrolling
 *    - Has `overflow-y-auto` for scrollable content
 *    - Spacing: `mb-2` (margin-bottom: 0.5rem)
 * 
 * 6. PROMPT BOX (line 1068):
 *    - Contains: Textarea + Send button + Voice controls
 *    - Height: Auto-growing textarea (max-h-[120px])
 *    - Behavior: `flex-shrink-0` - Never shrinks, maintains content height
 *    - Spacing: Voice controls have `mt-4` (margin-top: 1rem)
 *    - To edit prompt box height: Change textarea `max-h-[120px]` or add padding
 * 
 * 7. FOOTER (page.tsx line 26):
 *    - Contains: Copyright text
 *    - Height: Content height + padding
 *    - Padding: `pt-8 pb-9` (top: 2rem, bottom: 2.25rem)
 *    - Behavior: `flex-shrink-0` - Never shrinks, maintains fixed height
 *    - To edit footer height: Change `pt-8 pb-9` padding values
 * 
 * KEY CONCEPT: `min-h-0` is essential for flexbox scrolling!
 * Without it, flex items default to `min-height: auto`, which prevents them
 * from shrinking below their content size, breaking the scroll behavior.
 * 
 * HOW TO EDIT HEIGHTS:
 * - Header height: Change `mb-10` on line 983, or add explicit height class
 * - Prompt box height: Change textarea `max-h-[120px]` on line 1081
 * - Footer height: Change `pt-8 pb-9` on page.tsx line 26
 * - Messages area: Automatically fills remaining space via flex-1
 * 
 * BOTTOM SECTION NESTING EXPLANATION (Desktop):
 * 
 * The "bottom section" consists of TWO separate parts:
 * 
 * PART 1: Inside ChatInterface (lines 1131-1257)
 * ┌─────────────────────────────────────────────┐
 * │ Messages Wrapper (line 1057)                │ ← md:flex-1 (flexible)
 * │   ┌───────────────────────────────────────┐ │
 * │   │ Messages Container (line 1058)        │ │ ← md:flex-1 (scrollable)
 * │   │ [Scrollable messages area]            │ │
 * │   └───────────────────────────────────────┘ │
 * │   ┌───────────────────────────────────────┐ │
 * │   │ PROMPT BOX (line 1131)               │ │ ← flex-shrink-0
 * │   │ - Form wrapper                       │ │   (fixed height)
 * │   │   - Textarea (max-h-[120px])         │ │
 * │   │   - Send button                      │ │
 * │   └───────────────────────────────────────┘ │
 * │   ┌───────────────────────────────────────┐ │
 * │   │ VOICE CONTROLS (line 1159)          │ │ ← mt-4 spacing
 * │   │ - Voice error display (conditional)  │ │   (content-driven)
 * │   │ - Audio disabled notice (conditional)│ │
 * │   │ - Voice button                      │ │
 * │   └───────────────────────────────────────┘ │
 * └─────────────────────────────────────────────┘
 * 
 * PART 2: Outside ChatInterface (page.tsx line 26)
 * ┌─────────────────────────────────────────────┐
 * │ FOOTER (page.tsx line 26)                  │ ← flex-shrink-0
 * │ - Copyright text                           │   pt-8 pb-9
 * │ - Sibling to ChatInterface                 │   (fixed height)
 * └─────────────────────────────────────────────┘
 * 
 * CURRENT STRUCTURE:
 * - Messages Wrapper uses `md:flex-1` - fills available space
 * - Messages Container uses `md:flex-1` - scrollable, fills space
 * - Prompt Box uses `flex-shrink-0` - fixed height (content-driven)
 * - Voice Controls use `mt-4` - spacing, content-driven height
 * - Footer uses `flex-shrink-0 pt-8 pb-9` - fixed height
 * 
 * TO MODIFY ENTIRE BOTTOM SECTION HEIGHT ON DESKTOP:
 * 
 * Option 1: Wrap prompt box + voice controls in a container
 *   - Add a wrapper div around lines 1131-1257
 *   - Give it `md:h-[XXX]` (e.g., `md:h-32` for 128px)
 *   - This controls prompt box + voice controls together
 *   - Footer height is separate (modify in page.tsx)
 * 
 * Option 2: Set explicit heights on individual components
 *   - Prompt box: Add `md:h-[XXX]` to form (line 1131)
 *   - Voice controls: Add `md:h-[XXX]` to voice controls div (line 1159)
 *   - Footer: Change `pt-8 pb-9` in page.tsx (line 26)
 * 
 * Option 3: Control via Messages Wrapper
 *   - The Messages Wrapper (line 1057) uses `md:flex-1`
 *   - You could add `md:max-h-[XXX]` to limit its max height
 *   - This would indirectly control bottom section space
 * 
 * RECOMMENDED APPROACH:
 * To control the entire bottom section (prompt + voice + footer):
 * 1. Wrap prompt box + voice controls: Add wrapper with `md:h-[XXX]`
 * 2. Set footer height: Modify `pt-8 pb-9` in page.tsx
 * 3. Total bottom height = wrapper height + footer height
 */
import { useState, useRef, useEffect, useCallback } from "react";
import MarkdownWithMermaid from "./MarkdownWithMermaid";
import {
  generateMessageId,
  getTimeoutUntil,
  setTimeoutUntil,
  clearTimeout as clearTimeoutStorage,
  loadMessagesFromStorage,
  saveMessagesToStorage,
  clearChatHistory,
  getUserId,
  isBudgetExhausted,
  setBudgetExhausted,
  type Message,
} from "@/lib/storage";
import {
  MESSAGE_LIMITS,
  BLOCKED_MESSAGE,
  BUDGET_EXHAUSTED_MESSAGE,
} from "@/lib/constants";
import {
  streamChatResponse,
  sendChatRequest,
} from "@/lib/services/chat-service";
import { OverloadedError, BudgetExhaustedError } from "@/lib/errors";
import { voiceService } from "@/lib/services/voice-service";
import { useTheme } from "@/lib/hooks/useTheme";

/**
 * Normalize text response from voice agent, especially fixing mermaid diagram formatting
 * - Converts escaped newlines (\n) to actual newlines
 * - Ensures mermaid code blocks are properly formatted
 * - Fixes diagrams that are on a single line or poorly formatted
 * - Removes duplicate text patterns
 */
function normalizeTextResponse(text: string): string {
  // First, convert escaped newlines to actual newlines
  let normalized = text.replace(/\\n/g, '\n');
  
  // Remove duplicate text patterns (common in streaming responses)
  // Pattern: "text text" or "sentence. sentence."
  // Look for repeated phrases (at least 10 chars) that appear twice within 200 chars
  const duplicatePattern = /(.{10,}?)(\s+\1){1,}/g;
  normalized = normalized.replace(duplicatePattern, (match, phrase) => {
    // Keep only the first occurrence
    return phrase;
  });
  
  // Remove duplicate sentences (more aggressive)
  // Split by sentence boundaries and remove consecutive duplicates
  const sentences = normalized.split(/([.!?]\s+)/);
  const deduplicatedSentences: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    const sentence = sentences[i];
    const punctuation = sentences[i + 1] || '';
    const fullSentence = sentence + punctuation;
    
    // Skip if this sentence is identical to the previous one
    if (deduplicatedSentences.length > 0 && 
        deduplicatedSentences[deduplicatedSentences.length - 1] === fullSentence.trim()) {
      continue;
    }
    
    // Skip if sentence is too short (likely a fragment)
    if (fullSentence.trim().length < 5) {
      deduplicatedSentences.push(fullSentence);
      continue;
    }
    
    deduplicatedSentences.push(fullSentence);
  }
  normalized = deduplicatedSentences.join('');
  
  // Fix mermaid diagrams that might be malformed
  // Pattern: matches mermaid code blocks (with or without proper formatting)
  const mermaidBlockPattern = /```\s*mermaid\s*\n?([\s\S]*?)```/gi;
  
  normalized = normalized.replace(mermaidBlockPattern, (match, diagramContent) => {
    // Clean up the diagram content
    let cleanContent = diagramContent.trim();
    
    // Remove corrupted text that might have leaked into diagram code
    // Pattern: "mermaidtimelinetitle" or similar concatenated text
    cleanContent = cleanContent.replace(/mermaid\w+/gi, '');
    cleanContent = cleanContent.replace(/timeline\w+/gi, 'timeline');
    
    // Remove standalone words that aren't valid Mermaid syntax
    // But preserve valid Mermaid keywords
    const validMermaidKeywords = /^(title|section|period|event|accTitle|accDescr|graph|flowchart|timeline|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitgraph)/i;
    cleanContent = cleanContent.split('\n').map((line: string) => {
      const trimmed = line.trim();
      // If line is just a word and not a valid keyword, remove it
      if (/^[A-Z][a-z]+\s*$/.test(trimmed) && !validMermaidKeywords.test(trimmed) && 
          !trimmed.match(/[\[\]{}()]/) && !trimmed.match(/-->/)) {
        return '';
      }
      return line;
    }).filter((line: string) => line.trim().length > 0).join('\n');
    
    // Normalize arrow styles (→ to -->, - to -->)
    cleanContent = cleanContent
      .replace(/→/g, '-->')
      .replace(/\s*-\s*>/g, ' --> ')
      .replace(/\s*->\s*/g, ' --> ');
    
    // If the diagram appears to be on one line or poorly formatted, try to format it
    const hasMultipleLines = cleanContent.includes('\n');
    const needsFormatting = !hasMultipleLines || cleanContent.match(/\s+[A-Z]\w*\[|\s+[A-Z]\w*\{/);
    
    if (needsFormatting) {
      // Split by common patterns that indicate new statements
      // Pattern 1: After flowchart/graph declaration
      cleanContent = cleanContent.replace(/(flowchart\s+\w+|graph\s+\w+)\s+/gi, '$1\n  ');
      
      // Pattern 2: Before node definitions (A[...], B{...})
      cleanContent = cleanContent.replace(/\s+([A-Z]\w*\[[^\]]*\])/g, '\n  $1');
      cleanContent = cleanContent.replace(/\s+([A-Z]\w*\{[^\}]*\})/g, '\n  $1');
      
      // Pattern 3: Before connections (A --> B, A & B --> C)
      // Handle both single and multiple source connections
      cleanContent = cleanContent.replace(/\s+([A-Z]\w*(?:\s*&\s*[A-Z]\w*)?\s*-->\s*[A-Z]\w*[^\s]*)/g, '\n  $1');
      
      // Pattern 4: Clean up any remaining inline connections
      cleanContent = cleanContent.replace(/([A-Z]\w*[\]\}])\s+([A-Z]\w*\[|\{)/g, '$1\n  $2');
      
      // Clean up multiple consecutive newlines and spaces
      cleanContent = cleanContent
        .replace(/\n{3,}/g, '\n\n')
        .replace(/  +/g, '  ') // Normalize indentation
        .trim();
    }
    
    // Ensure proper formatting: split into lines and clean each
    const lines = cleanContent.split('\n').map((line: string) => {
      line = line.trim();
      // Ensure proper spacing around arrows
      line = line.replace(/\s*-->\s*/g, ' --> ');
      line = line.replace(/\s*&\s*/g, ' & ');
      return line;
    }).filter((line: string) => line.length > 0);
    
    // Reconstruct with proper indentation (2 spaces for readability)
    cleanContent = lines.map((line: string) => {
      // Don't indent the first line (flowchart/graph/timeline declaration)
      if (line.match(/^(flowchart|graph|timeline|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitgraph|title)/i)) {
        return line;
      }
      // Indent other lines
      return '  ' + line;
    }).join('\n');
    
    return `\`\`\`mermaid\n${cleanContent}\n\`\`\``;
  });
  
  // Also handle cases where mermaid might be mentioned without code fences
  // Look for patterns like "mermaid flowchart" or "mermaid graph" without proper fences
  const looseMermaidPattern = /(?:^|\n)(mermaid\s+(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitgraph)\s+[\s\S]*?)(?=\n\n|\n```|$)/gi;
  
  normalized = normalized.replace(looseMermaidPattern, (match, diagramContent) => {
    // Only wrap if not already wrapped
    if (!match.trim().startsWith('```')) {
      const cleaned = diagramContent.trim().replace(/^mermaid\s+/i, '');
      return `\n\`\`\`mermaid\n${cleaned}\n\`\`\``;
    }
    return match;
  });
  
  return normalized;
}

/**
 * Extract suggestions from message content
 * Supports inline format: <suggestions>["suggestion 1", "suggestion 2"]</suggestions>
 * Also supports legacy format: ---SUGGESTIONS---{"suggestions": [...]}
 */
function extractSuggestionsFromContent(content: string): string[] | undefined {
  if (!content) return undefined;

  // Try inline format first: <suggestions>["...", "..."]</suggestions>
  const inlineMatch = content.match(/<suggestions>\s*(\[[\s\S]*?\])\s*<\/suggestions>/);
  if (inlineMatch) {
    try {
      const parsed = JSON.parse(inlineMatch[1]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 2); // Max 2 suggestions
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Fallback to legacy format: ---SUGGESTIONS---{"suggestions": [...]}
  if (!content.includes('---SUGGESTIONS---')) {
    return undefined;
  }

  const marker = '---SUGGESTIONS---';
  const markerIndex = content.lastIndexOf(marker);
  if (markerIndex === -1) return undefined;

  const jsonStart = content.indexOf('{', markerIndex + marker.length);
  if (jsonStart === -1) return undefined;

  // Find matching closing brace
  let braceCount = 0;
  let jsonEnd = -1;
  for (let i = jsonStart; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    else if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        jsonEnd = i + 1;
        break;
      }
    }
  }

  if (jsonEnd === -1) return undefined;

  try {
    const parsed = JSON.parse(content.substring(jsonStart, jsonEnd));
    if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
      return parsed.suggestions;
    }
  } catch {
    // Ignore parse errors
  }

  return undefined;
}

/**
 * Strip suggestions and metadata from message content for display
 * Handles inline format: <suggestions>[...]</suggestions>
 * Also handles legacy formats: ---SUGGESTIONS---, ---OBSERVABILITY---, ---HAS_QUESTION---
 */
function stripSuggestionsFromContent(content: string): string {
  if (!content) return content;

  let result = content;

  // Remove inline suggestions: <suggestions>[...]</suggestions>
  result = result.replace(/<suggestions>[\s\S]*?<\/suggestions>/g, '').trimEnd();

  // Remove legacy ---SUGGESTIONS--- markers and their JSON payloads
  const suggestionsMarker = '---SUGGESTIONS---';
  if (result.includes(suggestionsMarker)) {
    result = result.substring(0, result.indexOf(suggestionsMarker)).trimEnd();
  }

  // Remove observability metadata
  const obsMarker = '---OBSERVABILITY---';
  if (result.includes(obsMarker)) {
    result = result.substring(0, result.indexOf(obsMarker)).trimEnd();
  }

  // Remove HAS_QUESTION marker (legacy)
  const questionMarker = '---HAS_QUESTION---';
  if (result.includes(questionMarker)) {
    result = result.substring(0, result.indexOf(questionMarker)).trimEnd();
  }

  return result.trimEnd();
}

function formatVoiceSessionDuration(startTime: number | null): string | null {
  if (!startTime) return null;

  const durationMs = Date.now() - startTime;
  const durationSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;

  return minutes > 0 ? `${minutes}min ${seconds}s` : `${seconds}s`;
}

function buildEndCallMessage(startTime: number | null): string {
  const durationMessage = formatVoiceSessionDuration(startTime);

  return durationMessage
    ? `Ended the call. We talked for ${durationMessage}. Click on the VOICE button anytime you wanna chat again.`
    : `Ended the call. Click on the VOICE button anytime you wanna chat again.`;
}

/**
 * Projects available for the "Tell me about..." suggestion
 * Cycles randomly on each page refresh
 */
const PROJECTS = [
  "UiPath Autopilot",
  "Vector Watch",
  "Fitbit OS",
  "Clipboard AI",
  "Desktop Agent",
  "Semantic Space",
];

/**
 * Get a random project name for the suggestion
 * Uses Math.random() so it changes on each page refresh
 */
function getRandomProject(): string {
  return PROJECTS[Math.floor(Math.random() * PROJECTS.length)];
}

export default function ChatInterface() {
  // Get current theme (dark mode during night time or based on system preference)
  const theme = useTheme();
  const isDark = theme === 'dark';

  // Generate conversation starters with random project on client-side only to avoid hydration mismatch
  // Start with a default (first project) to ensure server/client match, then update on mount
  const [conversationStarters, setConversationStarters] = useState([
    "What does FRAM Design do?",
    "I have a design challenge I'm thinking through",
    `Tell me about ${PROJECTS[0]}`, // Default to first project for SSR
    "How would you approach a new product?",
  ]);

  const [messages, setMessages] = useState<Message[]>([
    { id: "initial-assistant", role: "assistant", content: "HELLO. HOW CAN I HELP YOU TODAY?" }
  ]);

  // Set random project only after component mounts on client (avoid hydration mismatch)
  useEffect(() => {
    setConversationStarters([
      "What does FRAM Design do?",
      "I have a design challenge I'm thinking through",
      `Tell me about ${getRandomProject()}`,
      "How would you approach a new product?",
    ]);
  }, []);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [timeoutUntil, setTimeoutUntilState] = useState<number | null>(null);
  const [wasBlocked, setWasBlocked] = useState(false);
  const [budgetExhausted, setBudgetExhaustedState] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isVoiceLoading, setIsVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [audioPlaybackDisabled, setAudioPlaybackDisabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Track if we should start a new message turn (for transcript grouping)
  // Set to true when: user interrupts, session ends, or session restarts
  const shouldStartNewTurn = useRef<boolean>(true);
  
  // Track voice session start time for duration calculation
  const voiceSessionStartTime = useRef<number | null>(null);
  const hasShownEndCallSummary = useRef<boolean>(false);

  // Audio elements cache for sound effects (preloaded for mobile compatibility)
  const startAudioRef = useRef<HTMLAudioElement | null>(null);
  const endAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef<boolean>(false);

  /**
   * Preload and cache audio elements for mobile compatibility
   * On mobile devices, audio must be preloaded and unlocked during user interaction
   */
  const preloadAudioElements = useCallback(() => {
    if (startAudioRef.current && endAudioRef.current) {
      return; // Already preloaded
    }

    try {
      // Preload start sound
      if (!startAudioRef.current) {
        startAudioRef.current = new Audio('/sounds/start.mp3');
        startAudioRef.current.preload = 'auto';
        startAudioRef.current.volume = 1.0;
        startAudioRef.current.addEventListener('error', (e) => {
          console.warn('Failed to load start sound:', e);
          startAudioRef.current = null;
        });
      }

      // Preload end sound
      if (!endAudioRef.current) {
        endAudioRef.current = new Audio('/sounds/end.mp3');
        endAudioRef.current.preload = 'auto';
        endAudioRef.current.volume = 1.0;
        endAudioRef.current.addEventListener('error', (e) => {
          console.warn('Failed to load end sound:', e);
          endAudioRef.current = null;
        });
      }
    } catch (error) {
      console.warn('Error preloading audio elements:', error);
    }
  }, []);

  /**
   * Unlock audio context for mobile devices
   * Must be called during a user interaction event
   */
  const unlockAudio = useCallback(async () => {
    if (audioUnlockedRef.current) {
      return; // Already unlocked
    }

    try {
      // Preload audio elements first
      preloadAudioElements();

      // Play and immediately pause to unlock audio context on mobile
      // This must happen during a user interaction
      const unlockPromises: Promise<void>[] = [];

      if (startAudioRef.current) {
        const promise = startAudioRef.current.play().then(() => {
          startAudioRef.current?.pause();
          if (startAudioRef.current) {
            startAudioRef.current.currentTime = 0;
          }
        }).catch(() => {
          // Ignore errors during unlock attempt
        });
        unlockPromises.push(promise);
      }

      if (endAudioRef.current) {
        const promise = endAudioRef.current.play().then(() => {
          endAudioRef.current?.pause();
          if (endAudioRef.current) {
            endAudioRef.current.currentTime = 0;
          }
        }).catch(() => {
          // Ignore errors during unlock attempt
        });
        unlockPromises.push(promise);
      }

      await Promise.all(unlockPromises);
      audioUnlockedRef.current = true;
    } catch (error) {
      // Silently handle unlock errors
      console.warn('Audio unlock attempt failed:', error);
    }
  }, [preloadAudioElements]);

  /**
   * Play a sound effect from the /public/sounds directory
   * Uses preloaded audio elements for mobile compatibility
   * @param soundPath - Path to sound file relative to /public (e.g., '/sounds/start.mp3')
   */
  const playSoundEffect = useCallback((soundPath: string): void => {
    try {
      let audio: HTMLAudioElement | null = null;

      // Use cached audio element based on sound path
      if (soundPath === '/sounds/start.mp3') {
        audio = startAudioRef.current;
      } else if (soundPath === '/sounds/end.mp3') {
        audio = endAudioRef.current;
      }

      // Fallback: create new audio if cache miss (shouldn't happen)
      if (!audio) {
        console.warn(`Audio not preloaded for ${soundPath}, creating new instance`);
        audio = new Audio(soundPath);
        audio.volume = 1.0;
      }

      // Reset to start and play
      audio.currentTime = 0;
      audio.volume = 1.0;
      
      audio.play().catch((error) => {
        // Silently handle errors (e.g., user interaction required, file not found)
        // Don't break the voice flow if sound fails to play
        console.warn(`Failed to play sound effect ${soundPath}:`, error);
      });
    } catch (error) {
      // Handle errors gracefully without breaking the voice flow
      console.warn(`Error playing sound effect ${soundPath}:`, error);
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  // Preload audio elements on mount for better mobile compatibility
  useEffect(() => {
    preloadAudioElements();
  }, [preloadAudioElements]);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  // Check localStorage for existing timeout on mount
  useEffect(() => {
    const until = getTimeoutUntil();
    if (until) {
      setTimeoutUntilState(until);
      setWasBlocked(true);
    } else {
      // Check if timeout expired (was set but now cleared)
      const hadTimeout = localStorage.getItem("fram_timeout_until");
      if (hadTimeout) {
        clearTimeoutStorage();
        setWasBlocked(true); // Mark that there was a timeout, so we can detect expiration
      }
    }
  }, []);

  // Check budget status on mount
  useEffect(() => {
    const checkBudget = async () => {
      // First check localStorage
      if (isBudgetExhausted()) {
        setBudgetExhaustedState(true);
        return;
      }

      // Then check with API to ensure it's current
      try {
        const userId = getUserId();
        const response = await fetch(`/api/budget?userId=${userId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.isOverBudget) {
            setBudgetExhausted(true);
            setBudgetExhaustedState(true);
          }
        }
      } catch (error) {
        console.error("Error checking budget on mount:", error);
      }
    };

    checkBudget();
  }, []);

  // Load conversation from localStorage on mount
  useEffect(() => {
    const loadedMessages = loadMessagesFromStorage(MESSAGE_LIMITS.MAX_PERSISTED_MESSAGES);
    if (loadedMessages.length > 0) {
      setMessages(loadedMessages);
    }
  }, []);

  // Auto-save messages to localStorage on changes (debounced to reduce blocking during streaming)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveMessagesToStorage(messages, MESSAGE_LIMITS.MAX_PERSISTED_MESSAGES);
    }, 300); // Debounce for 300ms

    return () => clearTimeout(timeoutId);
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Setup voice service event listeners
  useEffect(() => {
    const handleTranscript = (event: Event) => {
      const customEvent = event as CustomEvent<{ role: 'user' | 'assistant'; text: string; citations?: Array<{ url: string; title?: string | null }>; images?: string[] }>;
      const { role, text, citations, images } = customEvent.detail;
      
      const transcriptPreview = text.substring(0, 50);
      console.log('='.repeat(60));
      console.log(`📝 Transcript received in UI: ${role} - ${transcriptPreview}...`);
      
      // Capture the flag value BEFORE setState to avoid React Strict Mode issues
      const isNewTurn = shouldStartNewTurn.current;
      console.log(`🚩 shouldStartNewTurn flag captured: ${isNewTurn}`);
      
      // Reset flag immediately if it was true (we're starting a new turn)
      if (isNewTurn) {
        shouldStartNewTurn.current = false;
        console.log(`🟢 FLAG RESET: shouldStartNewTurn = FALSE (before setState)`);
      }
      
      // Group transcript chunks based on turns (respecting interruptions and session boundaries)
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        const lastMessagePreview = lastMessage ? `${lastMessage.role}: "${(lastMessage.content ?? '').substring(0, 30)}..."` : 'none';
        console.log(`Last message: ${lastMessagePreview}`);
        
        // Should we append to the last message or create a new one?
        // Use the captured flag value (not the ref) to ensure consistency in React Strict Mode
        const shouldAppend = lastMessage && 
                            lastMessage.role === role && 
                            !isNewTurn;
        
        console.log(`Decision: shouldAppend=${shouldAppend} (lastMessage=${!!lastMessage}, sameRole=${lastMessage?.role === role}, !isNewTurn=${!isNewTurn})`);
        
        if (shouldAppend) {
          console.log(`✓ Appending to existing ${role} message (same turn)`);
          const updated = [...prev];
          updated[prev.length - 1] = {
            ...lastMessage,
            content: lastMessage.content + ' ' + text,
            isVoiceTranscript: true, // Mark as voice transcript
            // Merge citations if present (keep existing, add new)
            citations: citations && citations.length > 0 
              ? [...(lastMessage.citations || []), ...citations]
              : lastMessage.citations,
            // Merge images if present (keep existing, add new)
            images: images && images.length > 0
              ? [...(lastMessage.images || []), ...images]
              : lastMessage.images
          };
          return updated;
        } else {
          // Create a new message (new turn)
          const newTotal = prev.length + 1;
          console.log(`✓ Creating new ${role} message (new turn, total: ${newTotal})${citations && citations.length > 0 ? ` with ${citations.length} citation(s)` : ''}${images && images.length > 0 ? ` with ${images.length} image(s)` : ''}`);
          
          return [...prev, {
            id: generateMessageId(),
            role: role,
            content: text,
            isVoiceTranscript: true, // Mark as voice transcript
            citations: citations && citations.length > 0 ? citations : undefined,
            images: images && images.length > 0 ? images : undefined
          }];
        }
      });
    };

    const handleStarted = () => {
      setIsVoiceMode(true);
      setIsVoiceLoading(false);
      setIsReconnecting(false);
      setVoiceError(null);
      setAudioPlaybackDisabled(false);
      
      // Track session start time for duration calculation
      voiceSessionStartTime.current = Date.now();
      hasShownEndCallSummary.current = false;
      
      // Play start sound effect
      playSoundEffect('/sounds/start.mp3');
      
      // Note: shouldStartNewTurn flag is already set before voiceService.start() is called
      console.log('Voice session started');
    };

    const handleComplete = async (event: Event) => {
      const customEvent = event as CustomEvent<{ transcripts: { user: Array<{ text: string; timestamp: number }>; assistant: Array<{ text: string; timestamp: number }> } }>;
      const { transcripts } = customEvent.detail;
      
      // Note: Transcripts are now added in real-time via handleTranscript
      // This event is just for cleanup and finalization
      // We don't add them to messages again to avoid duplicates
      
      console.log('Voice session complete. Total transcripts:', {
        user: transcripts.user.length,
        assistant: transcripts.assistant.length
      });
      
      // Reset voice state
      setIsVoiceMode(false);
      setIsVoiceLoading(false);
      setIsReconnecting(false);
      setVoiceError(null);
      setAudioPlaybackDisabled(false);
      
      // Reset session start time
      voiceSessionStartTime.current = null;
      
      // Session ended - if it restarts, next transcript should be a new message
      shouldStartNewTurn.current = true;
      console.log('🔴 FLAG SET: Voice session ended - shouldStartNewTurn = TRUE');
    };

    const handleError = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        message: string; 
        originalError?: string;
        details?: { type?: string; suggestion?: string; helpUrl?: string };
        canRetry?: boolean;
        partialTranscripts?: { user: Array<{ text: string; timestamp: number }>; assistant: Array<{ text: string; timestamp: number }> };
      }>;
      const { message, details, canRetry } = customEvent.detail;
      
      console.error('Voice error:', message);
      if (details) {
        console.error('Error details:', details);
      }
      setIsVoiceLoading(false);
      setIsReconnecting(false);
      setVoiceError(message);
      
      // Note: Partial transcripts are already added via handleTranscript in real-time
      // No need to add them again here
      
      // Show error message to user (only if not recoverable)
      if (!canRetry) {
        setIsVoiceMode(false);
        
        // Session ended due to error - if it restarts, next transcript should be a new message
        shouldStartNewTurn.current = true;
        console.log('🔴 FLAG SET: Voice session ended due to error - shouldStartNewTurn = TRUE');
        
        // Build error message with helpful details
        let errorContent = `VOICE ERROR: ${message}`;
        if (details?.suggestion) {
          errorContent += `\n\nSuggestion: ${details.suggestion}`;
        }
        if (details?.helpUrl) {
          errorContent += `\n\nHelp: ${details.helpUrl}`;
        }
        errorContent += `\n\nPLEASE TRY AGAIN OR USE TEXT CHAT.`;
        
        setMessages((prev) => [
          ...prev,
          { 
            id: generateMessageId(), 
            role: "assistant", 
            content: errorContent
          }
        ]);
      } else {
        // Keep voice mode active if we can retry
        setIsReconnecting(true);
        // Don't show error message in chat - it's shown in the error banner
      }
    };

    const handleReconnecting = (event: Event) => {
      const customEvent = event as CustomEvent<{ attempt: number; maxAttempts: number }>;
      setIsReconnecting(true);
      setVoiceError(`Reconnecting... (${customEvent.detail.attempt}/${customEvent.detail.maxAttempts})`);
    };

    const handleAudioError = (event: Event) => {
      const customEvent = event as CustomEvent<{ message: string; recoverable: boolean }>;
      console.warn('Audio playback error:', customEvent.detail.message);
      
      if (!customEvent.detail.recoverable) {
        setAudioPlaybackDisabled(true);
        setMessages((prev) => [
          ...prev,
          { 
            id: generateMessageId(), 
            role: "assistant", 
            content: `NOTE: AUDIO PLAYBACK DISABLED DUE TO FORMAT INCOMPATIBILITY. TRANSCRIPTS WILL STILL BE DISPLAYED.` 
          }
        ]);
      } else {
        // Recoverable error - show temporary message
        setVoiceError(customEvent.detail.message);
        setTimeout(() => setVoiceError(null), 5000);
      }
    };

    const handlePartialTranscripts = (event: Event) => {
      const customEvent = event as CustomEvent<{ transcripts: { user: Array<{ text: string; timestamp: number }>; assistant: Array<{ text: string; timestamp: number }> } }>;
      const { transcripts } = customEvent.detail;
      
      // Note: Partial transcripts are already added via handleTranscript in real-time
      // This event is just for logging/debugging purposes now
      console.log('Partial transcripts received:', {
        user: transcripts.user.length,
        assistant: transcripts.assistant.length
      });
    };

    const handleInterrupted = () => {
      // User interrupted the agent - next transcript should start a new turn
      shouldStartNewTurn.current = true;
      console.log('🔴 FLAG SET: Agent was interrupted - shouldStartNewTurn = TRUE');
    };

    const handleTimeout = async (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        durationSeconds: number; 
        timeoutUntil: number; 
        farewellMessage: string;
      }>;
      const { timeoutUntil, farewellMessage } = customEvent.detail;
      
      console.log('User has been timed out:', customEvent.detail);
      
      // Set timeout in localStorage
      setTimeoutUntil(timeoutUntil);
      setTimeoutUntilState(timeoutUntil);
      setWasBlocked(true);
      
      // Add farewell message to chat
      setMessages((prev) => [
        ...prev,
        { 
          id: generateMessageId(), 
          role: "assistant", 
          content: farewellMessage 
        }
      ]);
      
      // Stop voice session
      try {
        await voiceService.stop();
      } catch (error) {
        console.error('Error stopping voice session after timeout:', error);
      }
      
      // Reset voice UI state
      setIsVoiceMode(false);
      setIsVoiceLoading(false);
      setIsReconnecting(false);
      setVoiceError(null);
      
      // Reset session start time
      voiceSessionStartTime.current = null;
      
      // Session ended due to timeout - if it restarts, next transcript should be a new message
      shouldStartNewTurn.current = true;
      console.log('🔴 FLAG SET: Voice session timed out - shouldStartNewTurn = TRUE');
    };

    const handleEndVoiceSession = async (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        reason: string; 
        closingMessage: string;
        textResponse?: string | null;
      }>;
      const { reason, closingMessage, textResponse } = customEvent.detail;
      
      console.log(`Voice session ended by agent. Reason: ${reason}`);
      
      // Create friendly end-of-call message with duration
      const endCallMessage = buildEndCallMessage(voiceSessionStartTime.current);
      
      // Always show messages: closingMessage (if provided) + friendly end-of-call message
      const messagesToAdd: Message[] = [];
      
      // Add closing message from agent if provided
      if (closingMessage && closingMessage.trim()) {
        messagesToAdd.push({
          id: generateMessageId(),
          role: "assistant",
          content: closingMessage
        });
      }
      
      if (!hasShownEndCallSummary.current) {
        hasShownEndCallSummary.current = true;
        // Always add the friendly end-of-call message with duration
        messagesToAdd.push({
          id: generateMessageId(),
          role: "assistant",
          content: endCallMessage
        });
      }
      
      setMessages((prev) => [...prev, ...messagesToAdd]);
      
      // If there's a full text response (agent's actual answer), add it as a separate message
      if (textResponse && textResponse.trim()) {
        // Normalize the text response to fix formatting issues (especially mermaid diagrams)
        const normalizedResponse = normalizeTextResponse(textResponse);
        
        setMessages((prev) => [
          ...prev,
          { 
            id: generateMessageId(), 
            role: "assistant", 
            content: normalizedResponse 
          }
        ]);
      }
      
      // Reset session start time
      voiceSessionStartTime.current = null;
      
      // Play end sound effect
      playSoundEffect('/sounds/end.mp3');
      
      // Stop voice session gracefully
      try {
        await voiceService.stop();
      } catch (error) {
        console.error('Error stopping voice session after agent ended it:', error);
      }
      
      // Reset voice UI state
      setIsVoiceMode(false);
      setIsVoiceLoading(false);
      setIsReconnecting(false);
      setVoiceError(null);
      
      // Session ended by agent - if it restarts, next transcript should be a new message
      shouldStartNewTurn.current = true;
      console.log('🔴 FLAG SET: Voice session ended by agent - shouldStartNewTurn = TRUE');
    };

    voiceService.addEventListener('transcript', handleTranscript);
    voiceService.addEventListener('started', handleStarted);
    voiceService.addEventListener('complete', handleComplete);
    voiceService.addEventListener('error', handleError);
    voiceService.addEventListener('reconnecting', handleReconnecting);
    voiceService.addEventListener('audioError', handleAudioError);
    voiceService.addEventListener('partialTranscripts', handlePartialTranscripts);
    voiceService.addEventListener('interrupted', handleInterrupted);
    voiceService.addEventListener('timeout', handleTimeout);
    voiceService.addEventListener('endVoiceSession', handleEndVoiceSession);

    return () => {
      voiceService.removeEventListener('transcript', handleTranscript);
      voiceService.removeEventListener('started', handleStarted);
      voiceService.removeEventListener('complete', handleComplete);
      voiceService.removeEventListener('error', handleError);
      voiceService.removeEventListener('reconnecting', handleReconnecting);
      voiceService.removeEventListener('audioError', handleAudioError);
      voiceService.removeEventListener('partialTranscripts', handlePartialTranscripts);
      voiceService.removeEventListener('interrupted', handleInterrupted);
      voiceService.removeEventListener('timeout', handleTimeout);
      voiceService.removeEventListener('endVoiceSession', handleEndVoiceSession);
      
      // Cleanup: Stop voice session if active when component unmounts
      if (voiceService.isSessionActive()) {
        voiceService.stop().catch((error) => {
          console.error('Error stopping voice session on unmount:', error);
        });
      }
    };
  }, []);

  // Monitor timeout expiration
  useEffect(() => {
    if (timeoutUntil && Date.now() >= timeoutUntil && wasBlocked) {
      // Timeout expired naturally - clear it
      clearTimeoutStorage();
      setTimeoutUntilState(null);
      // Keep wasBlocked true so we can detect expiration on next message
    }
  }, [timeoutUntil, wasBlocked]);

  // Check if currently blocked by timeout
  const isTimeoutBlocked = timeoutUntil !== null && Date.now() < timeoutUntil;

  // Check if blocked by budget exhaustion
  const isBlocked = isTimeoutBlocked || budgetExhausted;

  // Detect if timeout just expired (was blocked, now not blocked)
  // This happens when wasBlocked is true but isBlocked is false
  const timeoutJustExpired = wasBlocked && !isTimeoutBlocked;

  // Show conversation starters only when chat is in initial state
  const showSuggestions =
    messages.length === 1 &&
    messages[0].id === "initial-assistant" &&
    !isVoiceMode &&
    !isLoading;

  // Handle clicking a conversation starter - directly submits the message
  const handleStarterClick = (text: string) => {
    if (isLoading || isVoiceMode || isBlocked) return;

    // Directly submit the starter text (bypass input state)
    setMessages((prev) => [...prev, { id: generateMessageId(), role: "user", content: text }]);
    setIsLoading(true);

    // Trigger the chat request
    const submitStarter = async () => {
      try {
        const requestMessages: Message[] = [
          ...messages,
          { id: generateMessageId(), role: "user", content: text }
        ];

        const assistantMessageId = generateMessageId();
        setMessages((prev) => [...prev, { id: assistantMessageId, role: "assistant", content: "", streaming: true }]);

        let streamedContent = "";

      await streamChatResponse(
        { 
          messages: requestMessages, 
          timeoutExpired: false,
          userId: getUserId()
        },
          (chunk) => {
            streamedContent += chunk;
            // Strip metadata markers during streaming so they don't appear in UI
            const displayContent = stripSuggestionsFromContent(streamedContent);
            setMessages((prev) => {
              const updated = [...prev];
              const lastIndex = updated.length - 1;
              if (lastIndex >= 0 && updated[lastIndex].id === assistantMessageId) {
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  content: displayContent,
                  streaming: true,
                };
              }
              return updated;
            });
            scrollToBottom();
          },
          (error) => {
            console.error("Stream error:", error);
            setIsLoading(false);
            setLoadingStatus(null);
          },
          (status) => {
            setLoadingStatus(status);
          }
        );

        setLoadingStatus(null);
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (lastIndex >= 0 && updated[lastIndex].id === assistantMessageId) {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: streamedContent,
              streaming: false,
            };
          }
          return updated;
        });
      } catch (error) {
        console.error("Chat error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        setMessages((prev) => [
          ...prev,
          { id: generateMessageId(), role: "assistant", content: `ERROR: ${errorMessage}. PLEASE TRY AGAIN.` }
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    submitStarter();
  };

  const resetTimeout = () => {
    clearTimeoutStorage();
    setTimeoutUntilState(null);
    setWasBlocked(false);
  };

  const handleFixDiagram = async (
    messageIndex: number,
    error: { source: string; message: string; fullContent: string }
  ) => {
    if (isLoading) return; // Don't allow fixes while loading

    const messageToFix = messages[messageIndex];
    if (!messageToFix || messageToFix.role !== "assistant") return;

    setIsLoading(true);

    try {
      // Create a fix request that includes the error context
      const fixPrompt = `IMPORTANT: A MERMAID DIAGRAM IN YOUR PREVIOUS RESPONSE FAILED TO RENDER.

ERROR DETAILS:
${error.message}

FAILED MERMAID SOURCE CODE:
\`\`\`mermaid
${error.source}
\`\`\`

YOUR PREVIOUS RESPONSE (that contains the broken diagram):
${error.fullContent}

PLEASE FIX THE MERMAID DIAGRAM SYNTAX AND REGENERATE YOUR RESPONSE WITH THE CORRECTED DIAGRAM. Ensure the diagram follows valid Mermaid syntax and will render correctly.`;

      const fixMessages: Message[] = [
        ...messages.slice(0, messageIndex),
        { id: generateMessageId(), role: "user", content: fixPrompt }
      ];

      let fixedContent = "";

      await streamChatResponse(
        { 
          messages: fixMessages, 
          timeoutExpired: false,
          userId: getUserId()
        },
        (chunk) => {
          fixedContent += chunk;
          setMessages((prev) => {
            const updated = [...prev];
            updated[messageIndex] = {
              ...updated[messageIndex],
              content: fixedContent,
              streaming: true,
            };
            return updated;
          });
          scrollToBottom();
        },
          (error) => {
            console.error("Error fixing diagram:", error);
            setLoadingStatus(null);
            const errorMessage = error.message;
            setMessages((prev) => {
              const updated = [...prev];
              updated[messageIndex] = {
                ...updated[messageIndex],
                content: updated[messageIndex].content + `\n\n[Error fixing diagram: ${errorMessage}]`,
              };
              return updated;
            });
          },
          (status) => {
            setLoadingStatus(status);
          }
      );

      // Mark streaming as complete
      setLoadingStatus(null);
      setMessages((prev) => {
        const updated = [...prev];
        updated[messageIndex] = {
          ...updated[messageIndex],
          content: fixedContent,
          streaming: false,
        };
        return updated;
      });
    } catch (error) {
      console.error("Error fixing diagram:", error);
      // Show error but don't update message
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      // Add error indicator to the message
      setMessages((prev) => {
        const updated = [...prev];
        updated[messageIndex] = {
          ...updated[messageIndex],
          content: updated[messageIndex].content + `\n\n[Error fixing diagram: ${errorMessage}]`,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading || isVoiceMode) return;

    // Check if user is timed out before sending
    if (isBlocked) {
      setInput("");
      return;
    }

    // Unlock audio context during user interaction (required for mobile)
    // This ensures sounds play if agent starts voice session in response
    unlockAudio();

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { id: generateMessageId(), role: "user", content: userMessage }]);
    setIsLoading(true);

    // Check if timeout just expired - if so, pass that context to the API
    const expired = timeoutJustExpired;

    try {
      // Count actual voice transcripts (messages marked with isVoiceTranscript flag)
      const voiceTranscriptMessages = messages.filter(m => m.isVoiceTranscript === true);
      const transcriptCount = voiceTranscriptMessages.length;
      
      console.log(`Preparing requestMessages: ${messages.length} messages (including ${transcriptCount} from voice session)`);
      
      const requestMessages: Message[] = [
        ...messages,
        { id: generateMessageId(), role: "user", content: userMessage }
      ];
      
      // Count voice transcripts in the request (excluding the new user message we just added)
      const voiceTranscriptsInRequest = requestMessages.filter(m => m.isVoiceTranscript === true);
      const userVoiceTranscripts = voiceTranscriptsInRequest.filter(m => m.role === 'user').length;
      const assistantVoiceTranscripts = voiceTranscriptsInRequest.filter(m => m.role === 'assistant').length;
      
      console.log(`Sending to text API: ${requestMessages.length} messages with ${voiceTranscriptsInRequest.length} voice transcripts`);
      console.log(`Voice transcripts included in API call: user=${userVoiceTranscripts}, assistant=${assistantVoiceTranscripts}`);

      // Create placeholder assistant message for streaming
      const assistantMessageId = generateMessageId();
      setMessages((prev) => [...prev, { id: assistantMessageId, role: "assistant", content: "", streaming: true }]);

      // Try streaming first
      let streamedContent = "";
      let streamCompleted = false;

      try {
        const response = await streamChatResponse(
          { messages: requestMessages, timeoutExpired: expired || false },
          (chunk) => {
            if (!streamCompleted) {
              streamedContent += chunk;
              // Strip metadata markers during streaming so they don't appear in UI
              const displayContent = stripSuggestionsFromContent(streamedContent);
              setMessages((prev) => {
                const updated = [...prev];
                const lastIndex = updated.length - 1;
                if (lastIndex >= 0 && updated[lastIndex].id === assistantMessageId) {
                  updated[lastIndex] = {
                    ...updated[lastIndex],
                    content: displayContent,
                    streaming: true,
                  };
                }
                return updated;
              });
              scrollToBottom();
            }
          },
          (error) => {
            console.error("Stream error:", error);
            setIsLoading(false);
            setLoadingStatus(null);
            setMessages((prev) => {
              const updated = [...prev];
              const lastIndex = updated.length - 1;
              if (lastIndex >= 0 && updated[lastIndex].id === assistantMessageId) {
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  content: error.message,
                  streaming: false,
                };
              }
              return updated;
            });
          },
          (status) => {
            setLoadingStatus(status);
          }
        );

        streamCompleted = true;
        setIsLoading(false);
        setLoadingStatus(null);

        // Check if response is JSON (tool call) and handle startVoiceSession
        if (response && response.startVoiceSession) {
          // Start voice session - same logic as voice button click
          try {
            setIsVoiceLoading(true);
            
            // Agent starting voice session - next transcript should be a new message
            shouldStartNewTurn.current = true;
            console.log('🔴 FLAG SET: Agent starting voice mode (streaming) - shouldStartNewTurn = TRUE');
            
            // Prepare conversation history for context injection
            const conversationHistory = messages.map(m => ({
              role: m.role,
              content: m.content
            }));
            
            // Start voice session with pending request if specified
            const pendingRequest = response.pendingRequest || null;
            if (pendingRequest) {
              console.log(`📌 Voice session starting with pending request: "${pendingRequest}"`);
            }
            await voiceService.start(conversationHistory, pendingRequest, getUserId());
            // Session started event will update state
          } catch (error) {
            console.error('Error starting voice session:', error);
            setIsVoiceLoading(false);
            setVoiceError(error instanceof Error ? error.message : 'Failed to start voice session');
          }
        }

        // Check for timeout in response
        if (response && response.timeout) {
          const { until } = response.timeout;
          setTimeoutUntil(until);
          setTimeoutUntilState(until);
          setWasBlocked(true);
        } else if (expired) {
          // Timeout expired and user sent a message - reset the flag
          setWasBlocked(false);
        }

        // Mark streaming as complete
        setLoadingStatus(null);

        // Extract suggestions and clean content
        const parsedSuggestions = extractSuggestionsFromContent(streamedContent);
        const cleanContent = stripSuggestionsFromContent(streamedContent);

        // Update message with clean content and suggestions
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (lastIndex >= 0 && updated[lastIndex].id === assistantMessageId) {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: cleanContent,
              streaming: false,
              suggestions: parsedSuggestions
            };
          }
          return updated;
        });
      } catch (streamError) {
        // Handle budget exhaustion error
        if (streamError instanceof BudgetExhaustedError) {
          setBudgetExhausted(true);
          setBudgetExhaustedState(true);
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            if (lastIndex >= 0 && updated[lastIndex].id === assistantMessageId) {
              updated[lastIndex] = {
                ...updated[lastIndex],
                content: BUDGET_EXHAUSTED_MESSAGE,
                streaming: false,
              };
            }
            return updated;
          });
          return;
        }

        // If streaming fails, try JSON fallback
        if (streamError instanceof OverloadedError) {
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            if (lastIndex >= 0 && updated[lastIndex].id === assistantMessageId) {
              updated[lastIndex] = {
                ...updated[lastIndex],
                content: `ERROR: ${streamError.message}. PLEASE TRY AGAIN.`,
                streaming: false,
              };
            }
            return updated;
          });
          return;
        }

        // Fallback to JSON request
        const data = await sendChatRequest({ 
          messages: requestMessages, 
          timeoutExpired: expired || false,
          userId: getUserId()
        });

        // Check if Fram decided to timeout the user
        if (data.timeout) {
          const { until } = data.timeout;
          setTimeoutUntil(until);
          setTimeoutUntilState(until);
          setWasBlocked(true);
        } else if (expired) {
          // Timeout expired and user sent a message - reset the flag
          setWasBlocked(false);
        }

        // Check if Fram wants to start voice session
        if (data.startVoiceSession) {
          // Start voice session - same logic as voice button click
          try {
            setIsVoiceLoading(true);
            
            // Agent starting voice session - next transcript should be a new message
            shouldStartNewTurn.current = true;
            console.log('🔴 FLAG SET: Agent starting voice mode (JSON) - shouldStartNewTurn = TRUE');
            
            // Prepare conversation history for context injection
            const conversationHistory = messages.map(m => ({
              role: m.role,
              content: m.content
            }));
            
            // Start voice session with pending request if specified
            const pendingRequest = data.pendingRequest || null;
            if (pendingRequest) {
              console.log(`📌 Voice session starting with pending request: "${pendingRequest}"`);
            }
            await voiceService.start(conversationHistory, pendingRequest, getUserId());
            // Session started event will update state
          } catch (error) {
            console.error('Error starting voice session:', error);
            setIsVoiceLoading(false);
            setVoiceError(error instanceof Error ? error.message : 'Failed to start voice session');
          }
        }

        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (lastIndex >= 0 && updated[lastIndex].id === assistantMessageId) {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: data.message || data.error || "ERROR: COULD NOT GET RESPONSE.",
              streaming: false,
            };
          }
          return updated;
        });
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      setMessages((prev) => [
        ...prev,
        { id: generateMessageId(), role: "assistant", content: `ERROR: ${errorMessage}. PLEASE TRY AGAIN.` }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = async () => {
    if (window.confirm("Are you sure you want to clear all chat history? This cannot be undone.")) {
      // Stop any active voice session first to clear server-side history
      if (voiceService.isSessionActive()) {
        try {
          await voiceService.stop();
        } catch (error) {
          console.error('Error stopping voice session during clear:', error);
          // Continue with clearing even if stop fails
        }
      }
      
      // Clear localStorage
      clearChatHistory();
      
      // Clear voice service's conversation history to prevent bleeding
      voiceService.clearConversationHistory();
      
      // Reset component state to initial message
      setMessages([
        { id: "initial-assistant", role: "assistant", content: "HELLO. HOW CAN I HELP YOU TODAY?" }
      ]);
      
      // Reset voice-related state
      setIsVoiceMode(false);
      setIsVoiceLoading(false);
      setVoiceError(null);
      voiceSessionStartTime.current = null;
      shouldStartNewTurn.current = true;
    }
  };

  return (
    <section className={`w-full max-w-[28rem] md:max-w-[950px] mx-auto px-4 pt-12 md:pt-0 pb-0 md:pb-0 h-fit md:flex-1 md:flex md:flex-col md:min-h-0 overflow-x-hidden transition-colors duration-300 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
      {/* Messages wrapper - extends to top on desktop */}
      <div className="flex flex-col h-[600px] md:flex-1 md:min-h-0 font-mono text-[0.875rem]">
        <div ref={messagesContainerRef} className={`h-[600px] md:flex-1 md:min-h-0 overflow-y-auto overflow-x-hidden mb-2 scrollbar-boxy ${isDark ? 'scrollbar-dark' : ''}`}>
          {/* Header - sticky at top of scroll area */}
          <div className={`mb-10 md:mb-0 sticky top-0 z-10 backdrop-blur-sm md:py-6 md:-mx-4 md:px-4 text-center flex-shrink-0 flex items-center justify-center gap-4 transition-colors duration-300 ${isDark ? 'bg-gray-900/80' : 'bg-white/80'}`}>
            <p className={`text-[0.75rem] font-mono tracking-wider transition-colors duration-300 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>FRAM ASSISTANT</p>
            <button
              onClick={handleClearChat}
              className={`text-[0.7rem] font-mono uppercase tracking-wider transition-colors underline ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
              title="Clear chat history"
            >
              Clear
            </button>
          </div>
          
          {/* Messages content */}
          <div className="space-y-6">
          {messages.map((message, index) => {
            // Skip rendering empty streaming assistant messages - they'll be shown via loading indicator
            if (message.role === "assistant" && message.streaming && !message.content.trim()) {
              return null;
            }
            
            return (
              <div
                key={message.id || index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] overflow-x-hidden ${
                    message.role === "user"
                      ? "text-right"
                      : "text-left"
                  }`}
                >
                  <p className={`uppercase text-[0.75rem] mb-1 tracking-wider transition-colors duration-300 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {message.role === "user" ? "You" : "FRAM"}
                  </p>
                  {message.role === "assistant" ? (
                    <>
                      <div className={`leading-relaxed overflow-x-hidden break-words transition-colors duration-300 ${isDark ? 'text-gray-100' : 'text-black'}`}>
                        <MarkdownWithMermaid
                          content={stripSuggestionsFromContent(message.content)}
                          isStreaming={message.streaming}
                          onFixDiagram={async (error) => {
                            await handleFixDiagram(index, error);
                          }}
                        />
                      </div>
                      {message.images && message.images.length > 0 && (
                        <div className="mt-3">
                          {message.images.map((markdown, idx) => (
                            <div key={idx} className="mb-2">
                              <MarkdownWithMermaid content={markdown} isStreaming={false} />
                            </div>
                          ))}
                        </div>
                      )}
                      {message.citations && message.citations.length > 0 && (
                        <div className={`mt-3 pt-3 transition-colors duration-300 ${isDark ? 'border-t border-gray-700' : 'border-t border-gray-200'}`}>
                          <p className={`text-[0.7rem] uppercase tracking-wider mb-2 transition-colors duration-300 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Sources</p>
                          <ul className="space-y-1">
                            {message.citations.map((citation, idx) => (
                              <li key={idx} className="text-[0.75rem]">
                                <a
                                  href={citation.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`underline break-all transition-colors duration-300 ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'}`}
                                >
                                  {citation.title || citation.url}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {/* Only show suggestions on the last message */}
                      {(() => {
                        // Get suggestions from message or extract from content as fallback
                        const suggestions = message.suggestions || extractSuggestionsFromContent(message.content);
                        if (!suggestions || suggestions.length === 0 || message.streaming || index !== messages.length - 1) {
                          return null;
                        }
                        return (
                          <div className="mt-4 flex flex-col gap-2 items-start">
                            {suggestions.map((suggestion, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  if (isLoading || isVoiceMode || isBlocked) return;
                                  // Clear suggestions from this message before submitting
                                  setMessages((prev) => {
                                    const updated = [...prev];
                                    const msgIndex = updated.findIndex(m => m.id === message.id);
                                    if (msgIndex !== -1) {
                                      // Strip suggestions from content and clear the suggestions property
                                      updated[msgIndex] = { 
                                        ...updated[msgIndex], 
                                        content: stripSuggestionsFromContent(updated[msgIndex].content),
                                        suggestions: undefined 
                                      };
                                    }
                                    return updated;
                                  });
                                  handleStarterClick(suggestion);
                                }}
                                disabled={isLoading || isVoiceMode || isBlocked}
                                className={`text-[0.75rem] font-mono uppercase tracking-wider transition-colors px-3 py-1.5 border rounded disabled:opacity-50 disabled:cursor-not-allowed text-left ${isDark ? 'text-gray-400 hover:text-gray-100 border-gray-600 hover:border-gray-400' : 'text-gray-400 hover:text-black border-gray-300 hover:border-black'}`}
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <p className={`leading-relaxed break-words overflow-x-hidden transition-colors duration-300 ${isDark ? 'text-gray-100' : 'text-black'}`}>
                      {message.content}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          {isLoading && (
             <div className="flex justify-start">
               <div className="max-w-[85%] text-left">
                 <p className={`uppercase text-[0.75rem] mb-1 tracking-wider transition-colors duration-300 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>FRAM</p>
                 {loadingStatus ? (
                   <div className={`leading-relaxed transition-colors duration-300 ${isDark ? 'text-gray-100' : 'text-black'}`}>
                     <span className={isDark ? 'tool-status-gradient-dark' : 'tool-status-gradient'}>{loadingStatus}</span>
                   </div>
                 ) : (
                   <div className="flex space-x-1 items-center h-6">
                     <div className={`w-1.5 h-1.5 rounded-full animate-bounce transition-colors duration-300 ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} style={{ animationDelay: '0ms' }} />
                     <div className={`w-1.5 h-1.5 rounded-full animate-bounce transition-colors duration-300 ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} style={{ animationDelay: '150ms' }} />
                     <div className={`w-1.5 h-1.5 rounded-full animate-bounce transition-colors duration-300 ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} style={{ animationDelay: '300ms' }} />
                   </div>
                 )}
               </div>
             </div>
          )}
          <div ref={messagesEndRef} />
          </div>
        </div>

        {isBlocked ? (
          <div className={`py-4 flex-shrink-0 transition-colors duration-300 ${isDark ? 'border-t border-gray-700' : 'border-t border-gray-200'}`}>
            <p className={`text-[0.8rem] leading-relaxed mb-4 transition-colors duration-300 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {budgetExhausted ? BUDGET_EXHAUSTED_MESSAGE : BLOCKED_MESSAGE}
            </p>
            {budgetExhausted && (
              <div className="flex justify-start">
                <a
                  href="mailto:andrei@fram.design?subject=Partner%20Account%20Request&body=Hi%20Andrei%2C%0A%0AI've%20reached%20my%20conversation%20limit%20with%20Fram%20and%20would%20like%20to%20upgrade%20to%20a%20partner%20account.%0A%0AThanks!"
                  className={`text-[0.75rem] font-mono uppercase tracking-wider transition-colors px-3 py-1.5 border rounded ${isDark ? 'text-gray-400 hover:text-gray-100 border-gray-600 hover:border-gray-400' : 'text-gray-400 hover:text-black border-gray-300 hover:border-black'}`}
                >
                  Send Email
                </a>
              </div>
            )}
            {process.env.NODE_ENV === 'development' && !budgetExhausted && (
              <div className="text-center">
                <button
                  onClick={resetTimeout}
                  className={`text-[0.7rem] uppercase tracking-wider underline transition-colors duration-300 ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Reset timeout (dev)
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-shrink-0 md:h-32">
            {/* Conversation Starters - vertically stacked, left-aligned, above prompt input */}
            {showSuggestions && (
              <div className="max-w-[500px] mx-auto w-full mb-4">
                <div className="flex flex-col gap-y-4 md:gap-y-2 items-start">
                  {conversationStarters.map((starter, index) => (
                    <button
                      key={index}
                      onClick={() => handleStarterClick(starter)}
                      className={`text-[0.75rem] font-mono uppercase tracking-wider transition-colors text-left ${isDark ? 'text-gray-400 hover:text-gray-100' : 'text-gray-400 hover:text-black'}`}
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <form onSubmit={handleSubmit} className="relative max-w-[500px] mx-auto w-full">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                disabled={isVoiceMode}
                className={`w-full bg-transparent py-2 pr-12 focus:outline-none transition-colors rounded-none resize-none overflow-y-auto max-h-[120px] disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'border-b border-gray-600 focus:border-gray-400 placeholder:text-gray-600 text-gray-100' : 'border-b border-gray-300 focus:border-black placeholder:text-gray-300 text-black'}`}
                placeholder={isVoiceMode ? "Voice mode active..." : "Type your message..."}
              />
              <button
                type="submit"
                disabled={isLoading || isVoiceMode || !input.trim()}
                className={`absolute right-0 top-2 text-[0.75rem] uppercase tracking-wider transition-colors ${isDark ? 'text-gray-100 disabled:text-gray-600 hover:text-gray-300' : 'text-black disabled:text-gray-300 hover:text-gray-600'}`}
              >
                Send
              </button>
            </form>
            
            {/* Voice Mode Controls */}
            <div className="flex flex-col mt-4 space-y-2">
            {/* Voice Error Display */}
            {voiceError && (
              <div className={`w-full max-w-[500px] mx-auto px-4 py-2 rounded text-[0.75rem] font-mono ${
                isReconnecting
                  ? isDark
                    ? 'bg-yellow-900/30 border border-yellow-700/50 text-yellow-300'
                    : 'bg-yellow-50 border border-yellow-200 text-yellow-700'
                  : isDark
                    ? 'bg-red-900/30 border border-red-700/50 text-red-300'
                    : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                <p className="uppercase text-[0.7rem] mb-1 tracking-wider">
                  {isReconnecting ? 'Reconnecting' : 'Error'}
                </p>
                <div>{voiceError}</div>
              </div>
            )}

            {/* Audio Playback Disabled Notice */}
            {audioPlaybackDisabled && isVoiceMode && (
              <div className={`w-full max-w-[500px] mx-auto px-4 py-2 rounded text-[0.75rem] font-mono ${isDark ? 'bg-yellow-900/30 border border-yellow-700/50 text-yellow-300' : 'bg-yellow-50 border border-yellow-200 text-yellow-700'}`}>
                <p className="uppercase text-[0.7rem] mb-1 tracking-wider">Audio Disabled</p>
                <div>Audio playback unavailable. Transcripts will still be displayed.</div>
              </div>
            )}
            
            {/* Voice Button Container */}
            <div className="max-w-[500px] mx-auto w-full flex justify-end">
              <button
              onClick={async () => {
                // Unlock audio context during user interaction (required for mobile)
                await unlockAudio();
                
                if (isVoiceMode) {
                  // End voice mode
                  try {
                    if (!hasShownEndCallSummary.current) {
                      hasShownEndCallSummary.current = true;
                      const endCallMessage = buildEndCallMessage(voiceSessionStartTime.current);
                      setMessages((prev) => [
                        ...prev,
                        { id: generateMessageId(), role: "assistant", content: endCallMessage }
                      ]);
                    }
                    
                    // Play end sound effect
                    playSoundEffect('/sounds/end.mp3');
                    
                    // Reset session start time
                    voiceSessionStartTime.current = null;
                    
                    await voiceService.stop();
                    // Transcripts will be integrated via the 'complete' event handler
                  } catch (error) {
                    console.error('Error stopping voice session:', error);
                    setIsVoiceMode(false);
                    setIsVoiceLoading(false);
                  } finally {
                    // Reset session start time
                    voiceSessionStartTime.current = null;
                  }
                } else {
                  // Start voice mode
                  try {
                    setIsVoiceLoading(true);
                    
                    // User manually starting voice - next transcript should be a new message
                    shouldStartNewTurn.current = true;
                    console.log('🔴 FLAG SET: User starting voice mode - shouldStartNewTurn = TRUE');
                    
                    // Prepare conversation history for context injection
                    const conversationHistory = messages.map(m => ({
                      role: m.role,
                      content: m.content
                    }));
                    
                    // Start voice session
                    await voiceService.start(conversationHistory);
                    // Session started event will update state
                  } catch (error) {
                    console.error('Error starting voice session:', error);
                    setIsVoiceLoading(false);
                    setIsVoiceMode(false);
                    
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    let userFriendlyMessage = errorMessage;
                    
                    // Provide specific guidance based on error type
                    if (errorMessage.includes('permission') || errorMessage.includes('denied')) {
                      userFriendlyMessage = 'Microphone permission denied. Please grant microphone access in your browser settings and try again.';
                    } else if (errorMessage.includes('WebSocket') || errorMessage.includes('connection')) {
                      userFriendlyMessage = 'Could not connect to voice server. Please check your internet connection and try again.';
                    } else if (errorMessage.includes('Invalid WebSocket URL')) {
                      userFriendlyMessage = 'Voice server not configured. Please contact support.';
                    }
                    
                    setMessages((prev) => [
                      ...prev,
                      { 
                        id: generateMessageId(), 
                        role: "assistant", 
                        content: `VOICE ERROR: ${userFriendlyMessage}. YOU CAN CONTINUE USING TEXT CHAT.` 
                      }
                    ]);
                  }
                }
              }}
              disabled={isVoiceLoading || isLoading}
              className={`text-[0.75rem] uppercase tracking-wider transition-colors ${
                isVoiceMode
                  ? isDark
                    ? "text-red-400 hover:text-red-300"
                    : "text-red-600 hover:text-red-700"
                  : isDark
                    ? "text-gray-100 hover:text-gray-300"
                    : "text-black hover:text-gray-600"
              } ${isVoiceLoading || isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {isVoiceLoading ? (
                "Starting..."
              ) : isVoiceMode ? (
                "END"
              ) : (
                "VOICE"
              )}
              </button>
            </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
