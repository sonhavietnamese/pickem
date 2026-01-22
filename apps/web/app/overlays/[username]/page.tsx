import lazy from 'next/dynamic'

const PageClient = lazy(() => import('./page.client.simulate'))

export default function Page() {
  return <PageClient />
}
