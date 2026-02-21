# Chat Section Restructure — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the Chat section with floating header/prompt overlays, multi-state action button, and CSS fade gradients.

**Architecture:** The chat area becomes a `position: relative` container holding a scrollable message area, with two absolutely-positioned overlay zones (header at top, prompt at bottom) and gradient divs masking the scroll edges. The separate voice and send buttons merge into a single multi-state button.

**Tech Stack:** React 19, Tailwind CSS v4, existing ChatInterface.tsx component

---

### Task 1: Add fade gradient CSS classes

**Files:**
- Modify: `app/globals.css:318` (append after scrollbar styles)

**Step 1: Add the gradient utility classes**

Add to the end of `globals.css`:

```css
/* Chat scroll fade gradients — fade messages into background at edges */
.chat-fade-top,
.chat-fade-bottom {
  pointer-events: none;
  position: absolute;
  left: 0;
  right: 0;
  z-index: 10;
  height: 48px;
}

.chat-fade-top {
  top: 0;
  background: linear-gradient(to bottom, #1f2937 0%, transparent 100%);
}

.chat-fade-bottom {
  bottom: 0;
  background: linear-gradient(to top, #1f2937 0%, transparent 100%);
}

/* Light mode fade gradients */
.chat-fade-top-light {
  background: linear-gradient(to bottom, #ffffff 0%, transparent 100%);
}

.chat-fade-bottom-light {
  background: linear-gradient(to top, #ffffff 0%, transparent 100%);
}
```

**Step 2: Verify no conflicts**

Run: `npm run lint`
Expected: No CSS errors

**Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: add chat fade gradient CSS classes"
```

---

### Task 2: Restructure container layout — relative wrapper + scrollable messages

This is the core structural change. We convert the current flexbox layout to a relative-positioned container with absolutely-positioned overlays.

**Files:**
- Modify: `components/ChatInterface.tsx:1723-1955` (return JSX)

**Current structure (lines 1723-1955):**
```
<section>                          ← chat section
  <div>                            ← messages wrapper (flex col)
    <div ref={messagesContainerRef}> ← scroll container
      <div> (header - sticky)
      <div> (messages)
      <div ref={messagesEndRef}>
    </div>
    {isBlocked ? (blocked) : (prompt + voice)}
  </div>
</section>
```

**New structure:**
```
<section>                          ← chat section
  <div class="relative">           ← container (position anchor)
    <div ref={messagesContainerRef}> ← scroll area (full height, overflow-y-auto)
      <div> (messages — with top/bottom padding for overlays)
      <div ref={messagesEndRef}>
    </div>
    <div> (top fade gradient)
    <div> (bottom fade gradient)
    <div> (floating header — absolute top-right)
    {isBlocked ? (blocked) : (floating prompt — absolute bottom)}
  </div>
