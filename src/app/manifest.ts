import type { MetadataRoute } from 'next'

// PWA-manifest: zorgt dat Kunststofkozijnnodig CRM "Toevoegen aan beginscherm" werkt op mobiel
// (Safari iOS / Chrome Android) en als losse app draait, zonder browser-chrome.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kunststofkozijnnodig CRM',
    short_name: 'Kozijn Nodig',
    description: 'Kunststofkozijnnodig.nl CRM — offertes, klanten, planning',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1e40af',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/images/logo-rebu.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
