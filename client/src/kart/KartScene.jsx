import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics, RigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { useMemo, useRef } from "react";
import { localPlayer, useKartStore } from "./kartStore";

const ARENA_RADIUS = 42;

export default function KartScene({ menuMode = false }) {
  return (
    <Canvas shadows camera={{ fov: 58, position: [0, 15, 24], near: 0.1, far: 160 }} gl={{ antialias: true, powerPreference: "high-performance" }}>
      <color attach="background" args={["#67d9ff"]} />
      <fog attach="fog" args={["#67d9ff", 56, 135]} />
      <ambientLight intensity={0.75} />
      <directionalLight castShadow position={[18, 26, 14]} intensity={2.3} shadow-mapSize={[2048, 2048]} />
      <Physics gravity={[0, -18, 0]} timeStep="vary">
        <Arena />
        {menuMode ? <MenuKarts /> : <World />}
      </Physics>
    </Canvas>
  );
}

function World() {
  const snapshot = useKartStore((state) => state.snapshot);
  const playerId = useKartStore((state) => state.playerId);
  const shake = useKartStore((state) => state.shake);
  const setShake = useKartStore((state) => state.setShake);
  const me = localPlayer(snapshot, playerId);

  useFrame(() => {
    if (useKartStore.getState().shake > 0) setShake(Math.max(0, useKartStore.getState().shake - 0.045));
  });

  return (
    <>
      {(snapshot?.players ?? []).map((player) => (
        <Kart key={player.id} player={player} isLocal={player.id === playerId} />
      ))}
      {(snapshot?.pickups ?? []).map((pickup) => <Pickup key={pickup.id} pickup={pickup} />)}
      {(snapshot?.projectiles ?? []).map((projectile) => <Projectile key={projectile.id} projectile={projectile} />)}
      {(snapshot?.explosions ?? []).map((explosion) => <Explosion key={explosion.id} explosion={explosion} />)}
      {me && <FollowCamera player={me} shake={shake} />}
    </>
  );
}

function Arena() {
  return (
    <group>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh receiveShadow position={[0, -0.18, 0]} scale={[90, 0.32, 90]}>
          <boxGeometry />
          <meshStandardMaterial color="#52d273" roughness={0.82} />
        </mesh>
      </RigidBody>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <ringGeometry args={[ARENA_RADIUS - 10, ARENA_RADIUS - 1.4, 96]} />
        <meshStandardMaterial color="#354056" roughness={0.7} />
      </mesh>
      {Array.from({ length: 18 }).map((_, index) => {
        const angle = (index / 18) * Math.PI * 2;
        return (
          <RigidBody key={index} type="fixed" colliders="cuboid">
            <mesh
              position={[Math.sin(angle) * ARENA_RADIUS, 1.35, Math.cos(angle) * ARENA_RADIUS]}
              rotation={[0, angle, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[5, 3.2, 1.6]} />
              <meshStandardMaterial color={index % 2 ? "#ff6b6b" : "#f97316"} roughness={0.6} />
            </mesh>
          </RigidBody>
        );
      })}
      {[[18, 10, 0.45], [-20, -9, -0.55], [0, 24, 0], [0, -24, Math.PI]].map(([x, z, rot], index) => (
        <RigidBody key={index} type="fixed" colliders="cuboid">
          <mesh position={[x, 0.7, z]} rotation={[0, rot, -0.18]} castShadow receiveShadow>
            <boxGeometry args={[9, 1.25, 7]} />
            <meshStandardMaterial color="#ffcf3f" roughness={0.55} />
          </mesh>
        </RigidBody>
      ))}
      {[[-14, 18], [15, -16], [26, 3], [-27, -4]].map(([x, z], index) => (
        <mesh key={index} position={[x, 0.04, z]} rotation={[-Math.PI / 2, 0, index * 0.7]}>
          <circleGeometry args={[3.4, 6]} />
          <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Kart({ player, isLocal }) {
  if (!player.alive) return null;
  return (
    <group position={[player.position.x, 0.55, player.position.z]} rotation={[0, player.rotationY, 0]}>
      <mesh castShadow>
        <boxGeometry args={[2.2, 0.85, 3.1]} />
        <meshStandardMaterial color={player.color} roughness={0.48} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.62, -0.25]} castShadow>
        <boxGeometry args={[1.35, 0.75, 1.3]} />
        <meshStandardMaterial color={isLocal ? "#fef08a" : "#e0f2fe"} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.15, 1.75]} castShadow>
        <boxGeometry args={[1.15, 0.24, 0.34]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      {[-1.18, 1.18].map((x) => [-1.05, 1.05].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, -0.25, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.36, 0.36, 0.42, 12]} />
          <meshStandardMaterial color="#172033" roughness={0.7} />
        </mesh>
      )))}
    </group>
  );
}

