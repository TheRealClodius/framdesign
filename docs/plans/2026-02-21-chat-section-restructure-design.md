# Chat Section Restructure Design

## Summary

Restructure the Chat section into a scroll container with two floating overlay zones (header at top, prompt at bottom) and CSS fade gradients at the top and bottom edges. Same layout on mobile and desktop.

## Layout

```
┌─────────────────────────────────────┐
│                [+ Fresh Conversation]│  ← floating, no bg, right-aligned
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│  ← top fade gradient
│                                     │
│  User: How does the grid work?      │
│                                     │
│  Assistant: The grid system uses... │  ← scrollable messages
│                                     │
│  User: Show me an example           │
│                                     │
│  Assistant: Here's an example...    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ [textarea, grows vertically]│    │  ← floating prompt
│  │                             │    │
│  │ ─ ─ ─ ─ ─ ─ ─ ─ ─ [🎤/➤/⏹]│    │
│  └─────────────────────────────┘    │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│  ← bottom fade gradient (under prompt)
│        (small bottom inset)         │
└─────────────────────────────────────┘
```

## Components

### 1. Scroll container (full chat area)

- `position: relative` to anchor floating overlays
- `overflow-y: auto` for message scrolling
- Fade gradients via `::before` (top) and `::after` (bottom) pseudo-elements
  - `pointer-events: none` so they don't block interaction
  - Top: `linear-gradient(to bottom, bg-color, transparent)` ~40-60px
  - Bottom: `linear-gradient(to top, bg-color, transparent)` ~40-60px, at the very bottom edge
  - z-index above messages but below overlays
- `scroll-padding-bottom` to account for prompt overlay height so auto-scroll doesn't hide last message

### 2. Floating header overlay

- `position: absolute; top: 0; right: 0`
- z-index above fade gradients
- No background, no blur, no title text
- Contains only: "+ Fresh Conversation" button, right-aligned
- Wrapper: `pointer-events: none`; button: `pointer-events: auto`

### 3. Floating prompt overlay

- `position: absolute; bottom: <inset>` — sits above the bottom fade gradient zone
- z-index above fade gradients
- Bordered container: subtle border, offset background (`bg-gray-950` dark / `bg-gray-50` light), rounded corners
- Inner layout:
  - **Textarea**: grows vertically as user types, max height before own scrollbar
  - **Small vertical gap**
  - **Chin row**: right-aligned multi-state button

### 4. Multi-state action button (in chin)

- **Voice state** (textarea empty): microphone icon, triggers voice session
- **Send state** (textarea has text): send/arrow icon, submits message
- **Stop state** (generating): stop icon, cancels generation
- Smooth transition between states

## Responsive behavior

- Same layout on mobile and desktop
- Mobile: `max-w-[28rem]`
- Desktop: `max-w-[950px]`
- Prompt container is part of the chat section, not viewport-pinned

## What changes

- Header: remove "FRAM ASSISTANT" title, remove background/blur, replace "Clear" with "+ Fresh Conversation" (right-aligned, floating)
- Prompt: move from normal flow to floating overlay with bordered container
- Voice button: removed as separate element, merged into multi-state action button in prompt chin
- Scroll area: add fade gradients at top and bottom edges (fade to background color), add scroll padding

## What stays the same

- Message rendering (MarkdownWithMermaid, images, citations, suggestions)
- Auto-scroll to bottom on new messages
- Theme support (dark/light)
- Voice session logic (trigger moves to unified button)
- localStorage message persistence