</section>
```

**Step 1: Rewrite the return JSX structure**

Replace the `<section>` return block (lines 1723-2154) with the new layout. Key changes:

1. **Outer section** — keep existing classes but ensure it fills height
2. **New relative container** — `relative flex-1 min-h-0` wrapping everything
3. **Scroll area** — `messagesContainerRef` gets `absolute inset-0 overflow-y-auto`. Remove the old header from inside it. Add padding: `pt-14` (clears floating header) and `pb-[140px]` (clears floating prompt + bottom fade + inset)
4. **Fade gradient divs** — two sibling divs after the scroll area, using the CSS classes from Task 1
5. **Floating header** — `absolute top-4 right-0 z-20 pointer-events-none` wrapper with `pointer-events-auto` on the button
6. **Floating prompt** — `absolute bottom-14 left-0 right-0 z-20` (the `bottom-14` provides inset above the bottom fade)

```tsx
return (
  <section className={`w-full max-w-[28rem] md:max-w-[950px] mx-auto px-4 pt-12 md:pt-0 pb-0 md:pb-0 h-fit md:flex-1 md:flex md:flex-col md:min-h-0 overflow-x-hidden transition-colors duration-300 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
    {/* Chat container — positions overlays */}
    <div className="relative flex-1 min-h-0 h-[600px] md:h-auto font-mono text-[0.875rem]">

      {/* Scrollable messages area */}
      <div
        ref={messagesContainerRef}
        className={`absolute inset-0 overflow-y-auto overflow-x-hidden scrollbar-boxy ${isDark ? 'scrollbar-dark' : ''}`}
        style={{ paddingTop: '3.5rem', paddingBottom: '10rem' }}
      >
        <div className="space-y-6">
          {/* ... existing message rendering (lines 1742-1954) unchanged ... */}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Top fade gradient */}
      <div className={`chat-fade-top ${isDark ? '' : 'chat-fade-top-light'}`} />

      {/* Bottom fade gradient */}
      <div className={`chat-fade-bottom ${isDark ? '' : 'chat-fade-bottom-light'}`} />

      {/* Floating header — right-aligned */}
      <div className="absolute top-3 right-0 z-20 pointer-events-none">
        <button
          onClick={handleClearChat}
          className={`pointer-events-auto text-[0.7rem] font-mono uppercase tracking-wider transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
        >
          + Fresh Conversation
        </button>
      </div>

      {/* Floating prompt — or blocked state */}
      {isBlocked ? (
        /* ... existing blocked UI (lines 1957-1982) — position absolute bottom-14 ... */
      ) : (
        <div className="absolute bottom-14 left-0 right-0 z-20 px-4">
          {/* ... prompt container — see Task 3 ... */}
        </div>
      )}
    </div>

    {/* Suggestion popup — keep as-is */}
    {hoveredSuggestion && (
      <SuggestionImagePopup ... />
    )}
  </section>
);
```

**Step 2: Verify it renders**

Run: `npm run dev`
Open browser, scroll to chat section. Confirm:
- Messages scroll inside the container
- Fade gradients visible at top and bottom edges
- "+ Fresh Conversation" button floats at top-right
- No layout collapse on mobile or desktop

**Step 3: Commit**

```bash
git add components/ChatInterface.tsx
git commit -m "refactor: restructure chat to relative container with floating overlays"
```

---

### Task 3: Build the floating prompt container

**Files:**
- Modify: `components/ChatInterface.tsx` (prompt section within the new layout from Task 2)

**Step 1: Replace the prompt form with bordered container**

Inside the `absolute bottom-14` div from Task 2, render:

```tsx
<div className={`max-w-[500px] mx-auto w-full rounded-lg border p-3 transition-colors duration-300 ${
  isDark
    ? 'bg-gray-950 border-gray-700'
    : 'bg-gray-50 border-gray-300'
}`}>
  {/* Textarea */}
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
    aria-label="Chat message input"
    className={`w-full bg-transparent focus:outline-none resize-none overflow-y-auto max-h-[120px] text-[0.875rem] ${
      isDark
        ? 'placeholder:text-gray-600 text-gray-100'
        : 'placeholder:text-gray-400 text-black'
    }`}
    placeholder={isVoiceMode ? "Voice mode active..." : "Type your message..."}
  />

  {/* Chin — gap + right-aligned button */}
  <div className="flex justify-end mt-2">
    {/* Multi-state button — see Task 4 */}
  </div>
</div>

{/* Voice error/warning displays — keep above or below container */}
{voiceError && ( /* ... existing error display ... */ )}
{audioPlaybackDisabled && isVoiceMode && ( /* ... existing notice ... */ )}
```

Key differences from current:
- Textarea loses `border-b` (container has the border now)
- Textarea loses `pr-12` (send button is no longer absolute-positioned inside)
- Container has `rounded-lg`, `border`, `p-3`, subtle background
- `mt-2` gap between textarea and chin

**Step 2: Verify prompt renders**

Run: `npm run dev`
Confirm: bordered container floats at bottom, textarea grows, styling matches dark/light modes

**Step 3: Commit**

```bash
git add components/ChatInterface.tsx
git commit -m "feat: add bordered floating prompt container"
```

---

### Task 4: Build the multi-state action button

**Files:**
- Modify: `components/ChatInterface.tsx` (the chin area from Task 3)

**Step 1: Replace the chin placeholder with the multi-state button**

The button has 3 states:
- `input.trim() === ''` and `!isLoading` → **Voice** (starts/stops voice)
- `input.trim() !== ''` and `!isLoading` → **Send** (submits form)
- `isLoading` → **Stop** (cancels generation)

```tsx
<div className="flex justify-end mt-2">
  <button
    type="button"
    onClick={() => {
      if (isLoading) {
        // Stop state — cancel generation
        handleStop();
      } else if (input.trim()) {
        // Send state — submit message
        handleSubmit();
      } else {
        // Voice state — toggle voice
        handleVoiceToggle();
      }
    }}
    disabled={isVoiceLoading}
    className={`text-[0.75rem] font-mono uppercase tracking-wider transition-colors ${
      isLoading
        ? isDark ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'
        : input.trim()
          ? isDark ? 'text-gray-100 hover:text-gray-300' : 'text-black hover:text-gray-600'
          : isVoiceMode
            ? isDark ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'
            : isDark ? 'text-gray-100 hover:text-gray-300' : 'text-black hover:text-gray-600'
    } ${isVoiceLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
    aria-label={isLoading ? 'Stop generating' : input.trim() ? 'Send message' : isVoiceMode ? 'End voice' : 'Start voice'}
  >
    {isLoading ? 'STOP' : input.trim() ? 'SEND' : isVoiceLoading ? 'STARTING...' : isVoiceMode ? 'END' : 'VOICE'}
  </button>
</div>
```

**Step 2: Extract voice toggle logic into `handleVoiceToggle`**

The existing voice button `onClick` handler (lines 2043-2119) should be extracted into a `handleVoiceToggle` callback. Add it near the other handlers (around line 1690):

```tsx
const handleVoiceToggle = useCallback(async () => {
  await unlockAudio();

  if (isVoiceMode) {
    // ... existing stop logic (lines 2048-2074)
  } else {
    // ... existing start logic (lines 2076-2118)
  }
}, [isVoiceMode, /* existing deps */]);
```

**Step 3: Add `handleStop` for generation cancellation**

Check if there's already an abort mechanism. If `handleSubmit` uses an AbortController, expose a `handleStop` that calls `controller.abort()`. If not, add one. Inspect the current submit logic to determine the right approach.

**Step 4: Remove the old separate voice button and send button**

Delete:
- The old `<button type="submit">Send</button>` (line 2002-2009)
- The old voice button container + button (lines 2012-2141)
- The voice error/warning displays stay but move outside the prompt container

**Step 5: Verify all 3 states work**

Run: `npm run dev`
Test:
1. Empty textarea → button says "VOICE", click starts voice session
2. Type text → button says "SEND", click submits
3. Submit → while loading, button says "STOP"
4. In voice mode → button says "END", click stops voice

**Step 6: Commit**

```bash
git add components/ChatInterface.tsx
git commit -m "feat: merge voice/send/stop into multi-state action button"
```

---

### Task 5: Handle blocked/budget state in new layout

**Files:**
- Modify: `components/ChatInterface.tsx` (blocked state rendering)

**Step 1: Position blocked state inside the floating prompt zone**

The blocked state currently replaces the entire prompt section. In the new layout, it should appear in the same `absolute bottom-14` zone as the prompt:

```tsx
{isBlocked ? (
  <div className="absolute bottom-14 left-0 right-0 z-20 px-4">
    <div className={`max-w-[500px] mx-auto w-full rounded-lg border p-4 transition-colors duration-300 ${
      isDark ? 'bg-gray-950 border-gray-700' : 'bg-gray-50 border-gray-300'
    }`}>
      <p className={`text-[0.8rem] leading-relaxed mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
        {budgetExhausted ? BUDGET_EXHAUSTED_MESSAGE : BLOCKED_MESSAGE}
      </p>
      {/* ... existing budget email link and dev reset button ... */}
    </div>
  </div>
) : (
  /* ... floating prompt from Task 3 ... */
)}
```

**Step 2: Verify blocked state**

In dev mode, trigger timeout via the dev reset button workflow. Confirm blocked message appears in the floating container.

**Step 3: Commit**

```bash
git add components/ChatInterface.tsx
git commit -m "refactor: position blocked state in floating prompt zone"
```

---

### Task 6: Fine-tune scroll padding and auto-scroll

**Files:**
- Modify: `components/ChatInterface.tsx` (scroll padding + scrollToBottom)

**Step 1: Adjust scroll-padding-bottom dynamically**

The floating prompt container height varies as the textarea grows. Use a ref to measure the prompt container and set `paddingBottom` on the scroll area dynamically:

```tsx
const promptContainerRef = useRef<HTMLDivElement>(null);

