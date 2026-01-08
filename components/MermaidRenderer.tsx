"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import DiagramModal from "./DiagramModal";

// Configuration constants
const MAX_MERMAID_LENGTH = 10000; // Maximum characters per Mermaid block
const RENDER_TIMEOUT_MS = 5000; // Maximum time to wait for rendering

// Cache version - increment this when sanitization logic changes to invalidate old caches
const CACHE_VERSION = 4;

// In-memory cache for rendered diagrams (persists across component instances)
const diagramCache = new Map<string, string>();

// Generate a stable hash for cache key (includes version for cache invalidation)
function hashCode(str: string): string {
  let hash = 0;
  const versionedStr = `v${CACHE_VERSION}:${str}`;
  for (let i = 0; i < versionedStr.length; i++) {
    const char = versionedStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `mermaid-${hash.toString(16)}`;
}

// Encode SVG to data URL safely
function svgToDataUrl(svg: string): string {
  // Encode the SVG properly for use in a data URL
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml,${encoded}`;
}

// Sanitize Mermaid source code to fix common syntax issues
function sanitizeMermaidSource(source: string): string {
  let sanitized = source.trim();
  
  // Remove any markdown code block markers that might have leaked in
  sanitized = sanitized.replace(/^```\s*mermaid\s*\n?/i, '');
  sanitized = sanitized.replace(/\n?```\s*$/g, '');
  
  // Detect and fix duplicated/corrupted content
  // Look for patterns like "graph TD A[...] graph TD A[...]" (duplicated start)
  // IMPORTANT: Use word boundary \b to avoid matching "graph" inside "subgraph"
  const graphStartPattern = /\b(graph|flowchart)\s+(TD|TB|BT|RL|LR)\b/gi;
  const matches = [...sanitized.matchAll(graphStartPattern)];
  
  // If we find multiple graph/flowchart declarations, keep only the first one
  if (matches.length > 1) {
    // Find the position of the second declaration
    const secondMatch = matches[1];
    // Keep everything before the second declaration
    sanitized = sanitized.substring(0, secondMatch.index).trim();
  }
  
  // Split into lines for minimal processing
  // IMPORTANT: Do NOT aggressively filter lines - complex diagrams have many similar-looking lines
  const lines = sanitized.split('\n');
  const processedLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Skip completely empty lines (but keep single empty lines for readability)
    if (!trimmedLine) {
      if (processedLines.length > 0 && processedLines[processedLines.length - 1] !== '') {
        processedLines.push('');
      }
      continue;
    }
    
    // Remove standalone separator lines (just dashes, equals, or arrows - NOT valid Mermaid)
    if (/^[-=]{5,}$/.test(trimmedLine)) {
      continue;
    }
    
    // Keep ALL other lines - don't try to "fix" or filter them
    // Let Mermaid's parser handle the validation
    processedLines.push(trimmedLine);
  }
  
  // Join lines back together
  sanitized = processedLines.join('\n');
  
  // Clean up multiple consecutive empty lines (max 2)
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  
  // MINIMAL "sub" node fixes - only target very specific problematic patterns
  // IMPORTANT: Do NOT aggressively replace "sub" as it breaks "subgraph" syntax
  
  // Only fix standalone "sub" nodes that would render as empty boxes
  // Pattern: A line that is exactly "sub" by itself (a node with no label)
  sanitized = sanitized.replace(/^sub$/gm, 'Subsystem');
  
  // Pattern: sub[] or sub[""] - empty node labels
  sanitized = sanitized.replace(/\bsub\s*\[\s*\]/gi, 'Subsystem[Subsystem]');
  sanitized = sanitized.replace(/\bsub\s*\[\s*["']\s*["']\s*\]/gi, 'Subsystem[Subsystem]');
  
  // Debug log to help diagnose rendering issues
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('[MermaidRenderer] Sanitized source preview:', sanitized.substring(0, 500));
  }
  
  return sanitized.trim();
}

// Mermaid initialization state (singleton)
let mermaidInstance: typeof import("mermaid").default | null = null;
let mermaidInitPromise: Promise<typeof import("mermaid").default> | null = null;

async function getMermaid(): Promise<typeof import("mermaid").default> {
  if (mermaidInstance) {
    return mermaidInstance;
  }

  if (mermaidInitPromise) {
    return mermaidInitPromise;
  }

  mermaidInitPromise = (async () => {
    const mermaid = (await import("mermaid")).default;
    
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: {
        // SVG background - explicitly set to dark/transparent
        background: "transparent",
        
        // Background and text
        primaryColor: "#262626",
        primaryTextColor: "#ffffff",
        primaryBorderColor: "#525252",
        
        // Secondary elements
        secondaryColor: "#404040",
        secondaryTextColor: "#e5e5e5",
        secondaryBorderColor: "#525252",
        
        // Tertiary elements
        tertiaryColor: "#404040",
        tertiaryTextColor: "#ffffff",
        tertiaryBorderColor: "#525252",
        
        // Lines and edges
        lineColor: "#a3a3a3",
        
        // Text
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: "14px",
        
        // Notes and labels
        noteBkgColor: "#171717",
        noteTextColor: "#ffffff",
        noteBorderColor: "#525252",
        
        // Flowchart specific
        nodeBorder: "#525252",
        clusterBkg: "#0a0a0a",
        clusterBorder: "#404040",
        
        // Sequence diagram
        actorBkg: "#262626",
        actorBorder: "#525252",
        actorTextColor: "#ffffff",
        signalColor: "#a3a3a3",
        
        // Timeline diagram
        timelineCritColor: "#a3a3a3",
        timelineLabelColor: "#ffffff",
        
        // Journey diagram - satisfaction score colors (1-5 scale, mapped to cScale0-4)
        cScale0: "#404040", // Score 1 (lowest satisfaction)
        cScale1: "#737373", // Score 2
        cScale2: "#a3a3a3", // Score 3 (neutral)
        cScale3: "#d4d4d4", // Score 4
        cScale4: "#ffffff", // Score 5 (highest satisfaction)
      },
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: "basis",
      },
      sequence: {
        useMaxWidth: true,
      },
      gantt: {
        useMaxWidth: true,
      },
      sankey: {
        useMaxWidth: true,
        width: 800,
        height: 400,
        linkColor: "gradient",
        nodeAlignment: "justify",
      },
    });

    mermaidInstance = mermaid;
    return mermaid;
  })();

  return mermaidInitPromise;
}


interface MermaidRendererProps {
  source: string;
  className?: string;
  onFixDiagram?: (errorMessage: string) => void;
}

type RenderState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; dataUrl: string }
  | { status: "error"; message: string };

// Hook to detect mobile devices
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  
  return isMobile;
}

export default function MermaidRenderer({ source, className = "", onFixDiagram }: MermaidRendererProps) {
  const [state, setState] = useState<RenderState>({ status: "idle" });
  const [showSource, setShowSource] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const isMobile = useIsMobile();
  
  const mountedRef = useRef(true);
  const renderIdRef = useRef(0);

  const renderDiagram = useCallback(async () => {
    const currentRenderId = ++renderIdRef.current;

    // Sanitize the source to fix common syntax issues
    const sanitizedSource = sanitizeMermaidSource(source);

    // Check size limit
    if (sanitizedSource.length > MAX_MERMAID_LENGTH) {
      setState({
        status: "error",
        message: `Diagram too large (${sanitizedSource.length} chars, max ${MAX_MERMAID_LENGTH})`,
      });
      return;
    }

    // Check cache first (use sanitized source for cache key)
    const cacheKey = hashCode(sanitizedSource);
    const cached = diagramCache.get(cacheKey);
    if (cached) {
      setState({ status: "success", dataUrl: cached });
      return;
    }

    setState({ status: "loading" });

    try {
      const mermaid = await getMermaid();

      // Check if component is still mounted and this is still the current render
      if (!mountedRef.current || currentRenderId !== renderIdRef.current) {
        return;
      }

      // Create a unique ID for this render
      const elementId = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Use Promise.race to implement timeout (use sanitized source)
      const renderPromise = mermaid.render(elementId, sanitizedSource);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Render timeout")), RENDER_TIMEOUT_MS)
      );

      let { svg } = await Promise.race([renderPromise, timeoutPromise]);

      // Check again if still mounted and current
      if (!mountedRef.current || currentRenderId !== renderIdRef.current) {
        return;
      }

      // Ensure SVG has transparent background - fix for mobile white background issue
      // Remove any white background fills from rect elements (common in Mermaid SVGs)
      svg = svg.replace(/<rect([^>]*fill\s*=\s*["']white["'][^>]*)>/gi, '<rect$1 fill="transparent">');
      svg = svg.replace(/<rect([^>]*fill\s*=\s*["']#ffffff["'][^>]*)>/gi, '<rect$1 fill="transparent">');
      svg = svg.replace(/<rect([^>]*fill\s*=\s*["']#fff["'][^>]*)>/gi, '<rect$1 fill="transparent">');
      
      // Remove white backgrounds from style attributes
      svg = svg.replace(/style\s*=\s*["']([^"']*background[^"']*white[^"']*)["']/gi, (match, styles) => {
        return `style="${styles.replace(/background[^;]*white[^;]*;?/gi, '').trim()}"`;
      });
      
      // Add corner radii to rectangle elements (diagram boxes)
      // This adds rounded corners to all rect elements that don't already have rx/ry attributes
      svg = svg.replace(/<rect([^>]*)>/gi, (match, attrs) => {
        // Check if rx or ry already exists
        const hasRx = /rx\s*=\s*["'][^"']*["']/i.test(attrs);
        const hasRy = /ry\s*=\s*["'][^"']*["']/i.test(attrs);
        
        // Only add corner radii if they don't exist
        if (!hasRx && !hasRy) {
          // Add rx and ry attributes with 6px radius (adjustable)
          const cornerRadius = '6';
          // Insert rx and ry before the closing >
          return `<rect${attrs} rx="${cornerRadius}" ry="${cornerRadius}">`;
        }
        
        // If only one exists, add the missing one
        if (hasRx && !hasRy) {
          const rxMatch = attrs.match(/rx\s*=\s*["']([^"']*)["']/i);
          const ryValue = rxMatch ? rxMatch[1] : '6';
          return `<rect${attrs} ry="${ryValue}">`;
        }
        
        if (!hasRx && hasRy) {
          const ryMatch = attrs.match(/ry\s*=\s*["']([^"']*)["']/i);
          const rxValue = ryMatch ? ryMatch[1] : '6';
          return `<rect rx="${rxValue}" ${attrs}>`;
        }
        
        return match;
      });
      
      // Ensure SVG element itself has transparent background
      svg = svg.replace(/<svg([^>]*)>/i, (match, attrs) => {
        // Check if style attribute exists
        const styleMatch = attrs.match(/style\s*=\s*["']([^"']*)["']/i);
        
        if (styleMatch) {
          // Style exists - ensure background is transparent
          let styles = styleMatch[1];
          // Remove any existing background declarations
          styles = styles.replace(/background[^;]*;?/gi, '').trim();
          // Add transparent background
          styles = styles ? `${styles};background:transparent` : 'background:transparent';
          // Replace the style attribute
          attrs = attrs.replace(/style\s*=\s*["'][^"']*["']/i, `style="${styles}"`);
        } else {
          // No style attribute - add one with transparent background
          attrs = `${attrs} style="background:transparent"`;
        }
        
        return `<svg${attrs}>`;
      });

      // Convert SVG to data URL
      const dataUrl = svgToDataUrl(svg);

      // Cache the result
      diagramCache.set(cacheKey, dataUrl);

      setState({ status: "success", dataUrl });
    } catch (error) {
      if (!mountedRef.current || currentRenderId !== renderIdRef.current) {
        return;
      }

      const message = error instanceof Error ? error.message : "Failed to render diagram";
      setState({ status: "error", message });
    }
  }, [source]);

  useEffect(() => {
    mountedRef.current = true;
    
    // Schedule rendering during idle time if available, otherwise use microtask
    if (typeof requestIdleCallback !== "undefined") {
      const idleId = requestIdleCallback(() => renderDiagram());
      return () => {
        mountedRef.current = false;
        cancelIdleCallback(idleId);
      };
    } else {
      // Fallback for browsers without requestIdleCallback
      const timeoutId = setTimeout(() => renderDiagram(), 0);
      return () => {
        mountedRef.current = false;
        clearTimeout(timeoutId);
      };
    }
  }, [renderDiagram]);

  const handleExpand = useCallback(() => {
    console.log("Expand clicked, state:", state.status);
    if (state.status === "success" && state.dataUrl) {
      setShowModal(true);
      console.log("Modal opened");
    } else {
      console.error("Cannot open modal - diagram not ready", state);
    }
  }, [state]);

  const copySource = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(source);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = source;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  }, [source]);

  // Loading state
  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className={`mermaid-loading ${className}`}>
        <div className="flex items-center justify-center py-8 px-4 bg-[#1a1a1a] rounded border border-[#333333]">
          <div className="flex items-center space-x-2 text-gray-400 text-sm">
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Rendering diagram…</span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (state.status === "error") {
    return (
      <div className={`mermaid-error ${className}`}>
        <div className="py-4 px-4 bg-[#1a1a1a] rounded border border-red-900/50">
          <div className="flex items-start space-x-2">
            <svg
              className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-red-400 font-medium">Diagram failed to render</p>
              <p className="text-xs text-red-500 mt-1 break-words">{state.message}</p>
              
              <div className="mt-3 flex items-center space-x-3 flex-wrap gap-2">
                {onFixDiagram && (
                  <button
                    onClick={() => onFixDiagram(state.message)}
                    className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded transition-colors font-medium"
                  >
                    Fix Diagram
                  </button>
                )}
                <button
                  onClick={() => setShowSource(!showSource)}
                  className="text-xs text-red-400 hover:text-red-300 underline"
                >
                  {showSource ? "Hide source" : "View source"}
                </button>
                <button
                  onClick={copySource}
                  className="text-xs text-red-400 hover:text-red-300 underline"
                >
                  Copy source
                </button>
              </div>

              {showSource && (
                <pre className="mt-3 p-3 bg-black rounded border border-red-900/30 text-xs overflow-x-auto max-h-48 overflow-y-auto">
                  <code className="text-gray-300 whitespace-pre-wrap break-words">{source}</code>
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success state - render as static image
  return (
    <>
      <div 
        className={`mermaid-diagram ${className}`} 
        data-mermaid-diagram="true"
        style={isMobile ? {
          backgroundColor: "rgba(26, 26, 26, 0.95)",
          borderRadius: "8px",
          width: "100%"
        } : undefined}
      >
        <div 
          className="overflow-x-auto py-0"
          style={isMobile ? {
            backgroundColor: "transparent",
            width: "100%"
          } : undefined}
        >
          <img
            src={state.dataUrl}
            alt="Mermaid diagram"
            className="max-w-full h-auto cursor-pointer hover:opacity-80 transition-opacity touch-manipulation"
            style={{ 
              minWidth: "200px", 
              touchAction: "manipulation",
              backgroundColor: "transparent",
              display: "block",
              ...(isMobile ? {
                backgroundColor: "transparent",
                width: "100%",
                maxWidth: "100%"
              } : {})
            }}
            onClick={handleExpand}
            onTouchEnd={(e) => {
              e.preventDefault();
              handleExpand();
            }}
            title="Click to expand"
          />
        </div>
        <div 
          className="flex justify-end p-2"
          style={isMobile ? {
            backgroundColor: "transparent"
          } : undefined}
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleExpand();
            }}
            className="text-xs text-gray-400 hover:text-white flex items-center space-x-1 p-1 hover:bg-white/10 rounded transition-colors"
            title="Expand diagram"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Expand diagram">
              <polyline points="15 3 21 3 21 9"></polyline>
              <polyline points="9 21 3 21 3 15"></polyline>
              <line x1="21" y1="3" x2="14" y2="10"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          </button>
          
          <div className="flex-shrink-0" style={{ width: isMobile ? '24px' : '8px' }}></div>

          <button
            type="button"
            onClick={copySource}
            className="text-xs text-gray-400 hover:text-white flex items-center p-1 hover:bg-white/10 rounded transition-colors"
            aria-label={isCopied ? "Copied!" : "Copy source"}
            title={isCopied ? "Copied!" : "Copy source"}
          >
            {isCopied ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Copied">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Copy source">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            )}
          </button>
        </div>
      </div>
      
      {showModal && state.status === "success" && state.dataUrl && (
        <DiagramModal dataUrl={state.dataUrl} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}

// Export cache utilities for testing/debugging
export function clearMermaidCache(): void {
  diagramCache.clear();
}

export function getMermaidCacheSize(): number {
  return diagramCache.size;
}
