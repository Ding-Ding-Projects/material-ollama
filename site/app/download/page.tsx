import type { Metadata } from 'next'
import DownloadClient from './DownloadClient'
import releaseManifest from '@/content/release-manifest.json'

export const dynamic = 'force-static'
export const metadata: Metadata = {
  title: 'Download',
  description: releaseManifest.status === 'verified'
    ? `Download the verified ${releaseManifest.release.tag} Windows installer, with its size, SHA-256, and release evidence.`
    : 'The verified Windows installer link -- currently unavailable.',
}

export default function DownloadPage() {
  return <DownloadClient />
}
