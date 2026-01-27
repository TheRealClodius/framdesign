"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import type { Components } from "react-markdown";

// Lazy load MermaidRenderer to avoid SSR issues
const MermaidRenderer = dynamic(() => import("./MermaidRenderer"), {
  ssr: false,
  loading: () => (
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
  ),
});

const ImageModal = dynamic(() => import("./ImageModal"), {
  ssr: false,
  loading: () => null, // Don't show loading state for modal
});

// Extract blob_id and extension from GCS signed URL (shared utility)
function extractBlobIdFromGcsUrl(url: string): { blob_id: string; extension: string } | null {
  try {
    if (!url.includes('storage.googleapis.com') || !url.includes('/assets/')) return null;
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const assetsIndex = pathname.indexOf('/assets/');
    if (assetsIndex === -1) return null;
    const assetPath = pathname.substring(assetsIndex + '/assets/'.length);
    const lastDotIndex = assetPath.lastIndexOf('.');
    if (lastDotIndex === -1) return null;
    const blobId = assetPath.substring(0, lastDotIndex);
    const extension = assetPath.substring(lastDotIndex + 1);
    return (blobId && extension) ? { blob_id: blobId, extension } : null;
  } catch {
    return null;
  }
}

// Extract blob_id and extension from local /kb-assets paths
function extractBlobIdFromLocalAssetPath(path: string): { blob_id: string; extension: string } | null {
  try {
    let pathname = path;
    if (path.startsWith("http://") || path.startsWith("https://")) {
      pathname = new URL(path).pathname;
    }
    const assetsIndex = pathname.indexOf('/kb-assets/');
    if (assetsIndex === -1) return null;
    const assetPath = pathname.substring(assetsIndex + '/kb-assets/'.length);
    const lastDotIndex = assetPath.lastIndexOf('.');
    if (lastDotIndex === -1) return null;
    const blobId = assetPath.substring(0, lastDotIndex);
    const extension = assetPath.substring(lastDotIndex + 1);
    return (blobId && extension) ? { blob_id: blobId, extension } : null;
  } catch {
    return null;
  }
}

