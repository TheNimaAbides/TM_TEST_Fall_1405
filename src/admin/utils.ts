export const uid = (): string => {
  const a = new Uint8Array(5)
  crypto.getRandomValues(a)
  return Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 8)
}

// از لینک آپارات، لینک جاسازی (embed) یا کد iframe، شناسه ویدئو را بیرون می‌کشد
export function parseAparat(input: string): string | null {
  const text = input.trim()
  const m = text.match(/videohash\/([A-Za-z0-9]{3,20})/) || text.match(/aparat\.com\/v\/([A-Za-z0-9]{3,20})/)
  if (m) return m[1]
  return /^[A-Za-z0-9]{4,20}$/.test(text) ? text : null
}

const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', 'txt', 'csv']
export const MAX_FILE_BYTES = 20 * 1024 * 1024

// نام امن برای ذخیره در GitHub (فقط حروف انگلیسی/عدد) به‌همراه یک شناسه یکتا
export function storedName(original: string, forcedExt?: string): string | null {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(original)
  const ext = (forcedExt || (m ? m[1] : '')).toLowerCase()
  if (!ALLOWED_EXT.includes(ext)) return null
  const base = original.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'file'
  return `${uid()}-${base}.${ext}`
}

// تصویر بزرگ را کوچک می‌کند (حداکثر ۱۶۰۰ پیکسل) تا مخزن و برنامه سنگین نشوند
export async function prepareImage(file: File): Promise<{ bytes: Uint8Array; ext: string }> {
  const extByType: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
  const ext = extByType[file.type]
  if (!ext) throw new Error('فرمت تصویر پشتیبانی نمی‌شود. از JPG یا PNG استفاده کنید.')
  const original = async () => ({ bytes: new Uint8Array(await file.arrayBuffer()), ext })
  if (file.type === 'image/gif' || file.size < 300 * 1024) return original()
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return original()
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return original()
    return { bytes: new Uint8Array(await blob.arrayBuffer()), ext: 'jpg' }
  } catch {
    return original()
  }
}

export function move<T>(arr: T[], i: number, d: -1 | 1) {
  const j = i + d
  if (j < 0 || j >= arr.length) return
  const t = arr[i]; arr[i] = arr[j]; arr[j] = t
}

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : 'خطای ناشناخته')
