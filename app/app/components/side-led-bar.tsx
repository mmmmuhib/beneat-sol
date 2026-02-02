"use client";

interface SideLEDBarProps {
  value: number;
  segments?: number;
  side: "left" | "right";
  className?: string;
}

const SEGMENT_COLORS = [
  { bg: "#22c55e", glow: "rgba(34, 197, 94, 0.6)" },
  { bg: "#22c55e", glow: "rgba(34, 197, 94, 0.6)" },
  { bg: "#22c55e", glow: "rgba(34, 197, 94, 0.6)" },
  { bg: "#f59e0b", glow: "rgba(245, 158, 11, 0.6)" },
  { bg: "#f59e0b", glow: "rgba(245, 158, 11, 0.6)" },
  { bg: "#f59e0b", glow: "rgba(245, 158, 11, 0.6)" },
  { bg: "#f97316", glow: "rgba(249, 115, 22, 0.6)" },
  { bg: "#f97316", glow: "rgba(249, 115, 22, 0.6)" },
  { bg: "#ef4444", glow: "rgba(239, 68, 68, 0.7)" },
  { bg: "#ef4444", glow: "rgba(239, 68, 68, 0.7)" },
];

export function SideLEDBar({
  value,
  segments = 10,
  side,
  className = "",
}: SideLEDBarProps) {
  const activeSegments = Math.ceil((value / 100) * segments);

  return (
    <div
      className={`flex flex-col-reverse gap-1 ${className}`}
      style={{
        padding: "8px 4px",
        background: "linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)",
        borderRadius: "4px",
        boxShadow:
          "inset 0 2px 4px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.05)",
      }}
    >
      {Array.from({ length: segments }).map((_, index) => {
        const isActive = index < activeSegments;
        const color = SEGMENT_COLORS[index] || SEGMENT_COLORS[segments - 1];
        const isTopActive = index === activeSegments - 1 && isActive;

        return (
          <div
            key={index}
            className={`transition-all duration-200 ${isTopActive ? "animate-led-pulse" : ""}`}
            style={{
              width: "12px",
              height: "6px",
              borderRadius: "2px",
              background: isActive ? color.bg : "rgba(40, 40, 40, 0.8)",
              boxShadow: isActive
                ? `0 0 8px ${color.glow}, inset 0 1px 0 rgba(255, 255, 255, 0.3)`
                : "inset 0 1px 2px rgba(0, 0, 0, 0.4)",
              opacity: isActive ? 1 : 0.2,
            }}
          />
        );
      })}
    </div>
  );
}