function Pickup({ pickup }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    ref.current.rotation.y += 0.035;
    ref.current.position.y = 1.2 + Math.sin(clock.elapsedTime * 3 + pickup.position.x) * 0.22;
  });
  const ready = pickup.availableAt <= Date.now();
  return (
    <group ref={ref} position={[pickup.position.x, 1.2, pickup.position.z]} scale={ready ? 1 : 0.45}>
      <mesh castShadow>
        <boxGeometry args={[1.7, 1.7, 1.7]} />
        <meshStandardMaterial color={ready ? "#fef08a" : "#64748b"} emissive={ready ? "#facc15" : "#000"} emissiveIntensity={0.55} />
      </mesh>
    </group>
  );
}

function Projectile({ projectile }) {
  const color = projectile.type === "rocket" ? "#fb7185" : projectile.type === "mine" ? "#a78bfa" : "#fef08a";
  return (
    <mesh position={[projectile.position.x, projectile.position.y + 0.55, projectile.position.z]} castShadow>
      <sphereGeometry args={[projectile.type === "rocket" ? 0.45 : 0.22, 12, 12]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
    </mesh>
  );
}

function Explosion({ explosion }) {
  const ref = useRef();
  const born = useMemo(() => performance.now(), []);
  useFrame(() => {
    const age = Math.min(1, (performance.now() - born) / 420);
    ref.current.scale.setScalar(0.2 + explosion.radius * age);
    ref.current.material.opacity = 1 - age;
  });
  return (
    <mesh ref={ref} position={[explosion.position.x, 1.1, explosion.position.z]}>
      <sphereGeometry args={[1, 18, 18]} />
      <meshBasicMaterial color="#fb923c" transparent opacity={0.8} depthWrite={false} />
    </mesh>
  );
}

function FollowCamera({ player, shake }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3());
  useFrame(() => {
    const forward = new THREE.Vector3(Math.sin(player.rotationY), 0, Math.cos(player.rotationY));
    const pos = new THREE.Vector3(player.position.x, player.position.y, player.position.z);
    const desired = pos.clone().add(forward.clone().multiplyScalar(-13)).add(new THREE.Vector3(0, 7, 0));
    if (shake > 0) desired.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
    camera.position.lerp(desired, 0.09);
    target.current.lerp(pos.clone().add(forward.multiplyScalar(5)).add(new THREE.Vector3(0, 1.6, 0)), 0.13);
    camera.lookAt(target.current);
  });
  return null;
}

function MenuKarts() {
  const karts = useMemo(() => ["#ff477e", "#06d6a0", "#ffd166"].map((color, index) => ({
    id: `menu-${index}`,
    position: { x: Math.sin(index * 2.1) * 12, y: 0, z: Math.cos(index * 2.1) * 12 },
    rotationY: index * 2.1 + Math.PI / 2,
    color,
    alive: true,
  })), []);
  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime * 0.28;
    camera.position.set(Math.sin(t) * 24, 15, Math.cos(t) * 24);
    camera.lookAt(0, 0, 0);
  });
  return karts.map((kart, index) => (
    <group key={kart.id} rotation={[0, performance.now() * 0.00025 + index * 2.1, 0]}>
      <Kart player={kart} isLocal={index === 0} />
    </group>
  ));
}
