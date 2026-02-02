"use client";

import { useMemo } from "react";
import type { RiskLevel } from "../hooks/use-behavioral-analysis";

interface EmotionalSpeedometerProps {
  score: number;
  riskLevel?: RiskLevel;
  pattern?: string;
  size?: number;
  label?: string;
  color?: string;
  inverted?: boolean;
}

const RISK_COLORS: Record<RiskLevel, { primary: string; glow: string }> = {
  low: { primary: "#22c55e", glow: "rgba(34, 197, 94, 0.5)" },
  medium: { primary: "#f59e0b", glow: "rgba(245, 158, 11, 0.5)" },
  high: { primary: "#f97316", glow: "rgba(249, 115, 22, 0.6)" },
  critical: { primary: "#ef4444", glow: "rgba(239, 68, 68, 0.7)" },
};

function getScoreColor(score: number, inverted: boolean): { primary: string; glow: string } {
  const effectiveScore = inverted ? score : 100 - score;
  if (effectiveScore >= 80) return RISK_COLORS.low;
  if (effectiveScore >= 50) return RISK_COLORS.medium;
  if (effectiveScore >= 30) return RISK_COLORS.high;
  return RISK_COLORS.critical;
}

export function EmotionalSpeedometer({
  score,
  riskLevel,
  pattern,
  size = 200,
  label,
  color,
  inverted = true,
}: EmotionalSpeedometerProps) {
  const colors = useMemo(() => {
    if (color) {
      return { primary: color, glow: `${color}80` };
    }
    if (riskLevel) {
      return RISK_COLORS[riskLevel];
    }
    return getScoreColor(score, inverted);
  }, [color, riskLevel, score, inverted]);

  const arcData = useMemo(() => {
    const radius = 70;
    const circumference = 2 * Math.PI * radius;
    const startAngle = 135;
    const endAngle = 405;
    const totalAngle = endAngle - startAngle;
    const arcLength = (totalAngle / 360) * circumference;
    const scoreAngle = (score / 100) * totalAngle;
    const progressLength = (scoreAngle / 360) * circumference;
    const dashOffset = arcLength - progressLength;

    return {
      radius,
      circumference,
      arcLength,
      dashOffset,
      startAngle,
    };
  }, [score]);

  const isCompact = size < 120;
  const isTiny = size < 90;

  const tickMarks = useMemo(() => {
    const major: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const minor: { x1: number; y1: number; x2: number; y2: number }[] = [];

    const centerX = 100;
    const centerY = 100;
    const outerRadius = 82;
    const majorLength = isTiny ? 5 : isCompact ? 6 : 10;
    const minorLength = isCompact ? 3 : 5;
    const startAngle = 135;
    const totalAngle = 270;

    const majorCount = isTiny ? 4 : isCompact ? 5 : 12;
    for (let i = 0; i <= majorCount; i++) {
      const angle = startAngle + (i / majorCount) * totalAngle;
      const rad = (angle * Math.PI) / 180;
      const x1 = centerX + outerRadius * Math.cos(rad);
      const y1 = centerY + outerRadius * Math.sin(rad);
      const x2 = centerX + (outerRadius - majorLength) * Math.cos(rad);
      const y2 = centerY + (outerRadius - majorLength) * Math.sin(rad);
      major.push({ x1, y1, x2, y2 });
    }

    if (!isCompact) {
      for (let i = 0; i < 48; i++) {
        if (i % 4 === 0) continue;
        const angle = startAngle + (i / 48) * totalAngle;
        const rad = (angle * Math.PI) / 180;
        const x1 = centerX + outerRadius * Math.cos(rad);
        const y1 = centerY + outerRadius * Math.sin(rad);
        const x2 = centerX + (outerRadius - minorLength) * Math.cos(rad);
        const y2 = centerY + (outerRadius - minorLength) * Math.sin(rad);
        minor.push({ x1, y1, x2, y2 });
      }
    }

    return { major, minor };
  }, [isCompact, isTiny]);

  return (
    <div
      className="relative"
      style={
        {
          width: size,
          height: size,
        }
      }
    >
      <svg viewBox="0 0 200 200" className="w-full h-full">
        <defs>
          <linearGradient id="bezelGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3a3a3a" />
            <stop offset="30%" stopColor="#1a1a1a" />
            <stop offset="70%" stopColor="#0a0a0a" />
            <stop offset="100%" stopColor="#2a2a2a" />
          </linearGradient>

          <radialGradient id="innerGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1a1a1a" />
            <stop offset="100%" stopColor="#0a0a0a" />
          </radialGradient>
        </defs>

        <circle
          cx="100"
          cy="100"
          r="95"
          fill="url(#bezelGradient)"
          stroke="#2a2a2a"
          strokeWidth="2"
        />

        <circle
          cx="100"
          cy="100"
          r="88"
          fill="none"
          stroke="rgba(0, 0, 0, 0.5)"
          strokeWidth="6"
        />

        <circle cx="100" cy="100" r="85" fill="url(#innerGradient)" />

        <circle
          cx="100"
          cy="100"
          r="82"
          fill="none"
          stroke="rgba(0, 0, 0, 0.4)"
          strokeWidth="1"
        />

        {tickMarks.minor.map((tick, i) => (
          <line
            key={`minor-${i}`}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="1"
          />
        ))}
        {tickMarks.major.map((tick, i) => (
          <line
            key={`major-${i}`}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke="rgba(255, 255, 255, 0.4)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ))}

        <circle
          cx="100"
          cy="100"
          r={arcData.radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.05)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={arcData.arcLength}
          strokeDashoffset={0}
          transform="rotate(135 100 100)"
        />

        <circle
          cx="100"
          cy="100"
          r={arcData.radius}
          fill="none"
          stroke={colors.primary}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={arcData.arcLength}
          strokeDashoffset={arcData.dashOffset}
          transform="rotate(135 100 100)"
          className="transition-all duration-500"
        />

        <circle
          cx="100"
          cy="100"
          r={isTiny ? 45 : isCompact ? 42 : 40}
          fill="#0a0a0a"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="1"
        />

        <text
          x="100"
          y="102"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fontFamily: "var(--font-mono), monospace",
            fontSize: isTiny ? "36px" : isCompact ? "32px" : "28px",
            fontWeight: "bold",
            fill: colors.primary,
          }}
        >
          {score}
        </text>

        <circle
          cx="100"
          cy="100"
          r="94"
          fill="none"
          stroke="rgba(255, 255, 255, 0.05)"
          strokeWidth="1"
        />
      </svg>

      {label && (
        <div
          className="absolute left-1/2 -translate-x-1/2 text-center w-full"
          style={{ bottom: isTiny ? -14 : isCompact ? -12 : size * 0.02 }}
        >
          <span
            className="uppercase tracking-wider font-semibold"
            style={{
              fontSize: isTiny ? "9px" : isCompact ? "10px" : "11px",
              color: "rgba(255, 255, 255, 0.6)",
              letterSpacing: "1px",
            }}
          >
            {label}
          </span>
        </div>
      )}

      {pattern && !isCompact && (
        <div
          className="absolute left-1/2 -translate-x-1/2 text-center"
          style={{ bottom: size * 0.08 }}
        >
          <span
            className="text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded"
            style={{
              color: colors.primary,
              background: `${colors.primary}15`,
              border: `1px solid ${colors.primary}30`,
            }}
          >
            {pattern}
          </span>
        </div>
      )}
    </div>
  );
}
