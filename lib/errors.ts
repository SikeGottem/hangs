// Sanitized error helpers. Never return raw e.message to clients — it leaks
// DB schema, stack traces, and internal paths. Log full detail server-side,
// return a generic message to the client.

import { NextResponse } from 'next/server'

export function serverError(e: unknown, context?: string) {
  const id = Math.random().toString(36).slice(2, 10)
  const msg = e instanceof Error ? e.message : String(e)
  const stack = e instanceof Error ? e.stack : ''
  console.error(`[hangs:${id}]${context ? ` ${context}:` : ''} ${msg}${stack ? '\n' + stack : ''}`)
  return NextResponse.json(
    { error: 'Something went wrong', id },
    { status: 500, headers: { 'x-request-id': id } },
  )
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 })
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ error: message }, { status: 404 })
}

export function tooMany(message = 'Too many requests') {
  return NextResponse.json({ error: message }, { status: 429 })
}

export function forbidden(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 })
}
