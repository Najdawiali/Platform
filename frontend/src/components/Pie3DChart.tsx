import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

interface PieSlice {
  label: string;
  value: number;
  color: string;
}

interface Pie3DChartProps {
  data: PieSlice[];
  width?: number;
  height?: number;
  thickness?: number;
  radius?: number;
  angle?: number;
  tilt?: number;
}

export const Pie3DChart: React.FC<Pie3DChartProps> = ({
  data,
  width = 800,
  height = 600,
  thickness = 0.3,
  radius = 2,
  angle = 0.3,
  tilt = 0.5,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(4, 4, 6);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight1.position.set(5, 5, 5);
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-5, 3, -5);
    scene.add(directionalLight2);

    // Calculate total value
    const total = data.reduce((sum, slice) => sum + slice.value, 0);

    // Create pie slices
    let currentAngle = 0;
    const slices: THREE.Mesh[] = [];
    const labels: THREE.Sprite[] = [];

    data.forEach((slice) => {
      const sliceAngle = (slice.value / total) * Math.PI * 2;

      // Create slice geometry using cylindrical segments
      const geometry = new THREE.BufferGeometry();
      const vertices: number[] = [];
      const indices: number[] = [];
      const segments = 32;

      // Calculate segment angle
      const segmentAngle = sliceAngle / segments;

      // Top and bottom centers
      const topCenter = [0, thickness / 2, 0];
      const bottomCenter = [0, -thickness / 2, 0];

      // Add center vertices
      vertices.push(...topCenter, ...bottomCenter);

      // Generate arc vertices
      for (let i = 0; i <= segments; i++) {
        const theta = currentAngle + i * segmentAngle;
        const x = radius * Math.cos(theta);
        const z = radius * Math.sin(theta);

        // Top vertex
        vertices.push(x, thickness / 2, z);
        // Bottom vertex
        vertices.push(x, -thickness / 2, z);
      }

      // Create faces
      const centerTopIndex = 0;
      const centerBottomIndex = 1;
      const baseIndex = 2;

      for (let i = 0; i < segments; i++) {
        const topCurrent = baseIndex + i * 2;
        const topNext = baseIndex + (i + 1) * 2;
        const bottomCurrent = topCurrent + 1;
        const bottomNext = topNext + 1;

        // Top face
        indices.push(centerTopIndex, topNext, topCurrent);

        // Bottom face
        indices.push(centerBottomIndex, bottomCurrent, bottomNext);

        // Side face (outer arc)
        indices.push(topCurrent, topNext, bottomNext);
        indices.push(topCurrent, bottomNext, bottomCurrent);
      }

      // Add radial side faces
      const firstTop = baseIndex;
      const firstBottom = baseIndex + 1;
      const lastTop = baseIndex + segments * 2;
      const lastBottom = lastTop + 1;

      // First radial face
      indices.push(centerTopIndex, firstTop, firstBottom);
      indices.push(centerTopIndex, firstBottom, centerBottomIndex);

      // Last radial face
      indices.push(centerTopIndex, centerBottomIndex, lastBottom);
      indices.push(centerTopIndex, lastBottom, lastTop);

      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      // Create material
      const material = new THREE.MeshPhongMaterial({
        color: slice.color,
        shininess: 30,
        flatShading: false,
      });

      // Create mesh
      const mesh = new THREE.Mesh(geometry, material);

      // Apply tilt rotation
      mesh.rotation.x = tilt;

      scene.add(mesh);
      slices.push(mesh);

      currentAngle += sliceAngle;
    });

    // Animation loop
    let rotationAngle = angle;
    const animate = () => {
      rotationAngle += 0.005;

      slices.forEach((slice) => {
        slice.rotation.y = rotationAngle;
      });

      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      slices.forEach((slice) => {
        slice.geometry.dispose();
        (slice.material as THREE.Material).dispose();
      });

      labels.forEach((label) => {
        if (label.material.map) {
          label.material.map.dispose();
        }
        label.material.dispose();
      });

      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, [data, width, height, thickness, radius, angle, tilt]);

  if (data.length === 0) {
    return (
      <div style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
        borderRadius: '12px',
        border: '2px dashed #d1d5db',
        color: '#6b7280'
      }}>
        No data to display
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: `${width}px`, height: `${height}px` }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Legend */}
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        padding: '16px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        maxHeight: '400px',
        overflowY: 'auto'
      }}>
        <div style={{ fontWeight: 600, marginBottom: '12px', color: '#111827', fontSize: '14px' }}>
          Distribution
        </div>
        {data.map((slice, idx) => {
          const total = data.reduce((sum, s) => sum + s.value, 0);
          const percentage = ((slice.value / total) * 100).toFixed(1);

          return (
            <div key={idx} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
              fontSize: '13px'
            }}>
              <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '2px',
                backgroundColor: slice.color,
                flexShrink: 0
              }} />
              <div style={{ flex: 1, color: '#374151' }}>
                {slice.label}
              </div>
              <div style={{ color: '#6b7280', fontWeight: 500 }}>
                {percentage}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};