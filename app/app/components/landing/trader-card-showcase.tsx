"use client";

import { useRef } from "react";
import {
  Activity,
  TrendingUp,
  Clock,
  Target,
  Brain,
  TrendingDown,
  Dna,
  Zap,
} from "lucide-react";
import { motion, useInView, useSpring, useTransform } from "framer-motion";
import dynamic from "next/dynamic";

// Dynamic import for DNA helix to prevent SSR issues
const DNAHelixBackground = dynamic(
  () => import("./dna-helix").then((mod) => mod.DNAHelixBackground),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 bg-gradient-to-br from-violet-900/10 via-transparent to-cyan-900/10" />
    ),
  }
);

const stats = [
  { label: "DIS", value: 45, name: "Discipline", icon: Target, color: "#f97316" },
  { label: "PAT", value: 32, name: "Patience", icon: Clock, color: "#8b5cf6" },
  { label: "CON", value: 78, name: "Consistency", icon: Activity, color: "#06b6d4" },
  { label: "TIM", value: 81, name: "Timing", icon: TrendingUp, color: "#22c55e" },
  { label: "RSK", value: 67, name: "Risk", icon: TrendingDown, color: "#f59e0b" },
  { label: "END", value: 89, name: "Endurance", icon: Brain, color: "#ec4899" },
];

export function TraderCardShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, {
    once: true,
    margin: "-100px",
    amount: 0.2,
  });

  return (
    <section
      ref={sectionRef}
      id="trader-dna"
      className="relative py-24 lg:py-32 bg-[#0a0a0b] overflow-hidden"
    >
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center min-h-[600px]">
          {/* Left: Content */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
            className="order-1"
          >
            {/* Section label */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-px bg-gradient-to-r from-violet-500/60 to-transparent" />
              <span className="text-xs uppercase tracking-[0.25em] text-violet-400 font-medium">
                On-Chain Analysis
              </span>
            </div>

            {/* Main heading */}
            <h2 className="text-3xl sm:text-4xl lg:text-5xl text-white font-light tracking-tight mb-6">
              Your Trading{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">
                DNA
              </span>
            </h2>

            {/* Description */}
            <p className="text-white/50 text-base lg:text-lg mb-10 leading-relaxed max-w-lg">
              Every trade you&apos;ve made is etched on the blockchain. We analyze
              your complete on-chain history to reveal the behavioral patterns
              that make your trading style unique.
            </p>

            {/* Stats Grid - All 6 stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{
                    delay: 0.4 + i * 0.08,
                    duration: 0.5,
                    ease: [0.25, 0.1, 0.25, 1],
                  }}
                  className="group p-4 bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-white/10 backdrop-blur-sm rounded-lg transition-all duration-300"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="p-1.5 rounded"
                      style={{ backgroundColor: `${stat.color}15` }}
                    >
                      <stat.icon
                        className="w-3.5 h-3.5"
                        style={{ color: stat.color }}
                      />
                    </div>
                    <span className="text-xs font-mono text-white/40 uppercase tracking-wider">
                      {stat.label}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-2xl font-light"
                      style={{ color: stat.color }}
                    >
                      {stat.value}
                    </span>
                    <span className="text-xs text-white/30">{stat.name}</span>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={isInView ? { width: `${stat.value}%` } : {}}
                      transition={{
                        delay: 0.6 + i * 0.08,
                        duration: 0.8,
                        ease: [0.25, 0.1, 0.25, 1],
                      }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: stat.color }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Additional info row */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ delay: 1, duration: 0.6 }}
              className="mt-8 flex flex-wrap items-center gap-6 text-xs text-white/30"
            >
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                <span>Live on-chain data</span>
              </div>
              <div className="w-px h-3 bg-white/10" />
              <div className="flex items-center gap-2">
                <Zap className="w-3 h-3 text-amber-400" />
                <span>AI-powered insights</span>
              </div>
              <div className="w-px h-3 bg-white/10" />
              <span>Updated every block</span>
            </motion.div>
          </motion.div>

          {/* Right: DNA Helix */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="order-2 relative h-[400px] lg:h-[600px]"
          >
            {/* DNA Helix Container */}
            <div className="absolute inset-0 -right-20 lg:-right-32">
              <DNAHelixBackground className="opacity-90" />
            </div>

            {/* Gradient overlays for blending */}
            <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-[#0a0a0b] pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0b]/80 via-transparent to-[#0a0a0b]/80 pointer-events-none" />

            {/* Subtle glow behind helix */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-64 rounded-full bg-gradient-radial from-violet-500/10 via-transparent to-transparent blur-3xl" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export default TraderCardShowcase;
