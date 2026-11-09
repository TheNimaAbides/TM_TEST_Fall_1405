// بررسی نسخه جدید برنامه
// روش کار: فایل index.html را (بدون کش) از اینترنت می‌گیریم و نام فایل اصلی برنامه (assets/index-xxxx.js) را
// با نام فایلی که الان در حال اجراست مقایسه می‌کنیم. با هر انتشار جدید این نام عوض می‌شود.
export const APP_VERSION = '۰.۲.۰'

export type UpdateResult = 'new' | 'current' | 'offline' | 'error'

const baseName = (url: string) => url.split('?')[0].split('/').pop() ?? ''

function runningEntry(): string {
  const tag = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/"]')
  return tag ? baseName(tag.src) : ''
}

export async function checkForUpdate(): Promise<UpdateResult> {
  if (!import.meta.env.PROD) return 'current'
  if (!navigator.onLine) return 'offline'
  const running = runningEntry()
  if (!running) return 'current'
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}index.html`, { cache: 'no-store' })
    if (!res.ok) return 'error'
    const html = await res.text()
    const match = html.match(/<script[^>]+src=["']([^"']*assets\/[^"']+\.js)["']/)
    if (!match) return 'error'
    return baseName(match[1]) === running ? 'current' : 'new'
  } catch {
    return 'error'
  }
}
