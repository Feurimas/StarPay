import React, { useRef, useState } from 'react'

interface TiltCardProps {
  children: React.ReactNode
  className?: string
  glare?: boolean
  maxTilt?: number
}

export function TiltCard({ children, className = '', glare = true, maxTilt = 10 }: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [rotateX, setRotateX] = useState(0)
  const [rotateY, setRotateY] = useState(0)
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50, opacity: 0 })

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    const rotX = ((y - centerY) / centerY) * -maxTilt
    const rotY = ((x - centerX) / centerX) * maxTilt

    setRotateX(rotX)
    setRotateY(rotY)

    if (glare) {
      setGlarePos({
        x: (x / rect.width) * 100,
        y: (y / rect.height) * 100,
        opacity: 0.22,
      })
    }
  }

  const handleMouseLeave = () => {
    setRotateX(0)
    setRotateY(0)
    setGlarePos((prev) => ({ ...prev, opacity: 0 }))
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateZ(0)`,
        transition: rotateX === 0 && rotateY === 0 ? 'all 0.5s cubic-bezier(0.23, 1, 0.32, 1)' : 'transform 0.1s ease-out',
        transformStyle: 'preserve-3d',
      }}
      className={`relative overflow-hidden ${className}`}
    >
      {glare && (
        <div
          className="pointer-events-none absolute -inset-px z-10 rounded-[inherit] transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle 320px at ${glarePos.x}% ${glarePos.y}%, rgba(255, 120, 50, ${glarePos.opacity}), rgba(255, 255, 255, ${glarePos.opacity * 0.8}), transparent 80%)`,
          }}
        />
      )}
      <div style={{ transform: 'translateZ(18px)', transformStyle: 'preserve-3d' }}>
        {children}
      </div>
    </div>
  )
}
