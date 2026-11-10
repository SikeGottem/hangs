// Home page, which is the create screen: a server component that sets metadata and renders the client form.
import type { Metadata } from 'next'
import { CreateScreen } from '@/components/create/CreateScreen'

export const metadata: Metadata = {
  title: { absolute: "Hangs: find the day everyone's free" },
  alternates: { canonical: '/' },
}

export default function HomePage() {
  return <CreateScreen />
}
