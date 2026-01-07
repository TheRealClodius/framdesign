"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

interface DiagramModalProps {
  dataUrl: string;
  onClose: () => void;
}

export default function DiagramModal({ dataUrl, onClose }: DiagramModalProps) {

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

  // Ensure we have a valid dataUrl
  if (!dataUrl) {
    console.error("DiagramModal: No dataUrl provided");
    return null;
  }

  // Only render on client side
  if (typeof document === "undefined") return null;

  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) {
    console.error("Modal root not found");
    return null;
  }

  console.log("DiagramModal rendering with dataUrl:", dataUrl.substring(0, 50) + "...");

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
        borderRadius: "0",
        animation: "fadeIn 0.2s ease-in-out"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          console.log("Backdrop clicked, closing modal");
          onClose();
        }
      }}
      onTouchEnd={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          console.log("Backdrop touched, closing modal");
          onClose();
        }
      }}
    >
      <button
        onClick={onClose}
        onTouchEnd={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        style={{ 
          position: "absolute",
          top: "1rem",
          right: "1rem",
          padding: "0.5rem",
          backgroundColor: "transparent",
          border: "none",
          cursor: "pointer",
          zIndex: 10,
          touchAction: "manipulation",
          color: "rgba(255, 255, 255, 0.7)"
        }}
        aria-label="Close fullscreen view"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="20" 
          height="20" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <div style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "auto"
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUrl}
          alt="Mermaid diagram fullscreen"
          style={{ 
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            touchAction: "pan-x pan-y pinch-zoom"
          }}
          onClick={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onError={() => {
            console.error("Failed to load diagram image:", dataUrl.substring(0, 100));
          }}
        />
      </div>
    </div>,
    modalRoot
  );
}
