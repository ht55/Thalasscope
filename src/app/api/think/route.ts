// thinking-visualizer/src/app/api/think/route.ts (with mockData)

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

const SYSTEM_PROMPT = `You are a transparent reasoning model. Your goal is to make 
your thinking process fully visible to the user.

THINKING STYLE:
When thinking, break your reasoning into natural chunks.
Start each chunk with a brief label in brackets describing
what you are doing right now, in your own words.

Examples:
[Breaking down the question]
[Recalling what I know about X]
[Hmm, let me reconsider...]
[Cross-checking my sources]
[Spotting a contradiction]
[Putting it together]

Do not force fixed categories. Use whatever label feels
natural for that moment of thinking.

WEB SEARCH:
Always use web_search to find relevant sources before answering.

After each search, explicitly name every source you found and
why you chose to use or skip it. Format like this:

[Evaluating sources]
- "Source title" → using, reason why
- "Source title" → skipping, reason why

If two sources contradict each other, call it out explicitly:
[Contradiction found]
- Source A says X
- Source B says Y
- I will go with X because...`

// Budget tokens: 3000 for demo/cost saving (vs 10000 for full)
const BUDGET_TOKENS = 3000

export async function POST(req: NextRequest) {
  const { prompt, apiKey } = await req.json()

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key is required' }), {
      status: 400,
    })
  }

  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Prompt is required' }), {
      status: 400,
    })
  }

  const anthropic = new Anthropic({ apiKey })
  const encoder = new TextEncoder()

  const tools: Anthropic.Tool[] = [
    {
      type: 'web_search_20250305',
      name: 'web_search',
    } as unknown as Anthropic.Tool,
  ]

  // Cached system prompt — reused across calls within 5 min window
  const cachedSystem = [
    {
      type: 'text' as const,
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' as const },
    },
  ]

  const stream = new ReadableStream({
    async start(controller) {
      const send = (model: string, event: unknown) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ model, event })}\n\n`
          )
        )
      }

      try {
        await Promise.all([
          (async () => {
            const stream37 = anthropic.messages.stream({
              model: 'claude-haiku-4-5',
              max_tokens: 16000,
              system: cachedSystem,
              thinking: {
                type: 'enabled',
                budget_tokens: BUDGET_TOKENS,
              },
              tools,
              messages: [{ role: 'user', content: prompt }],
            })
            for await (const event of stream37) {
              send('claude-haiku-4-5', event)
            }
          })(),
          (async () => {
            const stream46 = anthropic.messages.stream({
              model: 'claude-sonnet-4-6',
              max_tokens: 16000,
              system: cachedSystem,
              thinking: {
                type: 'enabled',
                budget_tokens: BUDGET_TOKENS,
              },
              tools,
              messages: [{ role: 'user', content: prompt }],
            })
            for await (const event of stream46) {
              send('claude-sonnet-4-6', event)
            }
          })(),
        ])

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
        )
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}