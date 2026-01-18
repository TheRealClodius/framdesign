"use client";

interface ModalCloseButtonProps {
  onClose: () => void;
}

export default function ModalCloseButton({ onClose }: ModalCloseButtonProps) {
  return (
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
  );
}
