"use client";

import { useEffect, useState, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import { BrainVideoShader } from "./brain-video-shader";

// Animated counter component
function AnimatedCounter({ value, prefix = "" }: { value: number; prefix?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    
    const duration = 1500;
    const steps = 60;
    const stepValue = value / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += stepValue;
      if (current >= value) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [isInView, value]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}{displayValue.toLocaleString()}
    </span>
  );
}

export function HeroSection() {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef(null);
  
  const { scrollY } = useScroll();
  
  // Content fade on scroll
  const contentOpacity = useTransform(scrollY, [0, 300], [1, 0.3]);

  useEffect(() => {
    setMounted(true);
  }, []);



  const scrollToFeatures = () => {
    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
  };

  // Word reveal variants
  const wordVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: 0.8 + i * 0.12,
        duration: 0.5,
        ease: [0.25, 0.1, 0.25, 1] as const
      }
    })
  };

  const words = [
    { text: "infrastructure", color: "text-white/90" },
    { text: "for", color: "text-white/90" },
    { text: "private", color: "text-white/70" },
    { text: ",", color: "text-white/90" },
    { text: "accountable", color: "text-white/70" },
    { text: ",", color: "text-white/90" },
    { text: "and", color: "text-white/90" },
    { text: "disciplined", color: "text-white/70" },
    { text: "trading", color: "text-white/90" },
  ];

  return (
    <section ref={containerRef} className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#0a0a0b]">
      {/* Organic noise texture */}
      <div className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundSize: "200px 200px"
        }}
      />
      
      {/* Subtle color washes */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-orange-500/5 rounded-full blur-[150px]" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-violet-500/5 rounded-full blur-[150px]" />

      {/* WebGL Brain Video Shader - 70% Size with Text on Top */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-full h-full max-w-5xl mx-auto">
          <BrainVideoShader 
            videoSrc="/brain.mp4" 
            className="pointer-events-auto"
          />
        </div>
      </div>
      
      {/* Vignette overlay for text readability */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 50% 50% at 50% 45%, transparent 35%, rgba(10, 10, 11, 0.6) 60%, rgba(10, 10, 11, 0.95) 100%),
            linear-gradient(to bottom, rgba(10, 10, 11, 0.3) 0%, transparent 30%, transparent 70%, rgba(10, 10, 11, 0.5) 100%)
          `,
        }}
      />

      {/* Corner accents */}
      <div className="absolute top-8 left-8 w-4 h-4 border-l border-t border-white/10" />
      <div className="absolute top-8 right-8 w-4 h-4 border-r border-t border-white/10" />
      <div className="absolute bottom-8 left-8 w-4 h-4 border-l border-b border-white/10" />
      <div className="absolute bottom-8 right-8 w-4 h-4 border-r border-b border-white/10" />

      {/* Main content */}
      <motion.div 
        style={{ opacity: contentOpacity }}
        className="relative z-10 w-full max-w-5xl mx-auto px-6 py-20"
      >
        
        {/* Top - Brand name only, larger */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-center mb-6"
        >
          <span className="text-3xl sm:text-4xl md:text-5xl tracking-[0.5em] text-white/95 uppercase font-light">
            Beneat
          </span>
          <div className="mt-4 flex justify-center">
            <div className="w-24 h-px bg-gradient-to-r from-transparent via-orange-500/60 to-transparent" />
          </div>
        </motion.div>

        {/* Brain Video Area with Keywords */}
        <div className="relative h-80 sm:h-96 mb-12">
          {/* Floating labels around brain video - all white/gray tones */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20">
            <span className="text-[10px] tracking-[0.3em] text-white/60 uppercase font-medium">Private</span>
          </div>
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 z-20">
            <span className="text-[10px] tracking-[0.3em] text-white/40 uppercase font-medium">Accountable</span>
          </div>
          <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20">
            <span className="text-[10px] tracking-[0.3em] text-white/50 uppercase -rotate-90 block font-medium origin-center">Disciplined</span>
          </div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20">
            <span className="text-[10px] tracking-[0.3em] text-white/30 uppercase rotate-90 block font-medium origin-center">Trading</span>
          </div>
        </div>

        {/* Slogan with word-by-word reveal */}
        <div className="text-center mb-12 mt-16">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-light tracking-wide flex flex-wrap justify-center gap-x-1.5 gap-y-1">
            {words.map((word, i) => (
              <motion.span
                key={i}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={wordVariants}
                className={word.color}
              >
                {word.text}
              </motion.span>
            ))}
          </h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.8, duration: 0.6 }}
            className="mt-3 text-sm text-white/30 tracking-wider"
          >
            On-chain risk enforcement via neural behavioral analysis
          </motion.p>
        </div>

        {/* CTAs - Positioned at bottom */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2, duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex flex-col items-center justify-center gap-8 mt-12"
        >
          {/* Minimalist outline button */}
          <button className="group flex items-center gap-3 px-10 py-4 border border-white/20 text-white/70 font-light text-sm tracking-[0.2em] uppercase hover:border-white/50 hover:text-white hover:bg-white/5 transition-all duration-300">
            Initialize Protocol
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1.5" />
          </button>
          
          {/* Live Stats with animated counter */}
          <div className="flex items-center gap-6 text-xs tracking-wider text-white/30">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span><AnimatedCounter value={127} /> traders active</span>
            </div>
            <div className="w-px h-3 bg-white/10" />
            <div>$<AnimatedCounter value={2400000} /> in protected volume</div>
          </div>
        </motion.div>

      </motion.div>
    </section>
  );
}
