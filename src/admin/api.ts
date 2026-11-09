import { ADMIN_API, REPO_BRANCH } from '../config'
import type { ContentFile } from '../data'

const TOKEN_KEY = 'tm-admin-token'
export const CONTENT_PATH = 'public/content/content.json'
export const FILES_DIR = 'public/content/files'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export const getToken = (): string | null => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } }
export const setToken = (t: string | null) => {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY) } catch { /* storage unavailable */ }
}

export async function login(password: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${ADMIN_API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
  } catch {
    throw new ApiError('اتصال به سرور برقرار نشد. اینترنت را بررسی کنید.', 0)
  }
  if (res.status === 401) throw new ApiError('رمز عبور اشتباه است.', 403)
  if (res.status === 429) throw new ApiError('تعداد تلاش‌های اشتباه زیاد بود. حدود ۱۵ دقیقه بعد دوباره تلاش کنید.', 429)
  if (res.status === 500) throw new ApiError('سرور پنل هنوز درست تنظیم نشده است. مراحل راهنمای راه‌اندازی را بررسی کنید.', 500)
  if (!res.ok) throw new ApiError('ورود انجام نشد. دوباره تلاش کنید.', res.status)
  const data = (await res.json()) as { token?: string }
  if (!data.token) throw new ApiError('ورود انجام نشد. دوباره تلاش کنید.', 0)
  setToken(data.token)
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(s)
}

async function call(pathAndQuery: string, init: RequestInit = {}): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${ADMIN_API}${pathAndQuery}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${getToken() ?? ''}` } })
  } catch {
    throw new ApiError('اتصال به سرور برقرار نشد. اینترنت را بررسی کنید.', 0)
  }
  if (res.status === 401) { setToken(null); throw new ApiError('نشست شما تمام شده است. دوباره وارد شوید.', 401) }
  return res
}

export async function readContent(): Promise<{ data: ContentFile; sha: string }> {
  const metaRes = await call(`/api/file?path=${CONTENT_PATH}`)
  if (!metaRes.ok) throw new ApiError('خواندن محتوا از GitHub ممکن نشد.', metaRes.status)
  const meta = (await metaRes.json()) as { sha: string }
  const rawRes = await call(`/api/file?path=${CONTENT_PATH}&raw=1`)
  if (!rawRes.ok) throw new ApiError('خواندن محتوا از GitHub ممکن نشد.', rawRes.status)
  const data = JSON.parse(await rawRes.text()) as ContentFile
  if (!Array.isArray(data.categories)) throw new ApiError('فایل محتوا معتبر نیست.', 0)
  return { data, sha: meta.sha }
}

export async function writeContent(json: string, sha: string, message: string): Promise<string> {
  const res = await call(`/api/file?path=${CONTENT_PATH}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: bytesToBase64(new TextEncoder().encode(json)), sha, branch: REPO_BRANCH }),
  })
  if (res.status === 409 || res.status === 422) throw new ApiError('conflict', 409)
  if (!res.ok) throw new ApiError('انتشار انجام نشد. کمی بعد دوباره تلاش کنید.', res.status)
  const out = (await res.json()) as { content: { sha: string } }
  return out.content.sha
}

export async function uploadFile(name: string, bytes: Uint8Array): Promise<void> {
  const res = await call(`/api/file?path=${FILES_DIR}/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Upload ${name}`, content: bytesToBase64(bytes), branch: REPO_BRANCH }),
  })
  if (res.status === 413) throw new ApiError('حجم فایل زیاد است (حداکثر ۲۰ مگابایت).', 413)
  if (!res.ok) throw new ApiError('بارگذاری فایل انجام نشد. دوباره تلاش کنید.', res.status)
}

export async function listFiles(): Promise<{ name: string; sha: string }[]> {
  const res = await call(`/api/list?path=${FILES_DIR}`)
  if (!res.ok) return []
  const items = (await res.json()) as { name: string; sha: string; type?: string }[]
  return Array.isArray(items) ? items.filter(i => i.type !== 'dir') : []
}

export async function deleteFile(name: string, sha: string): Promise<void> {
  await call(`/api/file?path=${FILES_DIR}/${name}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Remove unused ${name}`, sha }),
  })
}
