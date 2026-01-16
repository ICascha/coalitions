import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

// Vertex shader that morphs between sphere and plane
const morphVertexShader = `
  uniform float morphProgress;
  uniform float time;
  varying vec2 vUv;
  varying float vMorph;
  
  void main() {
    vUv = uv;
    vMorph = morphProgress;
    
    // Original sphere position (normalized at radius 1)
    vec3 spherePos = position;
    
    // Target flat position - map the UV to a plane
    // UV goes from 0-1, we want to map it to a plane that's roughly similar in size
    float planeWidth = 3.6;
    float planeHeight = 1.8;
    vec3 planePos = vec3(
      (uv.x - 0.5) * planeWidth,
      (uv.y - 0.5) * planeHeight,
      0.0
    );
    
    // Interpolate between sphere and plane based on morphProgress
    vec3 finalPos = mix(spherePos, planePos, morphProgress);
    
    // Add a subtle wave effect during transition
    float wave = sin(uv.x * 10.0 + time) * 0.02 * morphProgress * (1.0 - morphProgress) * 4.0;
    finalPos.z += wave;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
  }
`;

// Fragment shader
const morphFragmentShader = `
  uniform sampler2D globeTexture;
  uniform float morphProgress;
  uniform float opacity;
  varying vec2 vUv;
  varying float vMorph;
  
  void main() {
    vec4 texColor = texture2D(globeTexture, vUv);
    
    // Slightly adjust brightness during morph for visual interest
    float brightness = 1.0 + 0.1 * morphProgress;
    
    gl_FragColor = vec4(texColor.rgb * brightness, texColor.a * opacity);
  }
`;

interface GlobeMeshProps {
  morphProgress: number;
  autoRotate: boolean;
  rotationSpeed?: number;
  textureUrl: string;
  opacity?: number;
}

const GlobeMesh = ({ 
  morphProgress, 
  autoRotate, 
  rotationSpeed = 0.1, 
  textureUrl,
  opacity = 1
}: GlobeMeshProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = useTexture(textureUrl);
  
  // Configure texture
  useEffect(() => {
    if (texture) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
    }
  }, [texture]);
  
  // Create shader material with uniforms
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: morphVertexShader,
      fragmentShader: morphFragmentShader,
      uniforms: {
        globeTexture: { value: texture },
        morphProgress: { value: morphProgress },
        time: { value: 0 },
        opacity: { value: opacity },
      },
      transparent: true,
      side: THREE.FrontSide,
    });
  }, [texture]);
  
  // Update uniforms and rotation
  useFrame((state, delta) => {
    if (shaderMaterial) {
      shaderMaterial.uniforms.morphProgress.value = morphProgress;
      shaderMaterial.uniforms.time.value = state.clock.elapsedTime;
      shaderMaterial.uniforms.opacity.value = opacity;
    }
    
    if (meshRef.current && autoRotate && morphProgress < 0.5) {
      // Slow down rotation as we morph
      const effectiveSpeed = rotationSpeed * (1 - morphProgress * 2);
      meshRef.current.rotation.y += delta * effectiveSpeed;
    }
  });
  
  // Create high-resolution sphere geometry
  const geometry = useMemo(() => {
    return new THREE.SphereGeometry(1, 128, 64);
  }, []);
  
  return (
    <mesh 
      ref={meshRef} 
      geometry={geometry} 
      material={shaderMaterial}
      rotation={[0, -Math.PI / 2, 0]} // Start facing Europe
    />
  );
};

interface GlobeSceneProps {
  morphProgress: number;
  textureUrl: string;
  className?: string;
  opacity?: number;
}

const GlobeSceneInner = ({ 
  morphProgress, 
  textureUrl,
  opacity = 1 
}: Omit<GlobeSceneProps, 'className'>) => {
  const { camera } = useThree();
  
  // Adjust camera based on morph progress
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      // Zoom out slightly as we morph to flat to see the full map
      const baseFov = 45;
      const targetFov = 55;
      camera.fov = baseFov + (targetFov - baseFov) * morphProgress;
      camera.updateProjectionMatrix();
    }
  }, [morphProgress, camera]);
  
  return (
    <>
      {/* Ambient light for base illumination */}
      <ambientLight intensity={0.6} />
      
      {/* Main directional light */}
      <directionalLight 
        position={[5, 3, 5]} 
        intensity={0.8}
        color="#ffffff"
      />
      
      {/* Fill light from the back */}
      <directionalLight 
        position={[-3, -1, -3]} 
        intensity={0.3}
        color="#94a3b8"
      />
      
      {/* The morphing globe */}
      <GlobeMesh 
        morphProgress={morphProgress}
        autoRotate={true}
        rotationSpeed={0.15}
        textureUrl={textureUrl}
        opacity={opacity}
      />
    </>
  );
};

export const GlobeScene = ({ 
  morphProgress, 
  textureUrl, 
  className,
  opacity = 1 
}: GlobeSceneProps) => {
  return (
    <div className={className}>
      <Canvas
        camera={{ 
          position: [0, 0, 2.5], 
          fov: 45,
          near: 0.1,
          far: 100
        }}
        gl={{ 
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance'
        }}
        style={{ background: 'transparent' }}
      >
        <GlobeSceneInner 
          morphProgress={morphProgress} 
          textureUrl={textureUrl}
          opacity={opacity}
        />
      </Canvas>
    </div>
  );
};

export default GlobeScene;

