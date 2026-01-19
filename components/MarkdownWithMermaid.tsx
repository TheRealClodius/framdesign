"use client";

import { useMemo, useState } from "react";
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

// Video component with error handling
function VideoWithError({ src, children, controls, ...props }: { src?: string; children?: React.ReactNode; controls?: boolean; [key: string]: any }) {
  const [videoError, setVideoError] = useState(false);
  const hasControls = controls !== undefined ? controls : true;
  
  return (
    <div className="my-4 rounded-lg border border-gray-200 overflow-hidden bg-black">
      {videoError ? (
        <div className="flex flex-col items-center justify-center p-12 text-center min-h-[200px]">
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
          <p className="text-sm text-gray-400 font-medium">Video unavailable</p>
          <p className="text-xs text-gray-500 mt-2">The video could not be loaded. It may have expired or been removed.</p>
        </div>
      ) : (
        <video
          src={src}
          controls={hasControls}
          className="w-full max-w-[600px] max-h-96 object-contain"
          onError={() => setVideoError(true)}
          {...props}
        >
          {children}
        </video>
      )}
    </div>
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
        // Extract blob_id and extension from GCS signed URL
        // Format: https://storage.googleapis.com/{bucket}/assets/{blob_id}.{extension}?...
        const extractBlobIdFromGcsUrl = (url: string): { blob_id: string; extension: string } | null => {
          try {
            // Check if it's a GCS URL
            if (!url.includes('storage.googleapis.com') || !url.includes('/assets/')) {
              return null;
            }

            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            
            // Extract path after /assets/
            const assetsIndex = pathname.indexOf('/assets/');
            if (assetsIndex === -1) return null;
            
            const assetPath = pathname.substring(assetsIndex + '/assets/'.length);
            
            // Split by . to get blob_id and extension
            const lastDotIndex = assetPath.lastIndexOf('.');
            if (lastDotIndex === -1) return null;
            
            const blobId = assetPath.substring(0, lastDotIndex);
            const extension = assetPath.substring(lastDotIndex + 1);
            
            if (!blobId || !extension) return null;
            
            return { blob_id: blobId, extension };
          } catch {
            return null;
          }
        };

        // Refresh expired GCS signed URL
        const refreshGcsUrl = async (blobId: string, extension: string): Promise<string | null> => {
          try {
            const response = await fetch('/api/refresh-asset-url', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ blob_id: blobId, extension }),
            });

            if (!response.ok) {
              console.warn(`[refreshGcsUrl] Failed to refresh URL: ${response.statusText}`);
              return null;
            }

            const data = await response.json();
            return data.url || null;
          } catch (error) {
            console.warn('[refreshGcsUrl] Error refreshing URL:', error);
            return null;
          }
        };

        // Normalize image path: ensure proper URL encoding for paths with spaces
        const normalizeImagePath = (path: string | undefined): string => {
          if (!path) return "";
          
          // If it's already a full URL (http/https), return as-is
          if (path.startsWith("http://") || path.startsWith("https://")) {
            return path;
          }
          
          // Check if path is already encoded (contains %)
          // If it contains %20 or %2520 (double-encoded), decode first
          const hasEncodedChars = path.includes("%");
          
          // For local paths, ensure proper URL encoding
          // Split by /, encode each segment separately, then rejoin
          try {
            let pathToEncode = path;
            
            // If path appears to be already encoded, decode first to avoid double-encoding
            if (hasEncodedChars) {
              try {
                // Try decoding - if it succeeds and produces a different result, use decoded version
                let decoded = path;
                // Try decoding multiple times in case of double-encoding
                let previousDecoded = path;
                for (let i = 0; i < 3; i++) {
                  try {
                    decoded = decodeURIComponent(previousDecoded);
                    if (decoded === previousDecoded) break; // No more decoding needed
                    previousDecoded = decoded;
                  } catch {
                    break; // Can't decode further
                  }
                }
                
                // Use decoded version if it's different and looks like a valid path
                if (decoded !== path && !decoded.includes("%")) {
                  pathToEncode = decoded;
                }
              } catch {
                // If decoding fails, use original path
                pathToEncode = path;
              }
            }
            
            const parts = pathToEncode.split("/");
            const encodedParts = parts.map((part, index) => {
              // Keep empty first part for absolute paths
              if (index === 0 && part === "") return "";
              
              // For kb-assets paths, replace underscores with spaces in filenames
              // This handles cases where the agent/manifest might have underscores instead of spaces
              if (pathToEncode.includes("/kb-assets/") && index === parts.length - 1 && part.includes("_")) {
                // This is the filename part - replace underscores with spaces
                part = part.replace(/_/g, " ");
              }
              
              // Skip encoding if part is already encoded (contains % and decoding changes it)
              if (part.includes("%")) {
                try {
                  const decoded = decodeURIComponent(part);
                  // If decoding produces different result, part was encoded - re-encode properly
                  if (decoded !== part) {
                    // Also fix underscores in decoded version
                    const fixed = decoded.replace(/_/g, " ");
                    return encodeURIComponent(fixed);
                  }
                } catch {
                  // If decoding fails, part might be partially encoded - encode as-is
                  return part;
                }
              }
              // Encode each segment (spaces become %20, etc.)
              return encodeURIComponent(part);
            });
            
            let normalized = encodedParts.join("/");
            // Preserve leading slash for absolute paths
            if (pathToEncode.startsWith("/") && !normalized.startsWith("/")) {
              normalized = "/" + normalized;
            }
            return normalized;
          } catch (e) {
            // Fallback to original path if encoding fails
            return path;
          }
        };
        
        // Handle Blob objects by converting to object URL
        let normalizedSrc: string;
        if (src instanceof Blob) {
          normalizedSrc = URL.createObjectURL(src);
        } else if (typeof src === 'string' || src === undefined) {
          normalizedSrc = normalizeImagePath(src);
        } else {
          normalizedSrc = "";
        }
        
        // Check if this image has already failed to load
        const imageHasFailed = failedImages.has(normalizedSrc);
        
        // If image failed, show placeholder instead
        if (imageHasFailed) {
          return (
            <div className="relative block my-3 max-w-[600px] max-h-96 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center" style={{ minHeight: '200px' }}>
              <div className="flex flex-col items-center justify-center p-8 text-center">
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
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <p className="text-sm text-gray-500 font-medium">Image unavailable</p>
                {alt && (
                  <p className="text-xs text-gray-400 mt-1">{alt}</p>
                )}
              </div>
            </div>
          );
        }
        
        return (
        <span className="relative block my-3 group">
          <img
            src={normalizedSrc}
            alt={alt}
            className="max-w-[600px] max-h-96 rounded-lg border border-gray-200 object-contain cursor-pointer hover:opacity-90 transition-opacity"
            loading="lazy"
            onClick={() => normalizedSrc && setModalImage({ src: normalizedSrc, alt: alt || "" })}
            onError={async (e) => {
              const img = e.target as HTMLImageElement;
              const currentSrc = img.src;
              
              // Check if we've already tried fallbacks (using data attribute)
              const fallbackAttempts = parseInt(img.getAttribute("data-fallback-attempts") || "0", 10);
              const hasTriedRefresh = img.getAttribute("data-refresh-attempted") === "true";
              
              // First, try refreshing expired GCS signed URLs
              if (!hasTriedRefresh && currentSrc.includes("storage.googleapis.com")) {
                const blobInfo = extractBlobIdFromGcsUrl(currentSrc);
                if (blobInfo) {
                  img.setAttribute("data-refresh-attempted", "true");
                  const freshUrl = await refreshGcsUrl(blobInfo.blob_id, blobInfo.extension);
                  if (freshUrl) {
                    img.src = freshUrl;
                    return; // Successfully refreshed, wait for image to load
                  }
                }
              }
              
              // Fallback to existing path-based fallbacks for /kb-assets/ paths
              if (fallbackAttempts < 3 && currentSrc.includes("/kb-assets/")) {
                try {
                  // Extract pathname from src (handles both absolute URLs and relative paths)
                  let pathname = currentSrc;
                  if (currentSrc.startsWith("http://") || currentSrc.startsWith("https://")) {
                    const url = new URL(currentSrc);
                    pathname = url.pathname;
                  } else if (currentSrc.startsWith("//")) {
                    // Protocol-relative URL
                    const url = new URL(currentSrc, window.location.origin);
                    pathname = url.pathname;
                  }
                  
                  // Decode the pathname to get the raw path
                  let decodedPath = pathname;
                  try {
                    decodedPath = decodeURIComponent(pathname);
                  } catch {
                    // If decoding fails, use pathname as-is
                    decodedPath = pathname;
                  }
                  
                  // Split path and work with filename
                  const parts = decodedPath.split("/");
                  const filename = parts[parts.length - 1];
                  
                  if (filename) {
                    let fixedFilename = filename;
                    let fixedPath = "";
                    
                    // Try different fallback strategies based on attempt number
                    if (fallbackAttempts === 0) {
                      // First attempt: try replacing hyphens with underscores
                      // Common case: agent generates "photo-of-andrei.png" but file is "photo_of_andrei.png"
                      fixedFilename = filename.replace(/-/g, "_");
                      parts[parts.length - 1] = fixedFilename;
                      const fixedParts = parts.map((part, index) => {
                        if (index === 0 && part === "") return "";
                        return encodeURIComponent(part);
                      });
                      fixedPath = fixedParts.join("/");
                      if (decodedPath.startsWith("/") && !fixedPath.startsWith("/")) {
                        fixedPath = "/" + fixedPath;
                      }
                    } else if (fallbackAttempts === 1) {
                      // Second attempt: try replacing hyphens with spaces
                      // Common case: agent generates "fram-portrait.png" but file is "photo of fram.png"
                      fixedFilename = filename.replace(/-/g, " ");
                      // Also handle special case: if filename contains "portrait" or similar, try "photo of" prefix
                      if (filename.toLowerCase().includes("portrait") && parts.length >= 2) {
                        // Check if we're in the fram folder
                        const folderName = parts[parts.length - 2];
                        if (folderName === "fram") {
                          fixedFilename = "photo of fram.png";
                        }
                      }
                      parts[parts.length - 1] = fixedFilename;
                      const fixedParts = parts.map((part, index) => {
                        if (index === 0 && part === "") return "";
                        return encodeURIComponent(part);
                      });
                      fixedPath = fixedParts.join("/");
                      if (decodedPath.startsWith("/") && !fixedPath.startsWith("/")) {
                        fixedPath = "/" + fixedPath;
                      }
                    } else if (fallbackAttempts === 2) {
                      // Third attempt: try replacing underscores with spaces (for files with spaces)
                      fixedFilename = filename.replace(/_/g, " ");
                      parts[parts.length - 1] = fixedFilename;
                      const fixedParts = parts.map((part, index) => {
                        if (index === 0 && part === "") return "";
                        return encodeURIComponent(part);
                      });
                      fixedPath = fixedParts.join("/");
                      if (decodedPath.startsWith("/") && !fixedPath.startsWith("/")) {
                        fixedPath = "/" + fixedPath;
                      }
                    }
                    
                    // Only set fixedPath if it wasn't set in the conditional above
                    if (!fixedPath) {
                      // Replace the filename in parts
                      parts[parts.length - 1] = fixedFilename;
                      
                      // Re-encode the entire path properly
                      const fixedParts = parts.map((part, index) => {
                        if (index === 0 && part === "") return "";
                        return encodeURIComponent(part);
                      });
                      fixedPath = fixedParts.join("/");
                      if (decodedPath.startsWith("/") && !fixedPath.startsWith("/")) {
                        fixedPath = "/" + fixedPath;
                      }
                    }
                    
                    // Mark that we've tried a fallback and update src
                    img.setAttribute("data-fallback-attempts", String(fallbackAttempts + 1));
                    img.src = fixedPath;
                    return; // Don't log error yet, wait to see if fallback works
                  }
                } catch (urlError) {
                  // If URL parsing fails, fall through to error logging
                }
              }
              
              // All fallbacks exhausted - mark image as failed and show placeholder
              setFailedImages((prev) => new Set(prev).add(normalizedSrc));
            }}
            {...props}
          />
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
        </span>
        );
      },

      // Horizontal rule
      hr: () => <hr className="my-4 border-gray-200" />,

      // Handle video tags with consistent styling
      video: ({ src, children, controls, ...props }) => {
        // Normalize src to string (handle Blob, MediaStream, MediaSource)
        let normalizedSrc: string | undefined;
        if (src instanceof Blob) {
          normalizedSrc = URL.createObjectURL(src);
        } else if (src instanceof MediaStream || src instanceof MediaSource) {
          // MediaStream and MediaSource need to be handled differently
          // For now, convert to empty string to avoid type error
          normalizedSrc = undefined;
        } else if (typeof src === 'string' || src === undefined) {
          normalizedSrc = src;
        } else {
          normalizedSrc = undefined;
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
