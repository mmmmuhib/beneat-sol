"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// Custom shader for the brain video with edge blur and glow
const vertexShader = `
  varying vec2 vUv;
  varying vec2 vPosition;
  
  void main() {
    vUv = uv;
    vPosition = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Scale factor for the video (0.7 = 70% of screen)
const VIDEO_SCALE = 0.72;

const fragmentShader = `
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec2 uResolution;
  uniform float uEdgeBlur;
  uniform float uGlowStrength;
  uniform vec3 uGlowColor;
  
  varying vec2 vUv;
  varying vec2 vPosition;
  
  // Smoothstep helper
  float smoothStep(float edge0, float edge1, float x) {
    float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }
  
  void main() {
    vec2 uv = vUv;
    
    // Center the UV coordinates (-0.5 to 0.5)
    vec2 centeredUv = uv - 0.5;
    
    // Calculate distance from center for circular mask
    float dist = length(centeredUv);
    
    // Create soft edge mask
    float mask = 1.0 - smoothStep(uEdgeBlur, 0.5, dist);
    
    // Sample the video texture
    vec4 texColor = texture2D(uTexture, uv);
    
    // Apply green tint enhancement (the brain is green)
    vec3 greenTint = vec3(0.2, 1.0, 0.3);
    vec3 tintedColor = texColor.rgb * mix(vec3(1.0), greenTint, 0.3);
    
    // Add subtle glow based on brightness
    float brightness = dot(tintedColor, vec3(0.299, 0.587, 0.114));
    vec3 glow = uGlowColor * brightness * uGlowStrength * (1.0 - dist * 1.5);
    
    // Combine color with glow
    vec3 finalColor = tintedColor + glow;
    
    // Apply vignette
    float vignette = 1.0 - smoothStep(0.3, 0.5, dist);
    finalColor *= vignette * 0.3 + 0.7;
    
    // Apply opacity and mask
    float alpha = texColor.a * mask * uOpacity;
    
    // Discard fully transparent pixels for performance
    if (alpha < 0.01) discard;
    
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

interface VideoPlaneProps {
  videoSrc: string;
  onEnded?: () => void;
}

function VideoPlane({ videoSrc, onEnded }: VideoPlaneProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const textureRef = useRef<THREE.VideoTexture | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const { viewport } = useThree();

  // Create video element
  useEffect(() => {
    const video = document.createElement("video");
    video.src = videoSrc;
    video.crossOrigin = "anonymous";
    video.loop = false;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    
    videoRef.current = video;

    const texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    textureRef.current = texture;

    const handleCanPlay = () => {
      video.play().then(() => {
        setIsPlaying(true);
      }).catch(console.error);
    };

    const handleEnded = () => {
      onEnded?.();
    };

    video.addEventListener("canplaythrough", handleCanPlay);
    video.addEventListener("ended", handleEnded);

    // Try to play immediately if already cached
    if (video.readyState >= 3) {
      handleCanPlay();
    }

    return () => {
      video.removeEventListener("canplaythrough", handleCanPlay);
      video.removeEventListener("ended", handleEnded);
      video.pause();
      video.src = "";
      texture.dispose();
    };
  }, [videoSrc, onEnded]);

  // Shader material
  const uniforms = useMemo(
    () => ({
      uTexture: { value: null as THREE.VideoTexture | null },
      uTime: { value: 0 },
      uOpacity: { value: 0.8 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uEdgeBlur: { value: 0.25 },
      uGlowStrength: { value: 0.4 },
      uGlowColor: { value: new THREE.Color(0.2, 1.0, 0.3) },
    }),
    []
  );

  // Update texture reference
  useEffect(() => {
    if (textureRef.current) {
      uniforms.uTexture.value = textureRef.current;
    }
  }, [uniforms]);

  // Animation loop
  useFrame((state) => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;
      material.uniforms.uTime.value = state.clock.elapsedTime;
      
      // Subtle breathing animation on top of base scale
      const breathScale = 1 + Math.sin(state.clock.elapsedTime * 0.5) * 0.015;
      meshRef.current.scale.set(breathScale, breathScale, 1);
    }
  });

  // Calculate plane size - 70% of viewport for crisp display
  const baseWidth = Math.min(viewport.width * VIDEO_SCALE, viewport.height * VIDEO_SCALE * 1.78);
  const planeWidth = baseWidth;
  const planeHeight = baseWidth / 1.78;

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[planeWidth, planeHeight, 1, 1]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

interface BrainVideoShaderProps {
  videoSrc: string;
  onEnded?: () => void;
  className?: string;
}

export function BrainVideoShader({ videoSrc, onEnded, className }: BrainVideoShaderProps) {
  return (
    <div className={`absolute inset-0 ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        }}
        dpr={[1, 2]} // Responsive DPR for performance
      >
        <VideoPlane videoSrc={videoSrc} onEnded={onEnded} />
      </Canvas>
    </div>
  );
}
