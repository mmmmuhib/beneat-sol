"use client";

import { useRef, useState } from "react";
import { Eye, EyeOff, Lock, Globe, User, Check, X } from "lucide-react";
import { motion, AnimatePresence, useInView } from "framer-motion";

const dataItems = [
  { label: "Wallet Status", value: "Locked", public: true },
  { label: "Unlock Time", value: "2026-01-30 14:00 UTC", public: true },
  { label: "Lockout Reason", value: "Daily Loss Limit Reached", public: false },
  { label: "Daily P&L", value: "-$1,247.50", public: false },
  { label: "Strategy", value: "Scalp BTC/ETH", public: false },
];

export function PrivacySection() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <section ref={sectionRef} className="relative py-24 lg:py-32 bg-[#0a0a0b]">
      {/* Background */}
      <div className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundSize: "200px 200px"
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-6">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-8 h-px bg-gradient-to-r from-transparent to-emerald-500/60" />
            <span className="text-xs uppercase tracking-[0.2em] text-emerald-400">Privacy</span>
            <div className="w-8 h-px bg-gradient-to-l from-transparent to-violet-500/60" />
          </div>
          
          <h2 className="text-2xl sm:text-3xl text-white font-light tracking-wide mb-4">
            Accountable Without{" "}
            <span className="text-emerald-400">Exposure</span>
          </h2>
          
          <p className="text-white/40 text-sm">
            Traditional platforms expose everything or nothing. Beneat gives you 
            granular control.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Left: Explanation */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="space-y-4"
          >
            <FeatureItem 
              icon={Eye} 
              title="Public Accountability" 
              description="Your lockout status is public and verifiable. Creates social accountability without exposing strategy."
              color="emerald"
            />
            <FeatureItem 
              icon={EyeOff} 
              title="Private Details" 
              description="Your P&L, rules, and patterns remain encrypted. Only you hold the keys."
              color="violet"
            />
            <FeatureItem 
              icon={Lock} 
              title="ZK Settlement" 
              description="Light Protocol compresses settlements into private state. Verifiable without revealing amounts."
              color="cyan"
            />
          </motion.div>

          {/* Right: Interactive Demo */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.3 }}
          >
            <PrivacyToggle />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function FeatureItem({ icon: Icon, title, description, color }: { 
  icon: typeof Eye; 
  title: string; 
  description: string;
  color: "emerald" | "violet" | "cyan";
}) {
  const colors = {
    emerald: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    violet: "text-violet-400 border-violet-500/30 bg-violet-500/10",
    cyan: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
  };

  return (
    <div className="p-5 bg-white/[0.02] border border-white/10">
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 ${colors[color]} border flex items-center justify-center shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-white font-light mb-1">{title}</h3>
          <p className="text-sm text-white/40 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

function PrivacyToggle() {
  const [activeView, setActiveView] = useState<"public" | "private">("public");

  return (
    <div className="relative bg-white/[0.02] border border-white/10 overflow-hidden">
      {/* Toggle Header */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setActiveView("public")}
          className={`flex-1 py-4 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            activeView === "public" 
              ? "bg-emerald-500/10 text-emerald-400" 
              : "text-white/40 hover:text-white/60"
          }`}
        >
          <Globe className="w-4 h-4" />
          Public View
        </button>
        <button
          onClick={() => setActiveView("private")}
          className={`flex-1 py-4 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            activeView === "private" 
              ? "bg-violet-500/10 text-violet-400" 
              : "text-white/40 hover:text-white/60"
          }`}
        >
          <User className="w-4 h-4" />
          Private View
        </button>
      </div>

      {/* Content with AnimatePresence */}
      <div className="p-5">
        <div className="space-y-2">
          {dataItems.map((item, index) => (
            <motion.div
              key={item.label}
              initial={false}
              animate={{ 
                backgroundColor: item.public === (activeView === "public") 
                  ? "rgba(255,255,255,0.03)" 
                  : "rgba(255,255,255,0.01)" 
              }}
              className="flex items-center justify-between p-3 border border-white/5"
            >
              <div className="flex items-center gap-3">
                <motion.div 
                  animate={{ rotate: item.public === (activeView === "public") ? 0 : 180 }}
                  transition={{ duration: 0.3 }}
                  className={`w-8 h-8 flex items-center justify-center ${
                    item.public 
                      ? "bg-emerald-500/10 text-emerald-400" 
                      : "bg-violet-500/10 text-violet-400"
                  }`}
                >
                  {item.public === (activeView === "public") ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                </motion.div>
                <span className="text-sm text-white/60">{item.label}</span>
              </div>
              
              <AnimatePresence mode="wait">
                {item.public === (activeView === "public") ? (
                  <motion.span
                    key="visible"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className={`text-sm font-mono ${
                      item.label === "Daily P&L" && item.value.startsWith("-") 
                        ? "text-red-400" 
                        : "text-white/80"
                    }`}
                  >
                    {item.value}
                  </motion.span>
                ) : (
                  <motion.div
                    key="hidden"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2 text-white/20"
                  >
                    <Lock className="w-3 h-3" />
                    <span className="text-xs font-mono">Hidden</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
          <span className="text-xs text-white/30">
            {activeView === "public" ? "What the world sees" : "What only you see"}
          </span>
          <span className={`text-xs font-mono ${
            activeView === "public" ? "text-emerald-400/60" : "text-violet-400/60"
          }`}>
            {activeView === "public" ? "Verified on Solana" : "Protected by Light"}
          </span>
        </div>
      </div>

      {/* Corner accents */}
      <div className={`absolute top-0 left-0 w-3 h-3 border-l border-t transition-colors ${
        activeView === "public" ? "border-emerald-500/40" : "border-violet-500/40"
      }`} />
      <div className={`absolute top-0 right-0 w-3 h-3 border-r border-t transition-colors ${
        activeView === "public" ? "border-emerald-500/40" : "border-violet-500/40"
      }`} />
    </div>
  );
}
