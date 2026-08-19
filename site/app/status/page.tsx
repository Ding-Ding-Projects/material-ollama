import type { Metadata } from 'next'
import StatusClient from './StatusClient'
import releaseManifest from '@/content/release-manifest.json'

export const dynamic = 'force-static'
export const metadata: Metadata = {
  title: 'Status',
  description: releaseManifest.status === 'verified'
    ? `Release evidence for ${releaseManifest.release.tag}: installer, build workflow, and asset verification.`
    : 'Release status and evidence -- currently unavailable.',
}

export default function StatusPage() {
  return <StatusClient />
}
