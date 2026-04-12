import { NextResponse } from 'next/server'
import { synthesise } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await synthesise(id)
    if (!result) return NextResponse.json({ error: 'No data yet' }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
