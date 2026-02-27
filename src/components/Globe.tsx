import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Stars, Float, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { MoodData, Theme } from '../types';

interface GlobeProps {
    color: string;
    theme: Theme;
    moodData: Record<string, MoodData>;
    onCountryClick: (countryCode: string) => void;
}

// Helper to ensure colors are visible in both dark/light modes
const getAdaptiveColor = (color: string, theme: Theme) => {
    try {
        const c = new THREE.Color(color);
        const hsl = { h: 0, s: 0, l: 0 };
        c.getHSL(hsl);

        if (theme === 'dark') {
            // In dark mode, ensure lightness is at least 0.55 for pop
            if (hsl.l < 0.5) hsl.l = 0.55;
            if (hsl.s < 0.2) hsl.s = 0.6; // Boost saturation for dark colors
        } else {
            // In light mode, ensure it's not too pale (hard to see against light UI)
            if (hsl.l > 0.6) hsl.l = 0.45;
            if (hsl.s < 0.4) hsl.s = 0.7; // Ensure vibrancy
        }

        c.setHSL(hsl.h, hsl.s, hsl.l);
        return `#${c.getHexString()}`;
    } catch (e) {
        return color;
    }
};

// Helper to convert Lat/Long to 3D coordinates
const latLongToVector3 = (lat: number, lon: number, radius: number): [number, number, number] => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);

    return [x, y, z];
};

const Hotspot = ({ position, code, onClick, active, color, theme }: {
    position: [number, number, number],
    code: string,
    onClick: (c: string) => void,
    active: boolean,
    color: string,
    theme: Theme
}) => {
    const adaptiveColor = useMemo(() => getAdaptiveColor(color, theme), [color, theme]);

    return (
        <group position={position}>
            {/* The small sphere (Dot) */}
            <mesh onClick={(e) => { e.stopPropagation(); onClick(code); }}>
                <sphereGeometry args={[0.08, 16, 16]} />
                <meshStandardMaterial
                    color={active ? "#ffffff" : adaptiveColor}
                    emissive={adaptiveColor}
                    emissiveIntensity={2}
                    toneMapped={false}
                />
            </mesh>

            {/* The label box (Text) - Now also clickable */}
            <Html distanceFactor={10}>
                <div
                    onClick={() => onClick(code)}
                    style={{
                        background: theme === 'dark' ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)',
                        color: theme === 'dark' ? 'white' : 'black',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 900,
                        transform: 'translate(12px, -12px)',
                        cursor: 'pointer',
                        border: `2px solid ${adaptiveColor}`,
                        boxShadow: `0 0 10px ${adaptiveColor}44`,
                        whiteSpace: 'nowrap',
                        backdropFilter: 'blur(8px)',
                        transition: 'all 0.2s ease',
                        userSelect: 'none'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translate(12px, -12px) scale(1.1)';
                        e.currentTarget.style.boxShadow = `0 0 15px ${adaptiveColor}`;
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translate(12px, -12px) scale(1)';
                        e.currentTarget.style.boxShadow = `0 0 10px ${adaptiveColor}44`;
                    }}
                >
                    {code}
                </div>
            </Html>
        </group>
    );
};

const Earth = ({ color, moodData, theme, onCountryClick }: GlobeProps) => {
    const globeGroupRef = useRef<THREE.Group>(null!);

    // Load high-contrast map for perfect boundaries
    const [colorMap] = useLoader(THREE.TextureLoader, [
        'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg',
    ]);

    useFrame(() => {
        if (globeGroupRef.current) {
            globeGroupRef.current.rotation.y += 0.0015;
        }
    });

    const radius = 2.5;

    // Accurate Latitude / Longitude coordinates
    const hotspots = useMemo(() => [
        { lat: 37.5665, lon: 126.9780, code: 'KR' },   // Seoul, Korea
        { lat: 39.9042, lon: 116.4074, code: 'CN' },   // Beijing, China
        { lat: 38.9072, lon: -77.0369, code: 'US' },   // Washington D.C., USA
        { lat: 51.5074, lon: -0.1278, code: 'UK' },    // London, UK
        { lat: 60.0000, lon: 90.0000, code: 'RU' },    // Central Russia
    ].map(h => ({
        // Using +90 offset for Lon to match Three.js Sphere default orientation
        pos: latLongToVector3(h.lat, h.lon, radius + 0.05),
        code: h.code
    })), [radius]);

    return (
        <group>
            <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.2}>
                {/* Fixed Rotation Group */}
                <group ref={globeGroupRef} rotation={[0, -Math.PI / 2, 0]}>
                    <mesh>
                        <sphereGeometry args={[radius, 64, 64]} />
                        <meshStandardMaterial
                            map={colorMap}
                            roughness={0.5}
                            metalness={0.1}
                            transparent={false}
                            opacity={1}
                        />
                    </mesh>

                    {hotspots.map((h, i) => (
                        <Hotspot
                            key={i}
                            position={h.pos}
                            code={h.code}
                            onClick={onCountryClick}
                            active={false}
                            color={moodData[h.code]?.color || color}
                            theme={theme}
                        />
                    ))}
                </group>

                {/* Outer Atmosphere (Static) */}
                <mesh>
                    <sphereGeometry args={[radius + 0.05, 64, 64]} />
                    <meshStandardMaterial
                        color={color}
                        transparent
                        opacity={0.1}
                        blending={THREE.AdditiveBlending}
                        side={THREE.BackSide}
                    />
                </mesh>
            </Float>
        </group>
    );
};

export const Globe: React.FC<GlobeProps> = ({ color, moodData, theme, onCountryClick }) => {
    return (
        <div style={{ width: '100%', height: '100vh', position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
            <Canvas camera={{ position: [0, 0, 8] }} dpr={[1, 2]}>
                <ambientLight intensity={3.5} />
                <directionalLight position={[10, 5, 10]} intensity={3.0} />
                <pointLight position={[-10, -5, -10]} color={color} intensity={0.8} />
                <Stars radius={100} depth={50} count={6000} factor={4} saturation={0} fade speed={1} />
                <React.Suspense fallback={
                    <Html center>
                        <div style={{ color: 'white', whiteSpace: 'nowrap', fontFamily: 'system-ui', fontSize: '14px' }}>
                            Loading Earth...
                        </div>
                    </Html>
                }>
                    <Earth color={color} moodData={moodData} theme={theme} onCountryClick={onCountryClick} />
                </React.Suspense>
                <OrbitControls
                    enableZoom={true}
                    enablePan={false}
                    minDistance={4}
                    maxDistance={12}
                    autoRotate={false}
                />
            </Canvas>
        </div>
    );
};
