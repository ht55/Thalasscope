// thinking-visualizer/src/app/page.tsx

'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import OceanBackground from '@/components/OceanBackground'
import SeahorseSVG from '@/components/SeahorseSVG'
import PuffyfishSVG from '@/components/PuffyfishSVG'

export default function HomePage() {
  const [showModal, setShowModal] = useState(false)
  const [apiKey, setApiKey]       = useState('')
  const [saved, setSaved]         = useState(false)
  const router = useRouter()
  const [modalStep, setModalStep] = useState(1)
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('')

  const shWrapRef = useRef<HTMLDivElement>(null)
  const shFlipRef = useRef<HTMLDivElement>(null)
  const pfWrapRef = useRef<HTMLDivElement>(null)
  const pfFlipRef = useRef<HTMLDivElement>(null)

  // Physics: vx/vy per frame @60fps
  // 0.6/frame = 36vw/秒 → 画面を約2.5秒で横断 (魚らしい速さ)
  const shPhys = useRef({
    x: 15, y: 25,
    vx: 0.7, vy: 0.5,
    t: 0,
    nextBurst: 50,   // このフレームでダッシュ+方向転換
  })
  const pfPhys = useRef({
    x: 72, y: 55,
    vx: -0.6, vy: -0.45,
    t: 100,
    nextBurst: 80,
  })

  useEffect(() => {
    let animId: number

    // 速度ベクトルをangle+speedで再設定 (方向転換+加速)
    const burst = (
      fish: { vx: number; vy: number; nextBurst: number; t: number },
      minSpeed: number,
      maxSpeed: number,
      maxTurn: number,   // ラジアン: 現在の進行方向からどれだけ曲がるか
      minInterval: number,
      maxInterval: number,
    ) => {
      const currentAngle = Math.atan2(fish.vy, fish.vx)
      const newAngle = currentAngle + (Math.random() - 0.5) * maxTurn * 2
      const speed = minSpeed + Math.random() * (maxSpeed - minSpeed)
      fish.vx = Math.cos(newAngle) * speed
      fish.vy = Math.sin(newAngle) * speed
      fish.nextBurst = fish.t + minInterval + Math.floor(Math.random() * (maxInterval - minInterval))
    }

    const tick = () => {
      // ── Seahorse ──────────────────────────────────────
      const sh = shPhys.current
      sh.t += 1

      // ダッシュ＋方向転換 (40〜120フレーム≒0.7〜2秒ごと)
      if (sh.t >= sh.nextBurst) {
        burst(sh, 0.5, 1.4, Math.PI * 0.5, 40, 120)
      }

      sh.x += sh.vx
      sh.y += sh.vy

      // 左右の端: 反転
      if (sh.x <= 0)  { sh.x = 0;  sh.vx =  Math.abs(sh.vx) }
      if (sh.x >= 88) { sh.x = 88; sh.vx = -Math.abs(sh.vx) }
      // 上下の端: 跳ね返り
      if (sh.y <= 1)  { sh.y = 1;  sh.vy =  Math.abs(sh.vy) }
      if (sh.y >= 82) { sh.y = 82; sh.vy = -Math.abs(sh.vy) }

      const speed    = Math.sqrt(sh.vx * sh.vx + sh.vy * sh.vy)
      const shRot    = Math.sin(sh.t * 0.12) * (5 + speed * 3)   // 速いほど大きく揺れる
      const shScale  = sh.vx > 0 ? -1 : 1  // seahorse SVGは左向きデフォルト

      if (shWrapRef.current)
        shWrapRef.current.style.transform =
          `translate(${sh.x}vw, ${sh.y}vh) rotate(${shRot}deg)`
      if (shFlipRef.current)
        shFlipRef.current.style.transform = `scaleX(${shScale})`

      // ── Pufferfish ────────────────────────────────────
      const pf = pfPhys.current
      pf.t += 1

      if (pf.t >= pf.nextBurst) {
        burst(pf, 0.45, 1.2, Math.PI * 0.45, 50, 130)
      }

      pf.x += pf.vx
      pf.y += pf.vy

      if (pf.x <= 0)  { pf.x = 0;  pf.vx =  Math.abs(pf.vx) }
      if (pf.x >= 88) { pf.x = 88; pf.vx = -Math.abs(pf.vx) }
      if (pf.y <= 1)  { pf.y = 1;  pf.vy =  Math.abs(pf.vy) }
      if (pf.y >= 82) { pf.y = 82; pf.vy = -Math.abs(pf.vy) }

      const pfSpeed  = Math.sqrt(pf.vx * pf.vx + pf.vy * pf.vy)
      const pfRot    = Math.sin(pf.t * 0.1) * (4 + pfSpeed * 2.5)
      const pfScale  = pf.vx > 0 ? 1 : -1

      if (pfWrapRef.current)
        pfWrapRef.current.style.transform =
          `translate(${pf.x}vw, ${pf.y}vh) rotate(${pfRot}deg)`
      if (pfFlipRef.current)
        pfFlipRef.current.style.transform = `scaleX(${pfScale})`

      animId = requestAnimationFrame(tick)
    }

    animId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animId)
  }, [])

  const handleDiveIn = () => setShowModal(true)

  const handleSaveApiKey = () => {
    if (!apiKey.trim()) return
    sessionStorage.setItem('anthropic_api_key', apiKey.trim())
    setModalStep(2)  // Step 2へズームイン
  }

  const handleSaveSupabase = () => {
    sessionStorage.setItem('supabase_url', supabaseUrl.trim())
    sessionStorage.setItem('supabase_anon_key', supabaseAnonKey.trim())
    router.push('/run')
  }

  const handleSkipSupabase = () => {
    router.push('/run')
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      {/* Ocean background */}
      <OceanBackground/>

      {/* Seahorse: 外側=位置+回転 / 内側=左右フリップのみ */}
      <div ref={shWrapRef} style={{ position: 'absolute', width: '200px', zIndex: 2, top: 0, left: 0 }}>
        <div ref={shFlipRef}>
          <SeahorseSVG />
        </div>
      </div>
 
      {/* Pufferfish: 外側=位置+回転 / 内側=左右フリップのみ */}
      <div ref={pfWrapRef} style={{ position: 'absolute', width: '200px', zIndex: 2, top: 0, left: 0 }}>
        <div ref={pfFlipRef}>
          <PuffyfishSVG />
        </div>
      </div>

      {/* Title + button */}
      <div style={{
        position: 'absolute',
        inset: 0,
        zIndex: 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: '5vh',
      }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontFamily: 'Sylvar, serif',
            fontSize: 'clamp(58px, 12vw, 150px)',
            color: '#000',
            WebkitTextStroke: '3.5px black',
            lineHeight: 1,
            margin: 0,
            transform: 'scaleY(0.78)',
            transformOrigin: 'top center',
            display: 'inline-block',
          }}>
            <span style={{ fontSize: 'clamp(220px, 25vw, 600px)', letterSpacing: '-0.15em', }}>T</span>
            halasscope
          </h1>
          <p style={{
            fontFamily: 'Sylvar, serif',
            fontSize: 'clamp(12px, 2vw, 20px)',
            color: '#000',
            letterSpacing: '0.12em',
            margin: '-140px 0 2px',
            textShadow: "0 4px 10px rgba(135, 135, 135,0.75)",
          }}>
            Watch two AI minds think — diverge
          </p>
          <button
            onClick={handleDiveIn}
            style={{
              fontFamily: 'Sylvar, serif',
              fontSize: '18px',
              padding: '8px 20px',
              borderRadius: '999px',
              border: '4px solid #000',
              boxShadow: "0 6px 13px rgba(0,0,0,1)",
              background: "radial-gradient(circle at center, #787878 0%, #000000 100%)",
              backdropFilter: 'blur(15px)',
              color: '#FFD000',
              cursor: 'pointer',
              letterSpacing: '0.1em',
              transition: 'transform 0.15s, background 0.15s',
              textShadow: "0 4px 10px rgba(0,0,0,1)",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.15)')}
          >
            Dive In!
          </button>

          {/* Copyright */}
          <p style={{
            fontFamily: 'sans-serif',
            fontSize: '11px',
            fontWeight: '500px',
            color: 'rgba(0,0,0,0.5)',
            marginTop: '12px',
            letterSpacing: '0.05em',
          }}>
            © 2026{' '}
            <a
              href="https://ht55.dev"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'rgba(0,0,0,0.5)',
                textDecoration: 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(0,0,0,0.8)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(0,0,0,0.5)'}
            >
              ht55.dev
            </a>
          </p>

        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          paddingTop: '8vh',
          willChange: 'transform',
          transform: 'translateZ(0)',
        }}>
          <div
            onClick={() => { setShowModal(false); setModalStep(1) }}
            style={{ position: 'absolute', inset: 0 }}
          />

          {/* Step 1 — Anthropic API Key */}
          {modalStep === 1 && (
            <div style={{
              position: 'relative',
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(20px)',
              borderRadius: '50%',
              border: '15px solid rgba(0,0,0,0.9)',
              width: '400px',
              height: '400px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              padding: '50px',
              animation: 'scopeIn 0.3s ease-out',
              boxShadow: '0 3px 7px rgba(0,0,0,0.5)',
            }}>
              <button
                onClick={() => { setShowModal(false); setModalStep(1) }}
                style={{
                  position: 'absolute',
                  top: 24,
                  right: 175,
                  border: 'none',
                  background: 'transparent',
                  color: '#636363',
                  fontSize: 15,
                  fontWeight: 'bolder',
                  cursor: 'pointer',
                }}
              >✕</button>

              <p style={{
                fontFamily: "'Sylvar', serif",
                color: '#FFD414',
                fontSize: '25px',
                letterSpacing: '0.05em',
                textAlign: 'center',
                textShadow: '0 4px 10px rgba(0,0,0,1)',
                margin: 0,
              }}>
                Anthropic API Key
              </p>

              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveApiKey()}
                placeholder="sk-ant-..."
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  border: '3px solid rgba(0,0,0,0.8)',
                  background: 'rgba(255,255,255,0.2)',
                  color: '#000',
                  fontSize: '14px',
                  outline: 'none',
                  textAlign: 'center',
                  fontFamily: 'sans-serif',
                }}
              />

              <div style={{
                fontSize: '13px',
                color: 'rgba(194,194,194,0.99)',
                textAlign: 'center',
                letterSpacing: '0.03em',
                lineHeight: '1.6',
                textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                fontFamily: 'sans-serif',
              }}>
                Sent directly to Anthropic. Never stored or logged.
              </div>

              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                <button
                  onClick={handleSaveApiKey}
                  disabled={!apiKey.trim()}
                  style={{
                    flex: 1, padding: '6px 8px', fontSize: 14,
                    borderRadius: 6, border: '3px solid #000',
                    background: '#1F1F1F', color: '#40FFB9',
                    cursor: apiKey.trim() ? 'pointer' : 'default',
                    opacity: apiKey.trim() ? 1 : 0.5,
                    boxShadow: '0 2px 5px rgba(0,0,0,1)',
                  }}
                >Save</button>
                <button
                  onClick={() => { sessionStorage.removeItem('anthropic_api_key'); setApiKey('') }}
                  style={{
                    flex: 1, padding: '6px 8px', fontSize: 14,
                    borderRadius: 6, border: '3px solid #000',
                    background: '#1F1F1F', color: '#FF9705',
                    cursor: 'pointer',
                    boxShadow: '0 2px 5px rgba(0,0,0,1)',
                  }}
                >Erase</button>
                 <a
                  href="https://console.anthropic.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1, padding: '6px 8px', fontSize: 14,
                    borderRadius: 6, border: '3px solid #000',
                    background: '#1F1F1F', color: '#FF3D85',
                    textAlign: 'center', textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center',
                    justifyContent: 'center', cursor: 'pointer',
                    boxShadow: '0 2px 5px rgba(0,0,0,1)',
                  }}
                >Get</a>
              </div>
            </div>
          )}

          {/* Step 2 — Supabase (optional) */}
          {modalStep === 2 && (
            <div style={{
              position: 'relative',
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(10px)',
              borderRadius: '50%',
              border: '18px solid rgba(0,0,0,0.9)',
              width: '400px',
              height: '400px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '60px',
              animation: 'scopeZoom 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
              boxShadow: '0 3px 7px rgba(0,0,0,0.5)',
            }}>

              <p style={{
                fontFamily: "'Sylvar', serif",
                color: '#00FFEA',
                fontSize: '24px',
                letterSpacing: '0.05em',
                textAlign: 'center',
                textShadow: '0 4px 10px rgba(0,0,0,1)',
                margin: 0,
              }}>
                Supabase
              </p>

              <p style={{
                fontSize: '13px',
                color: 'rgba(194,194,194,0.9)',
                textAlign: 'center',
                lineHeight: 1.6,
                margin: 0,
                fontFamily: 'sans-serif',
              }}>
                Optional — save & analyze your sessions<br/>
                in your own Supabase account.
              </p>

              <input
                type="text"
                value={supabaseUrl}
                onChange={e => setSupabaseUrl(e.target.value)}
                placeholder="https://xxx.supabase.co"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '3px solid rgba(0,0,0,0.8)',
                  background: 'rgba(255,255,255,0.2)',
                  color: '#000',
                  fontSize: '13px',
                  outline: 'none',
                  textAlign: 'center',
                  fontFamily: 'sans-serif',
                }}
              />

              <input
                type="password"
                value={supabaseAnonKey}
                onChange={e => setSupabaseAnonKey(e.target.value)}
                placeholder="Supabase Anon Key"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '3px solid rgba(0,0,0,0.8)',
                  background: 'rgba(255,255,255,0.2)',
                  color: '#000',
                  fontSize: '13px',
                  outline: 'none',
                  textAlign: 'center',
                  fontFamily: 'sans-serif',
                }}
              />

              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                <button
                  onClick={handleSaveSupabase}
                  disabled={!supabaseUrl.trim() || !supabaseAnonKey.trim()}
                  style={{
                    flex: 1, padding: '6px 8px', fontSize: 13,
                    borderRadius: 6, border: '3px solid #000',
                    background: '#1F1F1F', color: '#00F3FF',
                    cursor: supabaseUrl.trim() && supabaseAnonKey.trim() ? 'pointer' : 'default',
                    opacity: supabaseUrl.trim() && supabaseAnonKey.trim() ? 1 : 0.5,
                    boxShadow: '0 2px 5px rgba(0,0,0,1)',
                  }}
                >Connect</button>
                <button
                  onClick={handleSkipSupabase}
                  style={{
                    flex: 1, padding: '6px 8px', fontSize: 13,
                    borderRadius: 6, border: '3px solid #000',
                    background: '#1F1F1F', color: '#FF9705',
                    cursor: 'pointer',
                    boxShadow: '0 2px 5px rgba(0,0,0,1)',
                  }}
                >Skip</button>
              </div>
            </div>
          )}

          <style>{`
            @keyframes scopeIn {
              from { opacity: 0; transform: scale(0.8); }
              to   { opacity: 1; transform: scale(1); }
            }
            @keyframes scopeZoom {
              from { opacity: 0; transform: scale(0.6); }
              to   { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </div>
      )}

      <style>{`
        @keyframes swimSeahorse {
          0%   { transform: translate(10vw, 20vh) rotate(-10deg) scaleX(1); }
          25%  { transform: translate(70vw, 60vh) rotate(5deg) scaleX(-1); }
          50%  { transform: translate(80vw, 30vh) rotate(-5deg) scaleX(-1); }
          75%  { transform: translate(20vw, 70vh) rotate(8deg) scaleX(1); }
          100% { transform: translate(10vw, 20vh) rotate(-10deg) scaleX(1); }
        }
        @keyframes swimPuffer {
          0%   { transform: translate(75vw, 65vh) scaleX(1); }
          25%  { transform: translate(30vw, 25vh) scaleX(1); }
          50%  { transform: translate(15vw, 55vh) scaleX(-1); }
          75%  { transform: translate(60vw, 15vh) scaleX(-1); }
          100% { transform: translate(75vw, 65vh) scaleX(1); }
        }
      `}</style>
    </div>
  )
}
