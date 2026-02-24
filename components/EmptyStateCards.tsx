"use client";

import { useState, useRef, useEffect } from "react";
import { getRandomCardAssets } from "@/lib/project-image-map";
import type { CardAsset } from "@/lib/project-image-map";

interface AssetContext {
  assetId: string;
  blobId: string;
  fileExtension: string;
  description: string;
}

interface EmptyStateCardsProps {
  isDark: boolean;
  onProjectClick: (query: string, assetContext?: AssetContext) => void;
  isVisible: boolean;
}

interface CardPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

const CARD_COUNT = 10;
const CARD_W = 180;
const CARD_H = 135;
const CARD_W_MOBILE = 140;
const CARD_H_MOBILE = 105;
const CARD_PAD = 16;

/**
 * Generate non-overlapping card positions within a container.
 * Reserves top area for greeting and bottom for prompt overlay.
 * Also avoids the centered prompt input zone (max-w-[500px], bottom-14).
 */
function generatePositions(
  containerW: number,
  containerH: number,
  count: number
): CardPosition[] {
  const isMobile = containerW < 640;
  const w = isMobile ? CARD_W_MOBILE : CARD_W;
  const h = isMobile ? CARD_H_MOBILE : CARD_H;

  // Reserve space: top for greeting, bottom just enough for footer
  const topReserve = 120;
  const bottomReserve = 56; // bottom-14 footer area only

  // Prompt exclusion zone: centered box matching the prompt input (max-w-[500px])
  // Accounts for hover scale (1.1x) so the name overlay stays visible
  const scaleExtra = Math.max(w, h) * 0.1;
  const promptW = Math.min(500, containerW - 16); // max-w-[500px] with px-2
  const promptH = 100; // prompt container height (~p-3 + textarea + button)
  const promptLeft = (containerW - promptW) / 2 - scaleExtra;
  const promptRight = promptLeft + promptW + scaleExtra * 2;
  const promptTop = containerH - bottomReserve - promptH - scaleExtra;

  const availW = containerW - w - CARD_PAD * 2;
  const availH = containerH - topReserve - bottomReserve - h;

  if (availW <= 0 || availH <= 0) return [];

  const positions: CardPosition[] = [];
  const maxAttempts = 200;

  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = CARD_PAD + Math.random() * availW;
      const y = topReserve + Math.random() * availH;

      // Check overlap with existing cards
      const overlaps = positions.some(
        (p) =>
          x < p.x + p.width + CARD_PAD &&
          x + w + CARD_PAD > p.x &&
          y < p.y + p.height + CARD_PAD &&
          y + h + CARD_PAD > p.y
      );

      // Check overlap with prompt input zone
      const hitsPrompt =
        y + h > promptTop &&
        x + w > promptLeft &&
        x < promptRight;

      if (!overlaps && !hitsPrompt) {
        positions.push({ x, y, width: w, height: h });
        placed = true;
        break;
      }
    }
    // If couldn't place after max attempts, skip this card
    if (!placed) break;
  }

  return positions;
}

export default function EmptyStateCards({
  isDark,
  onProjectClick,
  isVisible,
}: EmptyStateCardsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cardPositions, setCardPositions] = useState<CardPosition[]>([]);
  const [cards, setCards] = useState<CardAsset[]>([]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);

  // Measure container and generate positions on mount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        const positions = generatePositions(width, height, CARD_COUNT);
        setCardPositions(positions);
      }
    };

    // Use ResizeObserver to handle dynamic sizing
    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(el);
    measure();

    return () => observer.disconnect();
  }, []);

  // Load random assets from full manifest pool on mount
  useEffect(() => {
    let cancelled = false;

    async function loadAssets() {
      try {
        const assets = await getRandomCardAssets(CARD_COUNT);
        if (!cancelled) setCards(assets);
      } catch {
        // Silent fail — cards just won't appear
      }
    }

    loadAssets();
    return () => { cancelled = true; };
  }, []);

  // Trigger staggered fade-in once positions and cards are ready
  useEffect(() => {
    if (cardPositions.length > 0 && cards.length > 0) {
      // Small delay so the animation is visible
      const timer = setTimeout(() => setMounted(true), 50);
      // Mark intro complete after all stagger delays have elapsed
      const introTimer = setTimeout(
        () => setIntroComplete(true),
        50 + cards.length * 80 + 400
      );
      return () => { clearTimeout(timer); clearTimeout(introTimer); };
    }
  }, [cardPositions, cards]);

  const isMobile =
    typeof window !== "undefined" ? window.innerWidth < 640 : false;
  const cardW = isMobile ? CARD_W_MOBILE : CARD_W;
  const cardH = isMobile ? CARD_H_MOBILE : CARD_H;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 transition-opacity duration-500"
      style={{
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? "auto" : "none",
      }}
    >
      {/* Greeting */}
      <div className="absolute top-12 left-0 right-0 px-4 md:max-w-[950px] md:mx-auto">
        <p
          className={`uppercase text-[0.75rem] mb-1 tracking-wider transition-colors duration-300 ${
            isDark ? "text-gray-500" : "text-gray-400"
          }`}
        >
          FRAM
        </p>
        <p
          className={`leading-relaxed text-[0.875rem] font-mono transition-colors duration-300 ${
            isDark ? "text-gray-100" : "text-black"
          }`}
        >
          Hello. How can I help you today?
        </p>
      </div>

      {/* Floating cards */}
      {cardPositions.map((pos, index) => {
        if (index >= cards.length) return null;
        const card = cards[index];
        const isHovered = hoveredIndex === index;
        const isVideo = card.entityType === "video" || card.entityType === "gif";

        return (
          <button
            key={card.assetId}
            type="button"
            onClick={() => {
              const ctx: AssetContext = { assetId: card.assetId, blobId: card.blobId, fileExtension: card.fileExtension, description: card.description };
              onProjectClick(`Tell me about ${card.projectName}`, ctx);
            }}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            className="absolute overflow-hidden rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            style={{
              left: pos.x,
              top: pos.y,
              width: cardW,
              height: cardH,
              opacity: mounted ? 1 : 0,
              transform: mounted
                ? isHovered
                  ? "scale(1.1)"
                  : "scale(1)"
                : "scale(0.95)",
              transitionProperty: introComplete
                ? "transform, box-shadow"
                : "opacity, transform, box-shadow",
              transitionDuration: introComplete
                ? "250ms, 150ms"
                : "400ms, 400ms, 400ms",
              transitionTimingFunction: "ease-out",
              transitionDelay: introComplete ? "0ms" : `${index * 80}ms`,
              boxShadow: isHovered
                ? isDark
                  ? "0 20px 40px rgba(0,0,0,0.6)"
                  : "0 20px 40px rgba(0,0,0,0.15)"
                : isDark
                  ? "0 4px 12px rgba(0,0,0,0.4)"
                  : "0 4px 12px rgba(0,0,0,0.08)",
              zIndex: isHovered ? 10 : 1,
            }}
          >
            {/* Asset thumbnail: video/gif or image */}
            {isVideo ? (
              <video
                src={card.url}
                muted
                loop
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.url}
                alt={card.projectName}
                className="absolute inset-0 w-full h-full object-cover"
                loading="eager"
              />
            )}

            {/* Hover overlay with project name */}
            <div
              className="absolute inset-0 flex items-end"
              style={{
                opacity: isHovered ? 1 : 0,
                transition: "opacity 250ms ease-out",
                transitionDelay: isHovered ? "350ms" : "0ms",
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 60%)",
              }}
            >
              <span className="font-mono uppercase text-[0.65rem] tracking-wider text-white px-2 pb-2">
                {card.projectName}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
