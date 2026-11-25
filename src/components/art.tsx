/**
 * Decorative SVG artwork for the marketing pages. Everything is generated from fixed seeds, so it is the same on every
 * render, and none of it represents data. All of it is aria-hidden.
 */

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const GREYS = [
  ['#e7e5e1', '#c9c7c2', '#a9a7a2'],
  ['#dcdad5', '#bdbbb6', '#9a9893'],
  ['#d2d0cb', '#b1afaa', '#8c8a85'],
]
const ORANGES = ['#ff8a4c', '#ff6a2b', '#d9480f']
const ORANGE_CUBES = new Set(['1,1,1', '2,0,1', '1,2,2', '0,2,0', '2,2,1'])
const MISSING = new Set(['0,0,2', '2,0,2', '2,1,2', '0,1,2', '2,2,2'])

function Cube({ cx, cy, s, tone, orange }: { cx: number; cy: number; s: number; tone: number; orange: boolean }) {
  const w = s * 0.866
  const [top, left, right] = orange ? [ORANGES[0], ORANGES[1], ORANGES[2]] : GREYS[tone % GREYS.length]
  return (
    <g>
      <polygon points={`${cx},${cy - s} ${cx + w},${cy - s / 2} ${cx},${cy} ${cx - w},${cy - s / 2}`} fill={top} />
      <polygon points={`${cx - w},${cy - s / 2} ${cx},${cy} ${cx},${cy + s} ${cx - w},${cy + s / 2}`} fill={left} />
      <polygon points={`${cx},${cy} ${cx + w},${cy - s / 2} ${cx + w},${cy + s / 2} ${cx},${cy + s}`} fill={right} />
    </g>
  )
}

/** Isometric block cluster on the left, a glowing node network on the right, joined by flowing lines. */
export function HeroArt({ className }: { className?: string }) {
  const s = 42
  const cubes: { k: string; cx: number; cy: number; tone: number; orange: boolean; order: number }[] = []
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) {
        const key = `${i},${j},${k}`
        if (MISSING.has(key)) continue
        cubes.push({
          k: key,
          cx: 165 + (i - j) * s * 0.866,
          cy: 225 + (i + j) * s * 0.5 - k * s,
          tone: (i * 2 + j + k) % 3,
          orange: ORANGE_CUBES.has(key),
          order: i + j + k * 0.01,
        })
      }
  cubes.sort((a, b) => a.order - b.order)

  const rand = rng(7)
  const nodes = Array.from({ length: 46 }, () => {
    const a = rand() * Math.PI * 2
    const r = Math.sqrt(rand()) * 128
    return { x: 520 + Math.cos(a) * r * 1.05, y: 175 + Math.sin(a) * r * 0.86, r: 1.8 + rand() * 4.2 }
  })
  const edges: [number, number][] = []
  nodes.forEach((n, i) => {
    nodes
      .map((m, j) => ({ j, d: (m.x - n.x) ** 2 + (m.y - n.y) ** 2 }))
      .filter((m) => m.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, 2)
      .forEach((m) => edges.push([i, m.j]))
  })

  return (
    <svg viewBox="0 0 660 400" className={className} role="presentation" aria-hidden>
      <defs>
        <radialGradient id="hero-glow" cx="76%" cy="44%" r="30%">
          <stop offset="0%" stopColor="#ff7a3d" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ff7a3d" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hero-node" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffb487" />
          <stop offset="100%" stopColor="#f0540f" />
        </radialGradient>
        <radialGradient id="hero-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0e0e0e" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#0e0e0e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="660" height="400" fill="url(#hero-glow)" className="glow" />
      <ellipse cx="165" cy="340" rx="130" ry="24" fill="url(#hero-shadow)" />
      <g className="drift">
        {cubes.map((c) => (
          <Cube key={c.k} cx={c.cx} cy={c.cy} s={s} tone={c.tone} orange={c.orange} />
        ))}
      </g>
      {Array.from({ length: 9 }, (_, i) => {
        const y = 150 + i * 9
        return <path key={i} d={`M250 ${y} C 330 ${y - 36 + i * 10}, 380 ${y + 28 - i * 8}, ${430 + i * 6} ${150 + i * 8}`} fill="none" stroke="#ff6a2b" strokeOpacity={0.55 - i * 0.04} strokeWidth="0.9" />
      })}
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke="#ff6a2b" strokeOpacity="0.55" strokeWidth="0.9" />
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={n.r} fill="url(#hero-node)" />
      ))}
      {[
        { x: 360, label: 'COMMERCE' },
        { x: 470, label: 'AGENT' },
        { x: 585, label: 'PAYMENTS' },
      ].map((t, i) => (
        <g key={t.label}>
          <text x={t.x} y="16" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="1.2" fill="#2b2a27">
            {t.label}
          </text>
          <line x1={t.x} y1="26" x2={t.x} y2={62 + i * 16} stroke="#0e0e0e" strokeWidth="1" />
          <circle cx={t.x} cy={62 + i * 16} r="2.5" fill="#0e0e0e" />
        </g>
      ))}
    </svg>
  )
}

