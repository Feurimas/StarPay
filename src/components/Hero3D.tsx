import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { ShieldCheck, Zap, Sparkles, Cpu } from 'lucide-react'

export function Hero3D({ className = '' }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [activeBadge, setActiveBadge] = useState(0)

  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const scene = new THREE.Scene()
    const width = container.clientWidth || 600
    const height = container.clientHeight || 450

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    camera.position.set(0, 0, 14)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      return
    }

    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    container.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 1.5))

    const light1 = new THREE.PointLight(0xff5a1a, 6, 30)
    light1.position.set(6, 6, 8)
    scene.add(light1)

    const light2 = new THREE.PointLight(0xec4899, 5, 25)
    light2.position.set(-6, -4, 6)
    scene.add(light2)

    const rootGroup = new THREE.Group()
    scene.add(rootGroup)

    // 1. Central Icosahedron
    const gemGeo = new THREE.IcosahedronGeometry(2.4, 0)
    const gemMat = new THREE.MeshStandardMaterial({
      color: 0xff5a1a,
      emissive: 0x331200,
      roughness: 0.2,
      metalness: 0.8,
    })
    const gem = new THREE.Mesh(gemGeo, gemMat)
    rootGroup.add(gem)

    const wireGeo = new THREE.IcosahedronGeometry(2.43, 1)
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xffa366,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    })
    const wireframe = new THREE.Mesh(wireGeo, wireMat)
    rootGroup.add(wireframe)

    // 2. Rings
    const ringMat1 = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8, roughness: 0.2 })
    const ringMat2 = new THREE.MeshStandardMaterial({ color: 0xff8c42, metalness: 0.9, roughness: 0.15 })
    const ringMat3 = new THREE.MeshStandardMaterial({ color: 0xf43f5e, metalness: 0.7, roughness: 0.3 })

    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.06, 16, 100), ringMat1)
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.05, 16, 100), ringMat2)
    const ring3 = new THREE.Mesh(new THREE.TorusGeometry(5.0, 0.04, 16, 100), ringMat3)

    ring1.rotation.x = Math.PI / 3
    ring2.rotation.y = Math.PI / 4
    ring3.rotation.z = Math.PI / 6

    rootGroup.add(ring1)
    rootGroup.add(ring2)
    rootGroup.add(ring3)

    // 3. Satellites
    const satellites: THREE.Mesh[] = []
    const satCount = 6
    const satColors = [0xff5a1a, 0xf59e0b, 0x10b981, 0x6366f1, 0xec4899, 0x06b6d4]

    for (let i = 0; i < satCount; i++) {
      const angle = (i / satCount) * Math.PI * 2
      const radius = 4.8 + (i % 2) * 0.8
      const geo = i % 2 === 0 ? new THREE.OctahedronGeometry(0.38) : new THREE.DodecahedronGeometry(0.34)
      const mat = new THREE.MeshStandardMaterial({
        color: satColors[i],
        emissive: satColors[i],
        emissiveIntensity: 0.4,
        metalness: 0.7,
        roughness: 0.2,
      })
      const sat = new THREE.Mesh(geo, mat)
      sat.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.6, (i % 3 - 1) * 1.5)
      satellites.push(sat)
      rootGroup.add(sat)
    }

    // 4. Particles
    const particleCount = 220
    const posArray = new Float32Array(particleCount * 3)
    for (let i = 0; i < particleCount * 3; i += 3) {
      posArray[i] = (Math.random() - 0.5) * 18
      posArray[i + 1] = (Math.random() - 0.5) * 14
      posArray[i + 2] = (Math.random() - 0.5) * 12
    }
    const particleGeo = new THREE.BufferGeometry()
    particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3))

    const particleMat = new THREE.PointsMaterial({
      size: 0.12,
      color: 0xff8a4d,
      transparent: true,
      opacity: 0.75,
    })
    const particles = new THREE.Points(particleGeo, particleMat)
    scene.add(particles)

    let mouseX = 0, mouseY = 0, targetX = 0, targetY = 0

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      targetX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      targetY = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    }

    const handlePointerLeave = () => {
      targetX = 0
      targetY = 0
    }

    container.addEventListener('pointermove', handlePointerMove)
    container.addEventListener('pointerleave', handlePointerLeave)

    const handleResize = () => {
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)

    let animationFrameId: number
    const clock = new THREE.Clock()

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate)

      const time = clock.getElapsedTime()

      mouseX += (targetX - mouseX) * 0.05
      mouseY += (targetY - mouseY) * 0.05

      gem.rotation.x += 0.006
      gem.rotation.y += 0.009
      wireframe.rotation.x = gem.rotation.x
      wireframe.rotation.y = gem.rotation.y

      ring1.rotation.x += 0.012
      ring1.rotation.y += 0.008
      ring2.rotation.y += 0.010
      ring3.rotation.z += 0.008

      satellites.forEach((sat, i) => {
        const speed = 0.5 + i * 0.15
        const angle = time * speed + (i / satCount) * Math.PI * 2
        const rad = 4.6 + (i % 2) * 0.6
        sat.position.x = Math.cos(angle) * rad
        sat.position.y = Math.sin(angle) * rad * 0.5 + Math.sin(time * 2 + i) * 0.3
        sat.position.z = Math.sin(angle * 1.5) * 1.8
        sat.rotation.x += 0.02
        sat.rotation.y += 0.03
      })

      particles.rotation.y = time * 0.03
      rootGroup.rotation.y = mouseX * 0.65
      rootGroup.rotation.x = -mouseY * 0.55
      rootGroup.position.y = Math.sin(time * 1.2) * 0.25

      renderer.render(scene, camera)
    }

    if (!reduced) {
      animate()
    } else {
      renderer.render(scene, camera)
    }

    return () => {
      cancelAnimationFrame(animationFrameId)
      container.removeEventListener('pointermove', handlePointerMove)
      container.removeEventListener('pointerleave', handlePointerLeave)
      resizeObserver.disconnect()
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }
  }, [])

  const badges = [
    { icon: ShieldCheck, title: 'ARC TESTNET', subtitle: 'Deterministic Onchain Finality', color: 'from-amber-500 to-orange-600' },
    { icon: Zap, title: 'INSTANT SETTLEMENT', subtitle: 'Direct P2P USDC to Merchant', color: 'from-orange-500 to-rose-500' },
    { icon: Cpu, title: 'AI ORCHESTRATION', subtitle: 'Automated Storefront & Operations', color: 'from-violet-500 to-fuchsia-500' },
  ]

  return (
    <div className={'relative aspect-[660/450] w-full select-none overflow-visible rounded-3xl ' + className}>
      <div className="pointer-events-none absolute -inset-4 z-0 opacity-60 blur-3xl">
        <div className="absolute left-1/4 top-1/4 h-64 w-64 rounded-full bg-gradient-to-tr from-[#ff5a1a] via-[#f59e0b] to-[#ec4899] opacity-40 mix-blend-multiply animate-pulse" />
        <div className="absolute right-1/4 bottom-1/4 h-72 w-72 rounded-full bg-gradient-to-br from-[#6366f1] via-[#8b5cf6] to-[#ff5a1a] opacity-35 blur-2xl" />
      </div>

      <div ref={mountRef} className="relative z-10 h-full w-full cursor-grab active:cursor-grabbing" />

      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/25 bg-surface/90 px-3.5 py-1.5 shadow-lg backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="font-mono text-[11px] font-semibold tracking-wider text-ink">
              3D LIVE CHAIN VISUALIZER
            </span>
          </div>

          <div className="hidden items-center gap-1.5 rounded-full border border-border/40 bg-surface/80 px-3 py-1 font-mono text-[10px] text-muted backdrop-blur-sm sm:flex">
            <Sparkles className="h-3 w-3 text-accent" />
            <span>INTERACTIVE CORE</span>
          </div>
        </div>

        <div className="pointer-events-auto grid grid-cols-1 gap-2 sm:grid-cols-3">
          {badges.map((b, idx) => {
            const Icon = b.icon
            const isSelected = activeBadge === idx
            return (
              <button
                key={b.title}
                type="button"
                onClick={() => setActiveBadge(idx)}
                className={'group flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-all duration-300 backdrop-blur-md ' +
                  (isSelected
                    ? 'border-accent bg-surface/95 shadow-[0_8px_24px_-8px_rgba(255,90,26,0.35)] scale-[1.02]'
                    : 'border-border/50 bg-surface/75 hover:border-accent/40 hover:bg-surface/90')}
              >
                <div className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr ' + b.color + ' text-white shadow-sm transition-transform group-hover:scale-110'}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[10px] font-bold uppercase tracking-wider text-ink">
                    {b.title}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {b.subtitle}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
