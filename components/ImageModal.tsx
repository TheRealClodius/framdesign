"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ModalCloseButton from "./ModalCloseButton";

interface ImageModalProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export default function ImageModal({ src, alt, onClose }: ImageModalProps) {
  const [isClient, setIsClient] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);
  
  // Reset error state when src changes
  useEffect(() => {
    setImageError(false);
  }, [src]);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Prevent body scroll and lock scroll position
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const scrollY = window.scrollY;
    
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollY);
    };
  }, []);

  if (!isClient || typeof document === "undefined") return null;

  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) {
    console.error("Modal root not found");
    return null;
  }

  return createPortal(
    <div 
      style={{ 
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(38, 38, 38, 0.92)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        animation: "fadeIn 0.2s ease-in-out"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onTouchEnd={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <ModalCloseButton onClose={onClose} />

      <div style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "auto"
      }}>
        {imageError ? (
          <div className="flex flex-col items-center justify-center p-12 text-center max-w-md">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-400 mb-4"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <p className="text-lg text-gray-300 font-medium mb-2">Image unavailable</p>
            {alt && (
              <p className="text-sm text-gray-400">{alt}</p>
            )}
            <p className="text-xs text-gray-500 mt-4">The image could not be loaded. It may have expired or been removed.</p>
          </div>
        ) : (
          <img
            src={src}
            alt={alt}
            style={{ 
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              touchAction: "pan-x pan-y pinch-zoom",
              borderRadius: "0.5rem"
            }}
            onClick={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onError={() => {
              setImageError(true);
            }}
          />
        )}
      </div>
    </div>,
    modalRoot
  );
}
