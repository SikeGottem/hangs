import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()
    const res = await db.execute({ sql: 'SELECT * FROM hangs WHERE id = ?', args: [id] })
    const hang = res.rows[0]
    if (!hang) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const targetDate = (hang.confirmed_date as string) || (hang.date_range_start as string)
    if (!targetDate) return NextResponse.json({ error: 'No date' }, { status: 400 })

    // Geocode location if available, otherwise default to Sydney
    let lat = -33.8688, lon = 151.2093, locationName = 'Sydney'
    const location = (hang.location as string || '').trim()

    if (location && !location.startsWith('http')) {
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`
        )
        const geo = await geoRes.json()
        if (geo.results?.length > 0) {
          lat = geo.results[0].latitude
          lon = geo.results[0].longitude
          locationName = geo.results[0].name
        }
      } catch {}
    }

    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode&timezone=auto&start_date=${targetDate}&end_date=${targetDate}`,
      { next: { revalidate: 1800 } }
    )
    if (!weatherRes.ok) return NextResponse.json({ error: 'Weather API error' }, { status: 502 })
    const data = await weatherRes.json()
    const daily = data.daily
    if (!daily?.time?.length) return NextResponse.json({ error: 'No forecast' }, { status: 404 })

    const descs: Record<number, string> = {
      0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',
      45:'Foggy',48:'Icy fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
      61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',
      80:'Light showers',81:'Showers',82:'Heavy showers',95:'Thunderstorm',
    }

    return NextResponse.json({
      date: daily.time[0], tempMax: daily.temperature_2m_max[0], tempMin: daily.temperature_2m_min[0],
      precipChance: daily.precipitation_probability_max[0], weatherCode: daily.weathercode[0],
      description: descs[daily.weathercode[0]] || 'Unknown',
      location: locationName,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
