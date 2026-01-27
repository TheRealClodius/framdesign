"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/lib/hooks/useTheme";

interface SuggestionImagePopupProps {
  imagePath: string;
  alt: string;
  buttonRect: DOMRect;
}

export default function SuggestionImagePopup({
  imagePath,
  alt,
  buttonRect,
}: SuggestionImagePopupProps) {
  const [isClient, setIsClient] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, showAbove: false });
  const theme = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Calculate popup position
  useEffect(() => {
    const POPUP_MAX_WIDTH = 400;
    const POPUP_MAX_HEIGHT = 300; // Estimated max height for image
    const GAP = 8;
    const VIEWPORT_PADDING = 16;

    // Calculate initial position (below button, centered)
    let top = buttonRect.bottom + GAP;
    let left = buttonRect.left + buttonRect.width / 2 - POPUP_MAX_WIDTH / 2;
    let showAbove = false;

    // Check right edge overflow
    if (left + POPUP_MAX_WIDTH > window.innerWidth - VIEWPORT_PADDING) {
      left = buttonRect.right - POPUP_MAX_WIDTH;
    }

    // Check left edge overflow
    if (left < VIEWPORT_PADDING) {
      left = buttonRect.left;
    }

    // Check bottom edge overflow - show above if needed
    if (top + POPUP_MAX_HEIGHT > window.innerHeight - VIEWPORT_PADDING) {
      top = buttonRect.top - GAP - POPUP_MAX_HEIGHT;
      showAbove = true;
    }

    setPosition({ top, left, showAbove });
  }, [buttonRect]);

  // Reset error state when image changes
  useEffect(() => {
    setImageError(false);
  }, [imagePath]);

  if (!isClient || typeof document === "undefined") return null;

  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) {
    console.error("Modal root not found");
    return null;
  }

  return createPortal(
    <>
      {/* Popup container */}
      <div
        style={{
          position: "fixed",
          top: `${position.top}px`,
          left: `${position.left}px`,
          maxWidth: "400px",
          minWidth: "250px",
          backgroundColor: isDark ? "#1f1f1f" : "#ffffff",
          borderRadius: "8px",
          boxShadow: isDark
            ? "0 8px 24px rgba(0, 0, 0, 0.6)"
            : "0 8px 24px rgba(0, 0, 0, 0.15)",
          zIndex: 9999,
          padding: "0",
          animation: "fadeIn 0.2s ease-in-out",
          pointerEvents: "none",
        }}
      >
        {/* Image content */}
        <div
          style={{
            width: "100%",
            maxHeight: "300px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {imageError ? (
            <div
              style={{
                padding: "32px",
                textAlign: "center",
                color: isDark ? "#999" : "#666",
              }}
            >
              <p style={{ fontSize: "14px", marginBottom: "8px" }}>Image unavailable</p>
              {alt && <p style={{ fontSize: "12px" }}>{alt}</p>}
            </div>
          ) : (
            <img
              src={imagePath}
              alt={alt}
              style={{
                maxWidth: "100%",
                maxHeight: "300px",
                objectFit: "contain",
                borderRadius: "4px",
              }}
              onError={() => setImageError(true)}
            />
          )}
        </div>
      </div>

      {/* CSS animation for fade-in */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </>,
    modalRoot
  );
}