// Refresh expired GCS signed URL (shared utility)
async function refreshGcsUrl(blobId: string, extension: string): Promise<string | null> {
  try {
    const response = await fetch('/api/refresh-asset-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blob_id: blobId, extension }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.url || null;
  } catch {
    return null;
  }
}

// Video component with error handling and URL refresh
function VideoWithError({ src, children, controls, ...props }: { src?: string; children?: React.ReactNode; controls?: boolean; [key: string]: any }) {
  const [videoError, setVideoError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string | undefined>(src);
  const hasControls = controls !== undefined ? controls : true;

  // Log initial src
  useEffect(() => {
    console.log('[VideoWithError] Component mounted/updated with src:', src);
  }, [src]);

  // Update currentSrc when src prop changes
  useEffect(() => {
    setCurrentSrc(src);
    setVideoError(false);
  }, [src]);
  
  const handleVideoError = useCallback(async (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const currentSrcValue = video.src;
    const hasTriedRefresh = video.getAttribute("data-refresh-attempted") === "true";

    console.log('[VideoWithError] Video error triggered');
    console.log('  currentSrc state:', currentSrc);
    console.log('  video.src:', currentSrcValue);
    console.log('  original src prop:', src);

    // Try to extract GCS URL from either the video element or the original src prop
    const urlToCheck = currentSrcValue || src || '';
    
    // Try refreshing the signed URL from blob storage before failing
    if (!hasTriedRefresh && urlToCheck) {
      const blobInfo = extractBlobIdFromGcsUrl(urlToCheck) || extractBlobIdFromLocalAssetPath(urlToCheck);
      if (blobInfo) {
        video.setAttribute("data-refresh-attempted", "true");
        const freshUrl = await refreshGcsUrl(blobInfo.blob_id, blobInfo.extension);
        if (freshUrl) {
          console.log('[VideoWithError] Refreshed signed URL:', freshUrl);
          setCurrentSrc(freshUrl);
          setVideoError(false);
          return;
        }
      }
    }

    // All fallbacks exhausted, show error
    console.log('[VideoWithError] All fallbacks exhausted, showing error');
    setVideoError(true);
  }, [src, currentSrc]);
  
  return (
    <span className="block my-4 rounded-lg border border-gray-200 overflow-hidden bg-black">
      {videoError ? (
        <span className="block flex flex-col items-center justify-center p-12 text-center min-h-[200px]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gray-400 mb-3"
          >
            <polygon points="23 7 16 12 23 17 23 7"></polygon>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
          </svg>
          <span className="block text-sm text-gray-400 font-medium">Video unavailable</span>
          <span className="block text-xs text-gray-500 mt-2">The video could not be loaded. It may have expired or been removed.</span>
        </span>
      ) : (
        <video
          src={currentSrc}
          controls={hasControls}
          className="w-full max-w-[600px] max-h-96 object-contain"
          onError={handleVideoError}
          {...props}
        >
          {children}
        </video>
      )}
    </span>
  );
}

// Image component with loading state and error handling
function ChatImage({ 
  src, 
  alt, 
  setModalImage, 
  failedImages, 
  setFailedImages,
  ...props 
}: { 
  src?: any; 
  alt?: string; 
  setModalImage: (image: { src: string; alt: string } | null) => void;
  failedImages: Set<string>;
  setFailedImages: React.Dispatch<React.SetStateAction<Set<string>>>;
  [key: string]: any;
}) {
  const [isLoading, setIsLoading] = useState(true);

  // Normalize image path
  const normalizeImagePath = (path: string | undefined): string => {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    const hasEncodedChars = path.includes("%");
    try {
      let pathToEncode = path;
      if (hasEncodedChars) {
        try {
          let decoded = path;
          let previousDecoded = path;
          for (let i = 0; i < 3; i++) {
            try {
              decoded = decodeURIComponent(previousDecoded);
              if (decoded === previousDecoded) break;
              previousDecoded = decoded;
            } catch { break; }
          }
          if (decoded !== path && !decoded.includes("%")) pathToEncode = decoded;
        } catch { pathToEncode = path; }
      }
      const parts = pathToEncode.split("/");
      const encodedParts = parts.map((part, index) => {
        if (index === 0 && part === "") return "";
        if (pathToEncode.includes("/kb-assets/") && index === parts.length - 1 && part.includes("_")) {
          part = part.replace(/_/g, " ");
        }
        if (part.includes("%")) {
          try {
            const decoded = decodeURIComponent(part);
            if (decoded !== part) {
              const fixed = decoded.replace(/_/g, " ");
              return encodeURIComponent(fixed);
            }
          } catch { return part; }
        }
        return encodeURIComponent(part);
      });
      let normalized = encodedParts.join("/");
      if (pathToEncode.startsWith("/") && !normalized.startsWith("/")) normalized = "/" + normalized;
      return normalized;
    } catch { return path; }
  };

  let normalizedSrc: string;
  if (src instanceof Blob) {
    normalizedSrc = URL.createObjectURL(src);
  } else if (typeof src === 'string' || src === undefined) {
    normalizedSrc = normalizeImagePath(src);
  } else {
    normalizedSrc = "";
  }

  const imageHasFailed = failedImages.has(normalizedSrc);

  if (imageHasFailed) {
    return (
      <span className="relative block my-3 max-w-[600px] max-h-96 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center" style={{ minHeight: '200px' }}>
        <span className="flex flex-col items-center justify-center p-8 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 mb-3">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <span className="block text-sm text-gray-500 font-medium">Image unavailable</span>
          {alt && <span className="block text-xs text-gray-400 mt-1">{alt}</span>}
        </span>
      </span>
    );
  }

  // Check if the image is a GIF
  const isGif = normalizedSrc.toLowerCase().endsWith('.gif') || 
                 normalizedSrc.toLowerCase().includes('.gif?') ||
                 normalizedSrc.toLowerCase().includes('.gif#');
  const loadingText = isGif ? "Grabbing motion file..." : "Grabbing image...";

  return (
    <span className="relative block my-3 group min-h-[40px]">
      {isLoading && (
        <span className="absolute inset-0 flex items-center justify-center bg-gray-50/50 rounded-lg border border-gray-200/50 z-10 py-8">
          <span className="flex items-center space-x-2 text-gray-400 text-sm">
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{loadingText}</span>
          </span>
        </span>
      )}
      <img
        src={normalizedSrc}
        alt={alt}
        className={`max-w-[600px] max-h-96 rounded-lg border border-gray-200 object-contain cursor-pointer hover:opacity-90 transition-opacity ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        loading="lazy"
        onLoad={() => setIsLoading(false)}
        onClick={() => normalizedSrc && setModalImage({ src: normalizedSrc, alt: alt || "" })}
        onError={async (e) => {
          const img = e.target as HTMLImageElement;
          const currentSrc = img.src;
          const hasTriedRefresh = img.getAttribute("data-refresh-attempted") === "true";

          if (!hasTriedRefresh) {
            const blobInfo = extractBlobIdFromGcsUrl(currentSrc) || extractBlobIdFromLocalAssetPath(currentSrc);
            if (blobInfo) {
              img.setAttribute("data-refresh-attempted", "true");
              const freshUrl = await refreshGcsUrl(blobInfo.blob_id, blobInfo.extension);
              if (freshUrl) {
                img.src = freshUrl;
                return;
              }
            }
          }

          setFailedImages((prev) => new Set(prev).add(normalizedSrc));
          setIsLoading(false);
        }}
        {...props}
      />
      {!isLoading && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            normalizedSrc && setModalImage({ src: normalizedSrc, alt: alt || "" });
          }}
          className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Expand image"
          title="Expand to fullscreen"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
        </button>
      )}
    </span>
  );
}

// Configuration
const MAX_MERMAID_BLOCKS_PER_MESSAGE = 10;

interface MarkdownWithMermaidProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
  onFixDiagram?: (error: { source: string; message: string; fullContent: string }) => void;
}

// Track mermaid block count for limiting
let mermaidBlockCount = 0;

export default function MarkdownWithMermaid({ content, className = "", isStreaming = false, onFixDiagram }: MarkdownWithMermaidProps) {
  // Reset block count for this message
  mermaidBlockCount = 0;
  
  // State for image modal
  const [modalImage, setModalImage] = useState<{ src: string; alt: string } | null>(null);
  
  // Track failed images to show placeholder instead of broken icon
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  // Custom components for ReactMarkdown
  // Custom components for ReactMarkdown
  const components: Components = useMemo(
    () => ({
      // Strip non-standard <suggestions> tags from raw markdown HTML
      suggestions: () => null,
      p: ({ children, node }) => {
        // Check if paragraph only contains an image (or images) or video
        // This prevents hydration errors from <div> inside <p>
        if (node && 'children' in node) {
          const nodeChildren = (node as any).children || [];
          const hasOnlyImages = nodeChildren.length > 0 && 
            nodeChildren.every((childNode: any) => 
              childNode.type === 'element' && childNode.tagName === 'img'
            );
          const hasOnlyVideo = nodeChildren.length > 0 && 
            nodeChildren.every((childNode: any) => 
              childNode.type === 'element' && childNode.tagName === 'video'
            );
          
          // If paragraph only contains images or videos, render without <p> wrapper
          if (hasOnlyImages || hasOnlyVideo) {
            return <>{children}</>;
          }
        }

        return <p className="mb-2 last:mb-0">{children}</p>;
      },
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
            <MermaidRenderer 
              source={codeContent} 
              className="my-4"
              onFixDiagram={onFixDiagram ? (error) => {
                onFixDiagram({
                  source: codeContent,
                  message: error,
                  fullContent: content
                });
              } : undefined}
            />
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

      // Handle images - constrain size for chat with expand option
      // Using span instead of div to avoid hydration errors when image is inside <p>
      img: ({ src, alt, ...props }) => {
        return (
          <ChatImage 
            src={src} 
            alt={alt} 
            setModalImage={setModalImage} 
            failedImages={failedImages}
            setFailedImages={setFailedImages}
            {...props} 
          />
        );
      },

      // Horizontal rule
      hr: () => <hr className="my-4 border-gray-200" />,

      // Handle video tags with consistent styling
      video: ({ src, children, controls, ...props }) => {
        // Extract src from source child elements if not directly on video element
        let normalizedSrc: string | undefined;
        
        if (!src && children) {
          // Try to find src in children (source elements)
          const childArray = Array.isArray(children) ? children : [children];
          for (const child of childArray) {
            if (child && typeof child === 'object' && 'props' in child && child.props?.src) {
              normalizedSrc = child.props.src;
              break;
            }
          }
        } else if (src instanceof Blob) {
          normalizedSrc = URL.createObjectURL(src);
        } else if (src instanceof MediaStream || src instanceof MediaSource) {
          // MediaStream and MediaSource need to be handled differently
          // For now, convert to empty string to avoid type error
          normalizedSrc = undefined;
        } else if (typeof src === 'string') {
          normalizedSrc = src;
        }
        
        return <VideoWithError src={normalizedSrc} controls={controls} {...props}>{children}</VideoWithError>;
      },

      // Handle source tags within video elements
      source: ({ src, type, ...props }) => {
        return <source src={src} type={type} {...props} />;
      },
    }),
    [isStreaming, failedImages]
  );

  return (
    <>
      <div className={`markdown-content overflow-x-hidden break-words ${className}`}>
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]} 
          rehypePlugins={[rehypeRaw]}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
      
      {modalImage && (
        <ImageModal
          src={modalImage.src}
          alt={modalImage.alt}
          onClose={() => setModalImage(null)}
        />
      )}
    </>
  );
}
