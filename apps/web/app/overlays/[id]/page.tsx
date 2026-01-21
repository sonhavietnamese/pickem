import lazy from 'next/dynamic'

const PageClient = lazy(() => import('./page.client'))

export default function Page() {
  return <PageClient />
}
