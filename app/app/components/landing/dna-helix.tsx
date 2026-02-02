"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
// Post-processing is available in @react-three/postprocessing
// For now, we implement custom glow effects in shaders for better compatibility

// ============================================
// ADVANCED SHADER MATERIALS
// ============================================

// Enhanced vertex shader with displacement
const helixVertexShader = `
  uniform float uTime;
  uniform float uPulseSpeed;
  
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying float vGlow;
  
  // Simplex noise function
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
            
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
  
  void main() {
    vPosition = position;
    vNormal = normalize(normalMatrix * normal);
    
    // Add subtle displacement based on noise
    float noise = snoise(position * 0.5 + uTime * 0.2);
    vec3 displaced = position + normal * noise * 0.02;
    
    // Calculate glow intensity based on position and time
    vGlow = 0.5 + 0.5 * sin(uTime * uPulseSpeed + position.y * 2.0);
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

// Enhanced fragment shader with fresnel and energy effects
const helixFragmentShader = `
  uniform vec3 uColor;
  uniform vec3 uColorSecondary;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uFresnelPower;
  uniform float uGlowIntensity;
  
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying float vGlow;
  
  void main() {
    // Fresnel effect for edge glow
    vec3 viewDirection = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - abs(dot(vNormal, viewDirection)), uFresnelPower);
    
    // Energy flow along the strand
    float energyFlow = sin(vPosition.y * 3.0 - uTime * 2.0) * 0.5 + 0.5;
    
    // Mix primary and secondary colors
    vec3 colorMix = mix(uColor, uColorSecondary, energyFlow * 0.3);
    
    // Combine effects
    float intensity = (0.3 + fresnel * uGlowIntensity) * (0.8 + vGlow * 0.4);
    vec3 finalColor = colorMix * intensity;
    
    // Add energy core
    float core = pow(fresnel, 3.0) * energyFlow;
    finalColor += uColor * core * 0.5;
    
    // Distance-based fade for soft edges
    float dist = length(vPosition.xz);
    float alpha = uOpacity * (1.0 - smoothstep(2.5, 4.0, dist));
    alpha *= (0.6 + fresnel * 0.4);
    
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// Rung shader with energy pulse
const rungVertexShader = `
  uniform float uTime;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying float vDepth;
  
  void main() {
    vPosition = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const rungFragmentShader = `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uPulsePhase;
  
  varying vec3 vPosition;
  varying vec3 vNormal;
  
  void main() {
    vec3 viewDirection = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - abs(dot(vNormal, viewDirection)), 2.0);
    
    // Pulsing effect
    float pulse = 0.6 + 0.4 * sin(uTime * 1.5 + uPulsePhase);
    
    // Energy at the center of rung
    float centerGlow = 1.0 - abs(vPosition.z) * 2.0;
    centerGlow = pow(max(centerGlow, 0.0), 2.0);
    
    vec3 finalColor = uColor * (0.4 + fresnel * 0.8 + centerGlow * 0.5) * pulse;
    float alpha = uOpacity * (0.5 + fresnel * 0.5) * pulse;
    
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// ============================================
// HELIX STRAND COMPONENT
// ============================================

interface HelixStrandProps {
  color: THREE.Color;
  colorSecondary: THREE.Color;
  rotationOffset: number;
  radius: number;
  turns?: number;
  height?: number;
}