// After textarea auto-resize, update scroll area bottom padding
useEffect(() => {
  if (promptContainerRef.current && messagesContainerRef.current) {
    const promptHeight = promptContainerRef.current.offsetHeight;
    // bottom-14 (3.5rem = 56px) inset + prompt height + 16px breathing room
    messagesContainerRef.current.style.paddingBottom = `${promptHeight + 56 + 16}px`;
  }
}, [input, isBlocked]);
```

Attach `promptContainerRef` to the floating prompt wrapper div.

**Step 2: Verify auto-scroll still works**

Run: `npm run dev`
Test:
1. Send a message → chat scrolls to show the new response
2. Type a long message (textarea grows) → scroll padding adjusts, last message stays visible
3. On mobile (600px height) → same behavior

**Step 3: Commit**

```bash
git add components/ChatInterface.tsx
git commit -m "fix: dynamic scroll padding for variable prompt height"
```

---

### Task 7: Final cleanup and lint

**Files:**
- Modify: `components/ChatInterface.tsx` (remove dead code)

**Step 1: Remove dead code**

- Remove the old header JSX (the "FRAM ASSISTANT" title + clear button with sticky/blur classes)
- Remove old send button JSX
- Remove old voice button container JSX
- Clean up any unused variables or imports

**Step 2: Update the component docblock**

Update the HEIGHT SYSTEM EXPLANATION comment at the top of the file (lines 18-99) to reflect the new layout.

**Step 3: Run full validation**

Run: `npm run lint && npm test && npm run build`
Expected: All pass

**Step 4: Commit**

```bash
git add components/ChatInterface.tsx app/globals.css
git commit -m "refactor: clean up dead code from chat restructure"
```

---

## Notes for implementer

- **The `mb-2` on the old messages container** (line 1727) can be removed — spacing is now handled by padding
- **The old `h-[600px]` on mobile** moves from the messages wrapper to the new relative container
- **`md:flex-1 md:min-h-0`** pattern stays on the relative container for desktop height filling
- **Voice error displays** should render between the prompt container and the bottom fade, or as a toast. Decide during implementation — keep them visible but not blocking the prompt.
- **The `scrollbar-boxy` classes** stay on the scroll area div
- **`handleSubmit` as form onSubmit** — since we no longer have a `<form>`, call `handleSubmit()` directly from the button and from the Enter keydown handler
