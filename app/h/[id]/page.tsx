// Event page (builder B): loads public state on the server and hands it to the client EventPage.
import { notFound } from 'next/navigation'
import { EventPage } from '@/components/event/EventPage'
import { isEventId } from '@/lib/ids'
import { loadEventForPage } from './load'

export const dynamic = 'force-dynamic'

export default async function Page(props: PageProps<'/h/[id]'>) {
  const { id } = await props.params
  if (!isEventId(id)) notFound()
  const state = await loadEventForPage(id)
  if (!state) notFound()
  return <EventPage initialState={state} />
}