function HelixStrand({
  color,
  colorSecondary,
  rotationOffset,
  radius,
  turns = 3,
  height = 10,
}: HelixStrandProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const rungsRef = useRef<THREE.InstancedMesh>(null);

  const uniforms = useMemo(
    () => ({
      uColor: { value: color },
      uColorSecondary: { value: colorSecondary },
      uTime: { value: 0 },
      uOpacity: { value: 0.8 },
      uFresnelPower: { value: 2.5 },
      uGlowIntensity: { value: 1.2 },
      uPulseSpeed: { value: 0.8 },
    }),
    [color, colorSecondary]
  );

  const rungUniforms = useMemo(
    () => ({
      uColor: { value: color },
      uTime: { value: 0 },
      uOpacity: { value: 0.5 },
      uPulsePhase: { value: rotationOffset },
    }),
    [color, rotationOffset]
  );

  // Create helix curve with smoother interpolation
  const helixPoints = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const segments = 300;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * Math.PI * 2 * turns + rotationOffset;
      const y = (t - 0.5) * height;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      points.push(new THREE.Vector3(x, y, z));
    }
    return points;
  }, [rotationOffset, radius, turns, height]);

  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(helixPoints),
    [helixPoints]
  );

  // Create rungs connecting strands with optimized instancing
  const rungCount = 50;
  const oppositeOffset = Math.PI;

  const { rungMatrices, rungPhases } = useMemo(() => {
    const matrices: THREE.Matrix4[] = [];
    const phases: number[] = [];

    for (let i = 0; i < rungCount; i++) {
      const t = i / rungCount;
      const angle = t * Math.PI * 2 * turns + rotationOffset;
      const y = (t - 0.5) * height;

      const x1 = Math.cos(angle) * radius;
      const z1 = Math.sin(angle) * radius;
      const x2 = Math.cos(angle + oppositeOffset) * radius;
      const z2 = Math.sin(angle + oppositeOffset) * radius;

      const start = new THREE.Vector3(x1, y, z1);
      const end = new THREE.Vector3(x2, y, z2);
      const mid = start.clone().add(end).multiplyScalar(0.5);

      const matrix = new THREE.Matrix4();
      matrix.lookAt(start, end, new THREE.Vector3(0, 1, 0));
      matrix.setPosition(mid);

      const distance = start.distanceTo(end);
      matrix.scale(new THREE.Vector3(0.025, 0.025, distance * 0.98));

      matrices.push(matrix);
      phases.push(t * Math.PI * 4);
    }
    return { rungMatrices: matrices, rungPhases: phases };
  }, [rotationOffset, radius, turns, height]);

  // Animation frame
  useFrame((state) => {
    const time = state.clock.elapsedTime;

    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;
      material.uniforms.uTime.value = time;
      meshRef.current.rotation.y = time * 0.03;
    }

    if (rungsRef.current) {
      rungsRef.current.rotation.y = time * 0.03;
      const material = rungsRef.current.material as THREE.ShaderMaterial;
      material.uniforms.uTime.value = time;
    }
  });

  const tubeGeometry = useMemo(
    () => new THREE.TubeGeometry(curve, 150, 0.035, 12, false),
    [curve]
  );
  const rungGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  return (
    <>
      <mesh ref={meshRef} geometry={tubeGeometry}>
        <shaderMaterial
          vertexShader={helixVertexShader}
          fragmentShader={helixFragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>

      <instancedMesh
        ref={rungsRef}
        args={[rungGeometry, undefined, rungCount]}
      >
        <shaderMaterial
          vertexShader={rungVertexShader}
          fragmentShader={rungFragmentShader}
          uniforms={rungUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
    </>
  );
}

// ============================================
// CORE GLOW COMPONENT
// ============================================

function CoreGlow() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.08 + 0.04 * Math.sin(state.clock.elapsedTime * 0.8);
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.8, 32, 32]} />
      <meshBasicMaterial
        color="#8b5cf6"
        transparent
        opacity={0.08}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ============================================
// ENERGY FIELD PARTICLES
// ============================================

