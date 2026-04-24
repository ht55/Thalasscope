// thinking-visualizaer/src/app/api/sessions/route.ts

import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

// Save session + responses
export async function POST(req: NextRequest) {
  const { session, responses, supabaseUrl, supabaseAnonKey } = await req.json()

  // No Supabase credentials — skip saving
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  const { data: sessionData, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      prompt: session.prompt,
      prompt_category: session.prompt_category,
      prompt_complexity: session.prompt_complexity,
      prompt_summary: session.prompt_summary,
      notes: session.notes ?? null,
    })
    .select()
    .single()

  if (sessionError) {
    return new Response(JSON.stringify({ error: sessionError.message }), {
      status: 500,
    })
  }

  const { error: responsesError } = await supabase.from('responses').insert(
    responses.map((r: {
      model: string
      thinking_text: string
      thinking_word_count: number
      thinking_duration_ms: number
      response_text: string
      response_word_count: number
      total_duration_ms: number
      input_tokens: number
      output_tokens: number
    }) => ({
      session_id: sessionData.id,
      model: r.model,
      thinking_text: r.thinking_text,
      thinking_word_count: r.thinking_word_count,
      thinking_duration_ms: r.thinking_duration_ms,
      response_text: r.response_text,
      response_word_count: r.response_word_count,
      total_duration_ms: r.total_duration_ms,
      input_tokens: r.input_tokens,
      output_tokens: r.output_tokens,
    }))
  )

  if (responsesError) {
    return new Response(JSON.stringify({ error: responsesError.message }), {
      status: 500,
    })
  }

  return new Response(JSON.stringify({ session_id: sessionData.id }), {
    status: 200,
  })
}

// Get session list
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const supabaseUrl = searchParams.get('supabaseUrl')
  const supabaseAnonKey = searchParams.get('supabaseAnonKey')

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ sessions: [] }), { status: 200 })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  const { data, error } = await supabase
    .from('sessions')
    .select(`*, responses (*)`)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    })
  }

  return new Response(JSON.stringify({ sessions: data }), { status: 200 })
}