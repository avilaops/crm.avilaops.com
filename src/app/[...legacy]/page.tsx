import { notFound, redirect } from 'next/navigation'
import { resolvePath } from '../../routes'

export default async function LegacyPage({ params }: { params: Promise<{ legacy: string[] }> }) {
  const { legacy } = await params
  const resolved = resolvePath(`/${legacy.join('/')}/`)
  if (resolved.path !== '/') redirect(resolved.path)
  notFound()
}