/** A halftone sphere, lit from the upper left. */
export function SphereArt({ className }: { className?: string }) {
  const dots: { x: number; y: number; r: number }[] = []
  const step = 9
  for (let y = -100; y <= 100; y += step) {
    for (let x = -100; x <= 100; x += step) {
      const nx = x / 96
      const ny = y / 96
      const d = nx * nx + ny * ny
      if (d > 1) continue
      const nz = Math.sqrt(1 - d)
      const light = Math.max(0, -nx * 0.45 - ny * 0.5 + nz * 0.72)
      dots.push({ x, y, r: 1 + 2.8 * (1 - light) })
    }
  }
  return (
    <svg viewBox="-110 -110 220 220" className={className} role="presentation" aria-hidden>
      <defs>
        <radialGradient id="sphere-bg" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffb089" />
          <stop offset="60%" stopColor="#f2631f" />
          <stop offset="100%" stopColor="#b93a08" />
        </radialGradient>
      </defs>
      <circle r="98" fill="url(#sphere-bg)" />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#3a1100" fillOpacity="0.85" />
      ))}
    </svg>
  )
}

/** Orange dunes with a thin network and a glowing road, used behind the footer. */
export function HillsArt({ className }: { className?: string }) {
  const rand = rng(21)
  const pts = Array.from({ length: 34 }, () => ({ x: 40 + rand() * 1360, y: 150 + rand() * 190 }))
  const links: [number, number][] = []
  pts.forEach((p, i) => {
    pts
      .map((q, j) => ({ j, d: (q.x - p.x) ** 2 + (q.y - p.y) ** 2 }))
      .filter((q) => q.j > i && q.d < 150 ** 2)
      .slice(0, 2)
      .forEach((q) => links.push([i, q.j]))
  })
  return (
    <svg viewBox="0 0 1440 360" preserveAspectRatio="xMidYMax slice" className={className} role="presentation" aria-hidden>
      <defs>
        <linearGradient id="hill-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffb98f" />
          <stop offset="100%" stopColor="#ff7a3d" />
        </linearGradient>
        <linearGradient id="hill-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff7433" />
          <stop offset="100%" stopColor="#e24b0e" />
        </linearGradient>
        <linearGradient id="hill-c" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8530f" />
          <stop offset="100%" stopColor="#a63206" />
        </linearGradient>
        <filter id="road-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <path d="M0 190 C 160 130 300 150 430 185 S 700 210 860 165 S 1180 120 1440 175 V360 H0 Z" fill="url(#hill-a)" />
      <path d="M0 250 C 200 190 330 230 520 245 S 860 190 1060 215 S 1330 205 1440 235 V360 H0 Z" fill="url(#hill-b)" />
      <path d="M0 310 C 220 250 420 300 640 300 S 1020 255 1210 285 S 1380 280 1440 300 V360 H0 Z" fill="url(#hill-c)" />
      {links.map(([a, b], i) => (
        <line key={i} x1={pts[a].x} y1={pts[a].y} x2={pts[b].x} y2={pts[b].y} stroke="#fff" strokeOpacity="0.35" strokeWidth="0.8" />
      ))}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.4 + (i % 3) * 0.5} fill="#fff" fillOpacity="0.8" />
      ))}
      <circle cx="905" cy="150" r="13" fill="#ff8a4c" />
      <path d="M690 360 C 700 320 520 300 640 270 S 930 250 800 215 S 880 178 905 160" fill="none" stroke="#ffd2b0" strokeWidth="14" strokeLinecap="round" filter="url(#road-glow)" opacity="0.9" />
      <path d="M690 360 C 700 320 520 300 640 270 S 930 250 800 215 S 880 178 905 160" fill="none" stroke="#fff4ea" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
