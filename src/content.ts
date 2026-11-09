import type { Category, ContentFile } from './data'

// آدرس فایل‌های محتوا (content.json و فایل‌های بارگذاری‌شده)
export const contentUrl = (path: string) => `${import.meta.env.BASE_URL}content/${path}`

export async function fetchContent(): Promise<{ categories: Category[]; raw: string } | null> {
  try {
    const res = await fetch(contentUrl('content.json'), { cache: 'no-store' })
    if (!res.ok) return null
    const raw = await res.text()
    const data = JSON.parse(raw) as ContentFile
    if (!Array.isArray(data.categories)) return null
    return { categories: data.categories, raw }
  } catch {
    return null
  }
}

export function formatSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('fa-IR')} کیلوبایت`
  return `${(bytes / 1024 / 1024).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} مگابایت`
}
