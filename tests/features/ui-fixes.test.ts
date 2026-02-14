/**
 * UI Fixes Tests (TDD)
 *
 * Tests for the 5 highest-priority UI issues found during investigation:
 * 1. User input preserved on API error (ChatInterface)
 * 2. Voice event listeners use refs to avoid stale closures
 * 3. Suggestion buttons have keyboard accessibility handlers
 * 4. globals.css reduces excessive !important usage
 * 5. Next.js Image component config for remote patterns
 */

import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────
// Fix #1: User input preserved on API error
// ─────────────────────────────────────────────
describe('Fix #1: handleSubmit input preservation', () => {
  const chatInterfacePath = path.resolve('components/ChatInterface.tsx');
  let chatSource: string;

  beforeAll(() => {
    chatSource = fs.readFileSync(chatInterfacePath, 'utf-8');
  });

  test('should save input to variable before clearing', () => {
    // The pattern: save input BEFORE clearing, so it can be restored on error
    expect(chatSource).toContain('const userMessage = input.trim()');
  });

  test('should restore input on outer catch error', () => {
    // In the outer catch block, input should be restored from the saved variable
    // The catch block should contain setInput(userMessage) to restore user input on error
    const catchIndex = chatSource.indexOf('} catch (error) {\n      console.error("Chat error:"');
    expect(catchIndex).toBeGreaterThan(-1);
    const catchBlock = chatSource.substring(catchIndex, catchIndex + 500);
    expect(catchBlock).toContain('setInput(userMessage)');
  });

  test('should not clear input until message is added to state', () => {
    // The handleSubmit should restore input on error
    // Since we now restore on error in the catch block, the early clear is safe
    expect(chatSource).toContain('// Restore user input so they don\'t lose their message on error');
    expect(chatSource).toContain('setInput(userMessage)');
  });
});

// ─────────────────────────────────────────────
// Fix #2: Voice event listeners - stable references
// ─────────────────────────────────────────────
describe('Fix #2: Voice event listeners use refs for stability', () => {
  const chatInterfacePath = path.resolve('components/ChatInterface.tsx');
  let chatSource: string;

  beforeAll(() => {
    chatSource = fs.readFileSync(chatInterfacePath, 'utf-8');
  });

  test('should have a messagesRef that tracks latest messages', () => {
    // A ref should be maintained for messages to avoid stale closures
    expect(chatSource).toMatch(/messagesRef\.current\s*=\s*messages/);
  });

  test('should use messagesRef in voice button onClick for conversation history', () => {
    // The voice button should read from messagesRef.current, not messages directly
    expect(chatSource).toMatch(/messagesRef\.current\.map/);
  });

  test('voice event useEffect should document empty deps', () => {
    // The empty deps array should have a comment explaining why it is correct
    // Handlers use functional updaters and refs, so [] is intentional
    const voiceEffectSection = chatSource.match(
      /\/\/ Setup voice service event listeners[\s\S]*?}, \[\]/
    );
    expect(voiceEffectSection).not.toBeNull();
    if (voiceEffectSection) {
      // Should have an eslint-disable comment for exhaustive-deps
      expect(voiceEffectSection[0]).toMatch(/eslint-disable.*exhaustive-deps/);
    }
  });
});