function EnergyField() {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 400;

  const { positions, colors, sizes, phases } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Create spiral distribution around the helix
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.5 + Math.random() * 3;
      const height = (Math.random() - 0.5) * 12;

      positions[i3] = Math.cos(angle) * radius;
      positions[i3 + 1] = height;
      positions[i3 + 2] = Math.sin(angle) * radius;

      // Color gradient from violet to cyan
      const mixFactor = Math.random();
      colors[i3] = mix(0.55, 0.02, mixFactor);     // R
      colors[i3 + 1] = mix(0.36, 0.71, mixFactor); // G
      colors[i3 + 2] = mix(0.96, 0.83, mixFactor); // B

      sizes[i] = 0.02 + Math.random() * 0.04;
      phases[i] = Math.random() * Math.PI * 2;
    }

    return { positions, colors, sizes, phases };
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
    }),
    []
  );

  useFrame((state) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * 0.015;
      const material = pointsRef.current.material as THREE.ShaderMaterial;
      material.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-phase" args={[phases, 1]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={`
          uniform float uTime;
          attribute float size;
          attribute float phase;
          varying vec3 vColor;
          varying float vAlpha;
          
          void main() {
            vColor = color;
            
            // Twinkle effect
            float twinkle = 0.6 + 0.4 * sin(uTime * 1.5 + phase);
            vAlpha = twinkle;
            
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (300.0 / -mvPosition.z) * twinkle;
            gl_Position = projectionMatrix * mvPosition;
          }
        `}
        fragmentShader={`
          varying vec3 vColor;
          varying float vAlpha;
          
          void main() {
            // Circular particle
            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);
            if (dist > 0.5) discard;
            
            // Soft edge
            float alpha = (1.0 - dist * 2.0) * vAlpha;
            
            // Glow center
            float glow = 1.0 - dist * 1.5;
            glow = pow(max(glow, 0.0), 2.0);
            
            gl_FragColor = vec4(vColor + glow * 0.3, alpha * 0.8);
          }
        `}
        uniforms={uniforms}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ============================================
// MAIN DOUBLE HELIX
// ============================================

function DoubleHelix() {
  const groupRef = useRef<THREE.Group>(null);
  const { viewport, mouse } = useThree();

  const strand1Color = useMemo(() => new THREE.Color("#a78bfa"), []);
  const strand1Secondary = useMemo(() => new THREE.Color("#c4b5fd"), []);
  const strand2Color = useMemo(() => new THREE.Color("#22d3ee"), []);
  const strand2Secondary = useMemo(() => new THREE.Color("#67e8f9"), []);

  // Smooth mouse parallax
  const targetRotation = useRef({ x: 0, y: 0 });
  const currentRotation = useRef({ x: 0, y: 0 });

  useFrame((state) => {
    if (!groupRef.current) return;

    // Floating animation
    const floatY = Math.sin(state.clock.elapsedTime * 0.4) * 0.15;

    // Mouse parallax with smooth interpolation
    targetRotation.current.x = mouse.y * 0.15;
    targetRotation.current.y = mouse.x * 0.15;

    currentRotation.current.x +=
      (targetRotation.current.x - currentRotation.current.x) * 0.05;
    currentRotation.current.y +=
      (targetRotation.current.y - currentRotation.current.y) * 0.05;

    groupRef.current.position.y = floatY;
    groupRef.current.rotation.x = currentRotation.current.x;
    groupRef.current.rotation.z = -currentRotation.current.y;
  });

  return (
    <group ref={groupRef}>
      <HelixStrand
        color={strand1Color}
        colorSecondary={strand1Secondary}
        rotationOffset={0}
        radius={1}
        turns={3}
        height={10}
      />
      <HelixStrand
        color={strand2Color}
        colorSecondary={strand2Secondary}
        rotationOffset={Math.PI}
        radius={1}
        turns={3}
        height={10}
      />
      <CoreGlow />
      <EnergyField />
    </group>
  );
}

// ============================================
// POST-PROCESSING EFFECTS (Custom implementation)
// ============================================

// Bloom effect simulated through additive blending in shaders
// For true bloom, install @react-three/postprocessing
// This implementation achieves similar visual quality through:
// 1. Additive blending on all glow elements
// 2. Multiple overlapping glow layers
// 3. High-intensity shader outputs

// ============================================
// SCENE CAMERA
// ============================================

function SceneCamera() {
  const { camera, viewport } = useThree();

  useEffect(() => {
    // Adjust camera based on viewport
    const targetZ = viewport.width < 8 ? 8 : 6;
    camera.position.z = targetZ;
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = viewport.width < 8 ? 50 : 45;
      camera.updateProjectionMatrix();
    }
  }, [camera, viewport]);

  return null;
}

// ============================================
// MAIN EXPORT COMPONENT
// ============================================

interface DNAHelixBackgroundProps {
  className?: string;
}

export function DNAHelixBackground({ className = "" }: DNAHelixBackgroundProps) {
  const [isVisible, setIsVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pause rendering when not visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Check for WebGL support
  const [hasWebGL, setHasWebGL] = useState(true);
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      setHasWebGL(!!gl);
    } catch {
      setHasWebGL(false);
    }
  }, []);

  if (!hasWebGL) {
    return (
      <div
        className={`absolute inset-0 bg-gradient-to-br from-violet-900/20 via-transparent to-cyan-900/20 ${className}`}
      />
    );
  }

  return (
    <div ref={containerRef} className={`absolute inset-0 ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
          stencil: false,
          depth: false,
        }}
        dpr={[1, Math.min(2, window.devicePixelRatio)]}
        frameloop={isVisible ? "always" : "never"}
      >
        <SceneCamera />
        <ambientLight intensity={0.2} />
        <pointLight position={[5, 5, 5]} intensity={0.3} />
        <pointLight position={[-5, -5, 5]} intensity={0.2} color="#8b5cf6" />

        <DoubleHelix />
      </Canvas>
    </div>
  );
}

// Utility function
function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export default DNAHelixBackground;
