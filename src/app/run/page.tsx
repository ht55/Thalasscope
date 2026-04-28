// thinking-visualizer/src/app/run/page.tsx

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import OceanBackground from '@/components/OceanBackground'
import SeahorseSVG from '@/components/SeahorseSVG'
import PuffyfishSVG from '@/components/PuffyfishSVG'

interface Block {
  id: string
  label: string
  text: string
  type: 'search' | 'thinking' | 'response'
}

interface ModelState {
  blocks: Block[]
  tokens: number
  timeMs: number
  wordCount: number
  done: boolean
}

const EMPTY_STATE: ModelState = {
  blocks: [],
  tokens: 0,
  timeMs: 0,
  wordCount: 0,
  done: false,
}

export default function RunPage() {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [model37, setModel37] = useState<ModelState>(EMPTY_STATE)
  const [model46, setModel46] = useState<ModelState>(EMPTY_STATE)
  const [hasSupabase, setHasSupabase] = useState(false)
  const [savedAcc, setSavedAcc] = useState<{
    haiku: { thinking: string; response: string; inputTokens: number; outputTokens: number }
    sonnet: { thinking: string; response: string; inputTokens: number; outputTokens: number }
  } | null>(null)
  const [history, setHistory] = useState<Array<{
    id: string
    prompt: string
    timestamp: string
    model37: ModelState
    model46: ModelState
  }>>([])

  useEffect(() => {
    const key = sessionStorage.getItem('anthropic_api_key')
    if (!key) router.push('/')
    setHasSupabase(!!sessionStorage.getItem('supabase_url'))
  }, [router])

  const handleCompare = async () => {
    if (!prompt.trim()) return
    // Test Mock codeはここに入れて試す
    // 以下は既存の本番コード
    const apiKey = sessionStorage.getItem('anthropic_api_key')
    if (!apiKey) { router.push('/'); return }

    setRunning(true)
    setModel37(EMPTY_STATE)
    setModel46(EMPTY_STATE)

    const startTime = Date.now()

    const accumulated = {
      'claude-haiku-4-5': {
        thinking: '',
        response: '',
        inputTokens: 0,
        outputTokens: 0,
        
      },
      'claude-sonnet-4-6': {
        thinking: '',
        response: '',
        inputTokens: 0,
        outputTokens: 0,
        
      },
    }

    const thinkingBuffer: Record<string, string> = {
      'claude-haiku-4-5': '',
      'claude-sonnet-4-6': '',
    }

    const addBlock = (model: string, block: Block) => {
      const setter = model === 'claude-haiku-4-5' ? setModel37 : setModel46
      setter(prev => ({
        ...prev,
        blocks: [...prev.blocks, block],
      }))
    }

    const flushThinkingBuffer = (model: string) => {
      const text = thinkingBuffer[model].trim()
      if (!text) return
      const labelMatch = text.match(/^\[(.+?)\]/)
      const label = labelMatch ? labelMatch[1] : 'thinking'
      const body = labelMatch ? text.replace(/^\[.+?\]\n?/, '') : text
      addBlock(model, {
        id: `think-${Date.now()}-${Math.random()}`,
        label,
        text: body.trim(),
        type: 'thinking',
      })
      thinkingBuffer[model] = ''
    }

    try {
      const res = await fetch('/api/think', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, apiKey }),
      })

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break

          let parsed: { model: string; event: unknown; error?: string }
          try { parsed = JSON.parse(raw) } catch { continue }

          if (parsed.error) {
            console.error('Stream error:', parsed.error)
            continue
          }

          const { model, event } = parsed as {
            model: string
            event: {
              type: string
              delta?: {
                type: string
                thinking?: string
                text?: string
              }
              usage?: { output_tokens?: number }
              message?: {
                usage?: { input_tokens?: number; output_tokens?: number }
              }
            }
          }

          const acc = accumulated[model as keyof typeof accumulated]
          if (!acc) continue

          // Input tokens — message_start
          if (event.type === 'message_start') {
            if (event.message?.usage?.input_tokens) {
              acc.inputTokens = event.message.usage.input_tokens
            }
          }

          // Thinking delta
          if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'thinking_delta' && event.delta.thinking) {
              thinkingBuffer[model] += event.delta.thinking
              acc.thinking += event.delta.thinking

              if (thinkingBuffer[model].includes('\n\n')) {
                const parts = thinkingBuffer[model].split('\n\n')
                thinkingBuffer[model] = parts.pop() ?? ''
                for (const part of parts) {
                  if (!part.trim()) continue
                  const labelMatch = part.match(/^\[(.+?)\]/)
                  const label = labelMatch ? labelMatch[1] : 'thinking'
                  const body = labelMatch ? part.replace(/^\[.+?\]\n?/, '') : part
                  if (body.trim()) {
                    addBlock(model, {
                      id: `think-${Date.now()}-${Math.random()}`,
                      label,
                      text: body.trim(),
                      type: 'thinking',
                    })
                  }
                }
              }
            }

            // Response text delta
            if (event.delta?.type === 'text_delta' && event.delta.text) {
              acc.response += event.delta.text
            }
          }

          // Output tokens — message_delta
          if (event.type === 'message_delta') {
            if (event.usage?.output_tokens) {
              acc.outputTokens = event.usage.output_tokens
            }
          }

          // Message done
          if (event.type === 'message_stop') {
            flushThinkingBuffer(model)

            if (acc.response.trim()) {
              addBlock(model, {
                id: `response-${Date.now()}`,
                label: 'response',
                text: acc.response.trim(),
                type: 'response',
              })
            }

            const setter = model === 'claude-haiku-4-5' ? setModel37 : setModel46
            setter(prev => ({
              ...prev,
              done: true,
              timeMs: Date.now() - startTime,
              tokens: acc.inputTokens + acc.outputTokens,
              wordCount: acc.thinking.split(' ').length + acc.response.split(' ').length,
            }))
          }
        }
      }
    } catch (err) {
      console.error('Compare error:', err)

    } finally {
        setRunning(false)
        setSavedAcc({
          haiku: {
            thinking: accumulated['claude-haiku-4-5'].thinking,
            response: accumulated['claude-haiku-4-5'].response,
            inputTokens: accumulated['claude-haiku-4-5'].inputTokens,
            outputTokens: accumulated['claude-haiku-4-5'].outputTokens,
            
          },
          sonnet: {
            thinking: accumulated['claude-sonnet-4-6'].thinking,
            response: accumulated['claude-sonnet-4-6'].response,
            inputTokens: accumulated['claude-sonnet-4-6'].inputTokens,
            outputTokens: accumulated['claude-sonnet-4-6'].outputTokens,
            
          },
        })
        setHistory(prev => [{
          id: Date.now().toString(),
          prompt,
          timestamp: new Date().toLocaleTimeString(),
          model37: { blocks: [], tokens: 0, timeMs: 0, wordCount: 0, done: true },
          model46: { blocks: [], tokens: 0, timeMs: 0, wordCount: 0, done: true },
        }, ...prev])
      }
    }

  const handleNewPrompt = () => {
    setPrompt('')
    setModel37(EMPTY_STATE)
    setModel46(EMPTY_STATE)
    setRunning(false)
  }

  return (
    <div style={{ position: 'relative', width: '100vw', minHeight: '100vh', overflow: 'hidden' }}>
      <OceanBackground />

      <div style={{
        position: 'relative',
        zIndex: 2,
        display: 'grid',
        gridTemplateColumns: '1fr 220px 1fr',
        gap: '12px',
        padding: '16px',
        minHeight: '100vh',
      }}>

        {/* Left — Haiku 4.5 */}
        <div style={{
          background: 'rgba(100, 80, 200, 0.25)',
          backdropFilter: 'blur(16px)',
          borderRadius: '20px',
          border: '2px solid rgba(180, 160, 255, 0.4)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          minHeight: '80vh',
          boxShadow: '0 4px 10px rgba(0,0,0,1)',
        }}>

        <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <h2 style={{
              fontFamily: "'Sylvar', serif",
              fontSize: '32px',
              color: '#fff',
              textShadow: '0 4px 10px rgba(0,0,0,1)',
              margin: 0,
            }}>Haiku 4.5</h2>

            <div style={{ 
                position: 'absolute', 
                left: '66%', 
                top: '12px' 
            }}>

            {running && !model37.done && (
              <span style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#FFDD00',
                textShadow: '0 0 4px #7F77DD',
                animation: 'thinkingPulse 1.4s ease-in-out infinite',
                letterSpacing: '0.04em',
                background: 'rgba(41, 41, 41, 0.75)',
                border: '1px solid rgba(127,119,221,0.35)',
                borderRadius: '4px',
                padding: '2px 6px',
                fontFamily: 'Georgia, serif',
              }}>Thinking</span>
            )}
            {model37.done && (
              <span style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#00FFF7',
                textShadow: '0 0 0px #1D9E75',
                letterSpacing: '0.06em',
                background: 'rgba(41, 41, 41, 0.75)',
                border: '0px solid rgba(29,158,117,0.35)',
                borderRadius: '4px',
                padding: '2px 6px',
                fontFamily: 'Georgia, serif',
               }}>Done!</span>
            )}
          </div>
        </div>

        {/* Blocks */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {model37.blocks.map((block, i) => (
            <ThinkingBlock key={`37-${i}`} block={block} modelColor="purple" />
            ))}
        </div>

        {/* Stats */}
        {model37.done && (
          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            flexWrap: 'wrap',
            fontSize: '15px',
            color: 'rgba(255,255,255,0.8)',
            fontFamily: 'sans-serif',
            textShadow: '0 2px 7px rgba(0,0,0,0.8)',
            }}>
            <span>tokens <strong>{model37.tokens.toLocaleString()}</strong></span>
            <span>time <strong>{(model37.timeMs / 1000).toFixed(1)}s</strong></span>
            <span>thinking <strong>{model37.wordCount}w</strong></span>
          </div>
        )}

        {/* Pufferfish */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '8px' }}>
          <div style={{
            width: '80px',
            animation: 'gentleFloat 3s ease-in-out infinite',
            filter: 'drop-shadow(0px 15px 1px rgba(0,0,0,0.4))',
            }}>
            <PuffyfishSVG />
          </div>
        </div>
        </div>

        {/* Center */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          paddingTop: '8px',
        }}>
          <h1 style={{
            fontFamily: "'Sylvar', serif",
            fontSize: '36px',
            color: '#fff',
            textShadow: '0 2px 12px rgba(0,0,0,0.9)',
            margin: 0,
          }}>VS</h1>

          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Type your prompt..."
            disabled={running}
            style={{
              width: '100%',
              flex: 1,
              minHeight: '120px',
              padding: '12px',
              borderRadius: '12px',
              border: '2px solid rgba(0,0,0,0.6)',
              background: 'rgba(20, 10, 40, 0.7)',
              backdropFilter: 'blur(10px)',
              color: '#fff',
              fontSize: '14px',
              resize: 'none',
              outline: 'none',
              fontFamily: 'sans-serif',
              boxShadow: '0 4px 10px rgba(0,0,0,1)',
            }}
          />

          <button
            onClick={handleCompare}
            disabled={running || !prompt.trim()}
            style={{
              width: '100%',
              fontFamily: "'Sylvar', serif",
              fontSize: '16px',
              padding: '10px',
              borderRadius: '999px',
              border: '3px solid #000',
              background: running ? 'rgba(0,0,0,0.3)' : '#1F1F1F',
              color: '#40FFB9',
              cursor: running || !prompt.trim() ? 'default' : 'pointer',
              opacity: running || !prompt.trim() ? 0.6 : 1,
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
              boxShadow: '0 4px 10px rgba(0,0,0,0.8)',
            }}
          >{running ? 'thinking...' : 'Compare!'}</button>

          <button
            onClick={handleNewPrompt}
            style={{
              width: '100%',
              fontFamily: "'Sylvar', serif",
              fontSize: '14px',
              padding: '8px',
              borderRadius: '999px',
              border: '3px solid #000',
              background: '#1F1F1F',
              color: '#FF9705',
              cursor: 'pointer',
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
              boxShadow: '0 4px 10px rgba(0,0,0,0.8)',
            }}
          >New Prompt</button>

          <button
            onClick={() => router.push('/')}
            style={{
              width: '100%',
              fontFamily: "'Sylvar', serif",
              fontSize: '14px',
              padding: '8px',
              borderRadius: '999px',
              border: '3px solid #000',
              background: '#1F1F1F',
              color: '#FF3D85',
              cursor: 'pointer',
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
              boxShadow: '0 4px 10px rgba(0,0,0,0.8)',
            }}
          >← Home</button>

          {/* Save to DB — Supabaseキーがある場合のみ表示 */}
          {hasSupabase && (model37.done || model46.done) && (
            <button
              onClick={() => {
                const supabaseUrl = sessionStorage.getItem('supabase_url')
                const supabaseAnonKey = sessionStorage.getItem('supabase_anon_key')

                if (!supabaseUrl || !supabaseAnonKey || !savedAcc) return

                fetch('/api/sessions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    supabaseUrl,
                    supabaseAnonKey,
                    session: {
                      prompt,
                      prompt_category: null,
                      prompt_complexity: null,
                      prompt_summary: null,
                    },
                    responses: [
                      {
                        model: 'claude-haiku-4-5',
                        thinking_text: savedAcc.haiku.thinking,
                        thinking_word_count: savedAcc.haiku.thinking.split(' ').length,
                        thinking_duration_ms: model37.timeMs,
                        response_text: savedAcc.haiku.response,
                        response_word_count: savedAcc.haiku.response.split(' ').length,
                        total_duration_ms: model37.timeMs,
                        input_tokens: savedAcc.haiku.inputTokens,
                        output_tokens: savedAcc.haiku.outputTokens,
                      },
                      {
                        model: 'claude-sonnet-4-6',
                        thinking_text: savedAcc.sonnet.thinking,
                        thinking_word_count: savedAcc.sonnet.thinking.split(' ').length,
                        thinking_duration_ms: model46.timeMs,
                        response_text: savedAcc.sonnet.response,
                        response_word_count: savedAcc.sonnet.response.split(' ').length,
                        total_duration_ms: model46.timeMs,
                        input_tokens: savedAcc.sonnet.inputTokens,
                        output_tokens: savedAcc.sonnet.outputTokens,
                      },
                    ],
                  }),
                })
                .then(() => alert('Saved to Supabase!'))
                .catch(err => console.error('Save error:', err))
              }}
              style={{
                width: '100%',
                fontFamily: "'Sylvar', serif",
                fontSize: '14px',
                padding: '8px',
                borderRadius: '999px',
                border: '3px solid #000',
                background: '#1F1F1F',
                color: '#95FF00',
                cursor: 'pointer',
                textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                boxShadow: '0 4px 10px rgba(0,0,0,0.8)',
              }}
            >
              Save to DB
            </button>
          )}

          {history.length > 0 && (
            <div style={{
              width: '100%',
              marginTop: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              textShadow: '0 2px 7px rgba(0,0,0,0.8)',
            }}>
              <p style={{
                fontFamily: "'Sylvar', serif",
                fontSize: '13px',
                color: 'rgba(255,255,255,0.6)',
                textAlign: 'center',
                margin: 0,
                letterSpacing: '0.08em',
              }}>— history —</p>

              {history.map(session => (
                <button
                  key={session.id}
                  onClick={() => {
                    setPrompt(session.prompt)
                    setModel37(session.model37)
                    setModel46(session.model46)
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '10px',
                    border: '2px solid rgba(255,255,255,0.2)',
                    background: 'rgba(0,0,0,0.4)',
                    backdropFilter: 'blur(8px)',
                    color: 'rgba(255,255,255,0.85)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    lineHeight: 1.5,
                    transition: 'background 0.15s',
                    fontFamily: 'sans-serif',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.4)'}
                >
                  <div style={{
                    fontSize: '10px',
                    color: 'rgba(255,255,255,0.4)',
                    marginBottom: '2px',
                  }}>{session.timestamp}</div>
                  <div style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>{session.prompt}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right — Sonnet 4.6 */}
        <div style={{
          background: 'rgba(20, 120, 100, 0.25)',
          backdropFilter: 'blur(16px)',
          borderRadius: '20px',
          border: '2px solid rgba(100, 220, 180, 0.4)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          minHeight: '80vh',
          boxShadow: '0 4px 10px rgba(0,0,0,1)',
        }}>

        <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <h2 style={{
              fontFamily: "'Sylvar', serif",
              fontSize: '32px',
              color: '#fff',
              textShadow: '0 4px 10px rgba(0,0,0,1)',
              margin: 0,
            }}>Sonnet 4.6</h2>

            <div style={{ 
                position: 'absolute', 
                left: '68%', 
                top: '12px' 
            }}>

            {running && !model46.done && (
              <span style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#FFDD00',
                textShadow: '0 0 4px #7F77DD',
                animation: 'thinkingPulse 1.4s ease-in-out infinite',
                letterSpacing: '0.04em',
                background: 'rgba(41, 41, 41, 0.75)',
                border: '1px solid rgba(127,119,221,0.35)',
                borderRadius: '4px',
                padding: '2px 6px',
                fontFamily: 'Georgia, serif',
              }}>Thinking</span>
            )}
            {model46.done && (
              <span style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#00FFF7',
                textShadow: '0 0 0px #1D9E75',
                letterSpacing: '0.06em',
                background: 'rgba(41, 41, 41, 0.75)',
                border: '0px solid rgba(29,158,117,0.35)',
                borderRadius: '4px',
                padding: '2px 6px',
                fontFamily: 'Georgia, serif',
               }}>Done!</span>
            )}
          </div>
        </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {model46.blocks.map((block, i) => (
              <ThinkingBlock key={`46-${i}`} block={block} modelColor="teal" />
            ))}
          </div>

          {model46.done && (
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
              flexWrap: 'wrap',
              fontSize: '15px',
              color: 'rgba(255,255,255,0.8)',
              fontFamily: 'sans-serif',
              textShadow: '0 4px 10px rgba(0,0,0,0.8)',
            }}>
              <span>tokens <strong>{model46.tokens.toLocaleString()}</strong></span>
              <span>time <strong>{(model46.timeMs / 1000).toFixed(1)}s</strong></span>
              <span>thinking <strong>{model46.wordCount}w</strong></span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <div style={{
              width: '60px',
              animation: 'gentleFloat 4s ease-in-out infinite',
              filter: 'drop-shadow(0px 15px 1px rgba(0,0,0,0.4))',
            }}>
              <SeahorseSVG />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes gentleFloat {
          0%, 100% { transform: translateY(0) rotate(-3deg); }
          50%       { transform: translateY(-6px) rotate(3deg); }
        }
        @keyframes blockPop {
          0%   { opacity: 0; transform: scale(0.85) translateY(12px); }
          70%  { transform: scale(1.03) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes thinkingPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }
      `}</style>
    </div>
  )
}

// ── ThinkingBlock ────────────────────────────────────────────────────────────
function ThinkingBlock({ block, modelColor }: { block: Block; modelColor: 'purple' | 'teal' }) {
  const colors = {
    search: {
      bg: 'rgba(80, 140, 220, 0.35)',
      border: 'rgba(120, 180, 255, 0.6)',
      label: '#90C8FF',
    },
    thinking: {
      bg: modelColor === 'purple'
        ? 'rgba(140, 100, 255, 0.3)'
        : 'rgba(255, 180, 50, 0.3)',
      border: modelColor === 'purple'
        ? 'rgba(180, 140, 255, 0.5)'
        : 'rgba(255, 200, 80, 0.5)',
      label: modelColor === 'purple' ? '#C8A8FF' : '#FFD080',
    },
    response: {
      bg: 'rgba(40, 180, 130, 0.3)',
      border: 'rgba(80, 220, 170, 0.5)',
      label: '#60EDB0',
    },
  }

  const c = colors[block.type]

  return (
    <div style={{
      background: c.bg,
      border: `1.5px solid ${c.border}`,
      borderRadius: '12px',
      padding: '10px 12px',
      backdropFilter: 'blur(8px)',
      animation: 'blockPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      boxShadow: '0 4px 10px rgba(0,0,0,1)',
    }}>
      <div style={{
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        textShadow: '0 3px 7px rgba(0,0,0,0.9)',
        color: c.label,
        marginBottom: '5px',
        fontFamily: 'sans-serif',
      }}>{block.label}</div>
      <div style={{
        fontSize: '12px',
        lineHeight: 1.6,
        color: 'rgba(255,255,255,0.9)',
        whiteSpace: 'pre-line',
        fontFamily: 'sans-serif',
      }}>{block.text}</div>
    </div>
  )
}