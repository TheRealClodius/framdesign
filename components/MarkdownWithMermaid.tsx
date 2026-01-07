"use client";

import { useMemo, Suspense, lazy } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

// Lazy load MermaidRenderer to avoid SSR issues
const MermaidRenderer = lazy(() => import("./MermaidRenderer"));

// Configuration
const MAX_MERMAID_BLOCKS_PER_MESSAGE = 10;

interface MarkdownWithMermaidProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
}

// Loading placeholder for mermaid diagrams
function MermaidLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-8 px-4 bg-gray-50 rounded border border-gray-200 my-4">
      <div className="flex items-center space-x-2 text-gray-500 text-sm">
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
        <span>Loading diagram...</span>
      </div>
    </div>
  );
}

// Track mermaid block count for limiting
let mermaidBlockCount = 0;

export default function MarkdownWithMermaid({ content, className = "", isStreaming = false }: MarkdownWithMermaidProps) {
  // Reset block count for this message
  mermaidBlockCount = 0;

  // Custom components for ReactMarkdown
  // Custom components for ReactMarkdown
  const components: Components = useMemo(
    () => ({
      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      em: ({ children }) => <em className="italic">{children}</em>,
      
      // Handle code blocks - detect mermaid
      code: ({ className: codeClassName, children, ...props }) => {
        const match = /language-(\w+)/.exec(codeClassName || "");
        const language = match ? match[1] : "";
        const codeContent = String(children).replace(/\n$/, "");

        // Check if this is a mermaid code block
        if (language === "mermaid") {
          mermaidBlockCount++;

          // Enforce limit on mermaid blocks per message
          if (mermaidBlockCount > MAX_MERMAID_BLOCKS_PER_MESSAGE) {
            return (
              <div className="py-4 px-4 bg-yellow-50 rounded border border-yellow-200 my-4">
                <p className="text-sm text-yellow-700">
                  Too many diagrams in this message (max {MAX_MERMAID_BLOCKS_PER_MESSAGE}).
                </p>
                <details className="mt-2">
                  <summary className="text-xs text-yellow-600 cursor-pointer hover:text-yellow-800">
                    View source
                  </summary>
                  <pre className="mt-2 p-2 bg-white rounded text-xs overflow-x-auto">
                    <code>{codeContent}</code>
                  </pre>
                </details>
              </div>
            );
          }

          // During streaming, show code block instead of rendering diagram
          // This prevents parse errors from incomplete diagram code
          if (isStreaming) {
            return (
              <pre className="bg-gray-100 rounded p-3 overflow-x-auto my-3">
                <code className="text-[0.875rem] font-mono">
                  {codeContent}
                </code>
              </pre>
            );
          }

          // Render mermaid diagram
          return (
            <Suspense fallback={<MermaidLoadingFallback />}>
              <MermaidRenderer source={codeContent} className="my-4" />
            </Suspense>
          );
        }

        // Check if this is a block code (has language) or inline code
        // Block code has a className with language-*, inline code doesn't
        const isInlineCode = !codeClassName;

        if (isInlineCode) {
          // Inline code
          return (
            <code className="bg-gray-100 px-1 py-0.5 rounded text-[0.875rem] font-mono" {...props}>
              {children}
            </code>
          );
        }

        // Block code (non-mermaid)
        return (
          <pre className="bg-gray-100 rounded p-3 overflow-x-auto my-3">
            <code className="text-[0.875rem] font-mono" {...props}>
              {children}
            </code>
          </pre>
        );
      },

      // Wrap pre to avoid double styling
      pre: ({ children }) => <>{children}</>,

      ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
      li: ({ children }) => <li>{children}</li>,
      
      blockquote: ({ children }) => (
        <blockquote className="border-l-2 border-gray-300 pl-3 italic my-2">
          {children}
        </blockquote>
      ),
      
      h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
      h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
      h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h3>,
      
      table: ({ children }) => (
        <div className="overflow-x-auto my-4 border border-gray-300 rounded">
          <table className="min-w-full divide-y divide-gray-300 text-[0.875rem]">
            {children}
          </table>
        </div>
      ),
      thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
      tbody: ({ children }) => <tbody className="divide-y divide-gray-200 bg-white">{children}</tbody>,
      tr: ({ children }) => <tr>{children}</tr>,
      th: ({ children }) => (
        <th
          scope="col"
          className="px-3 py-2 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider border-r last:border-r-0 border-gray-200"
        >
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="px-3 py-2 whitespace-normal text-black align-top border-r last:border-r-0 border-gray-200">
          {children}
        </td>
      ),

      // Handle links
      a: ({ href, children }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 underline"
        >
          {children}
        </a>
      ),

      // Horizontal rule
      hr: () => <hr className="my-4 border-gray-200" />,
    }),
    [isStreaming]
  );

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