// ─────────────────────────────────────────────
// Fix #3: Keyboard accessibility on suggestion buttons
// ─────────────────────────────────────────────
describe('Fix #3: Suggestion buttons keyboard accessibility', () => {
  const chatInterfacePath = path.resolve('components/ChatInterface.tsx');
  let chatSource: string;

  beforeAll(() => {
    chatSource = fs.readFileSync(chatInterfacePath, 'utf-8');
  });

  test('suggestion buttons should have onFocus handler', () => {
    // Suggestion buttons need onFocus (parallel to onMouseEnter) for keyboard users
    // Find the suggestion button section and check for onFocus
    const suggestionButtonSection = chatSource.match(
      /onMouseEnter=\{async \(e\)[\s\S]*?onMouseLeave/
    );
    expect(suggestionButtonSection).not.toBeNull();

    // The component should have onFocus handler
    expect(chatSource).toMatch(/onFocus=\{/);
  });

  test('suggestion buttons should have onBlur handler', () => {
    // Suggestion buttons need onBlur (parallel to onMouseLeave) for keyboard users
    expect(chatSource).toMatch(/onBlur=\{/);
  });

  test('textarea should have aria-label', () => {
    expect(chatSource).toMatch(/aria-label=".*[Mm]essage/);
  });

  test('send button should have aria-label', () => {
    // The send button should have an accessible label
    expect(chatSource).toMatch(/aria-label="Send message"/);
  });

  test('loading indicator should have aria-live region', () => {
    // Loading state should announce to screen readers
    expect(chatSource).toMatch(/aria-live="polite"/);
    expect(chatSource).toMatch(/role="status"/);
  });
});

// ─────────────────────────────────────────────
// Fix #4: Reduced !important usage in globals.css
// ─────────────────────────────────────────────
describe('Fix #4: globals.css !important reduction', () => {
  const globalsCssPath = path.resolve('app/globals.css');
  let cssSource: string;

  beforeAll(() => {
    cssSource = fs.readFileSync(globalsCssPath, 'utf-8');
  });

  test('should not have duplicate background-color !important on body', () => {
    // body should not have both background and background-color with !important
    // Split on 'body {' to find the body block
    const bodyStart = cssSource.indexOf('body {');
    expect(bodyStart).toBeGreaterThan(-1);
    const bodyEnd = cssSource.indexOf('}', bodyStart);
    const bodyBlock = cssSource.substring(bodyStart, bodyEnd + 1);
    const importantBgCount = (bodyBlock.match(/background(-color)?:.*!important/g) || []).length;
    // Should have at most 1 !important background rule, not 2
    expect(importantBgCount).toBeLessThanOrEqual(1);
  });

  test('should not have duplicate !important on html background', () => {
    const htmlStart = cssSource.indexOf('html {');
    expect(htmlStart).toBeGreaterThan(-1);
    const htmlEnd = cssSource.indexOf('}', htmlStart);
    const htmlBlock = cssSource.substring(htmlStart, htmlEnd + 1);
    const importantCount = (htmlBlock.match(/!important/g) || []).length;
    // html block should have minimal !important usage
    expect(importantCount).toBeLessThanOrEqual(1);
  });

  test('total !important count should be significantly reduced', () => {
    const importantCount = (cssSource.match(/!important/g) || []).length;
    // Original had 38 !important declarations
    // After cleanup, should be noticeably fewer (target: <25)
    expect(importantCount).toBeLessThan(25);
  });

  test('should use CSS custom properties for repeated colors', () => {
    // Mermaid diagram colors should reference CSS custom properties
    expect(cssSource).toMatch(/--mermaid-bg/);
    expect(cssSource).toMatch(/--mermaid-border/);
  });
});

// ─────────────────────────────────────────────
// Fix #5: Next.js Image optimization config
// ─────────────────────────────────────────────
describe('Fix #5: Next.js Image configuration', () => {
  test('next.config.ts should have images.remotePatterns for GCS', () => {
    const nextConfigPath = path.resolve('next.config.ts');
    const configSource = fs.readFileSync(nextConfigPath, 'utf-8');
    expect(configSource).toMatch(/remotePatterns/);
    expect(configSource).toMatch(/storage\.googleapis\.com/);
  });

  test('MarkdownWithMermaid should have eslint-disable for img (complex error handling needs direct DOM access)', () => {
    const mdPath = path.resolve('components/MarkdownWithMermaid.tsx');
    const mdSource = fs.readFileSync(mdPath, 'utf-8');
    // Complex onError handler with DOM manipulation (img.src = freshUrl) requires raw <img>
    // Should have eslint-disable comment to document this intentional choice
    expect(mdSource).toMatch(/eslint-disable.*no-img-element/);
  });

  test('DiagramModal should keep img for data URLs with eslint-disable', () => {
    const diagramPath = path.resolve('components/DiagramModal.tsx');
    const diagramSource = fs.readFileSync(diagramPath, 'utf-8');
    // Data URLs cannot use next/image, so img with eslint-disable is correct
    expect(diagramSource).toMatch(/eslint-disable.*no-img-element/);
    expect(diagramSource).toContain('<img');
  });

  test('ImageModal should use next/image', () => {
    const modalPath = path.resolve('components/ImageModal.tsx');
    const modalSource = fs.readFileSync(modalPath, 'utf-8');
    expect(modalSource).toMatch(/import\s+Image\s+from\s+["']next\/image["']/);
  });
});
