// Cloudflare Worker پنل مدیریت ترازمشاور
// کار این فایل: ۱) ورود مدیر با رمز عبور  ۲) انجام امن تغییرات در مخزن GitHub
// رمز عبور و توکن GitHub فقط اینجا (به‌صورت Secret) نگهداری می‌شوند و هرگز به مرورگر یا کد عمومی نمی‌رسند.
//
// متغیرهای لازم (Settings ← Variables and Secrets):
//   ADMIN_PASSWORD   (Secret) رمز عبور مدیر؛ حداقل ۱۰ نویسه، بهتر است یک جمله طولانی باشد
//   GITHUB_TOKEN     (Secret) توکن دسترسی به مخزن (فقط Contents: Read and write برای همین مخزن)
//   SESSION_SECRET   (Secret) یک رشته تصادفی طولانی (حداقل ۳۲ نویسه)
//   ALLOWED_ORIGIN   آدرس سایت بدون / آخر (مثلاً https://thenimaabides.github.io)
//   REPO             نام مخزن (مثلاً TheNimaAbides/TM_TEST_Fall_1405)
//   BRANCH           (اختیاری) پیش‌فرض main

const SESSION_HOURS = 12
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024 // اندازه بدنه base64؛ حدوداً ۲۲ مگابایت فایل
const enc = new TextEncoder()
const dec = new TextDecoder()

// ---------- ابزارهای امضا ----------
const toB64u = (bytes) => {
  let s = ''
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64u = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toB64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
async function sign(secret, payload) {
  const body = toB64u(enc.encode(JSON.stringify(payload)))
  return `${body}.${await hmac(secret, body)}`
}
async function verify(secret, token, type) {
  if (typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  if (!safeEqual(sig, await hmac(secret, body))) return null
  try {
    const p = JSON.parse(dec.decode(fromB64u(body)))
    if (p.t !== type || !p.exp || p.exp < Date.now() / 1000) return null
    return p
  } catch { return null }
}

// ---------- پاسخ‌ها ----------
function corsHeaders(env, extra = {}) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
    ...extra,
  }
}
const json = (env, data, status = 200) => new Response(JSON.stringify(data), { status, headers: corsHeaders(env, { 'Content-Type': 'application/json; charset=utf-8' }) })
const fail = (env, status, error) => json(env, { error }, status)

// فقط این مسیرها قابل خواندن/نوشتن هستند
const FILE_PATH = /^public\/content\/(content\.json|files\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,119})$/
const DIR_PATH = 'public/content/files'

function ghHeaders(env, accept = 'application/vnd.github+json') {
  return { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: accept, 'User-Agent': 'taraz-admin-worker', 'X-GitHub-Api-Version': '2022-11-28' }
}
const contentsUrl = (env, path, withRef = true) => `https://api.github.com/repos/${env.REPO}/contents/${path}${withRef ? `?ref=${encodeURIComponent(env.BRANCH || 'main')}` : ''}`

// ---------- ورود با رمز عبور ----------
// محدودیت تلاش اشتباه: ۵ بار اشتباه ← ۱۵ دقیقه انتظار (به‌ازای هر IP). این شمارنده در حافظه Worker است؛
// پس رمز طولانی انتخاب کنید تا حدس زدن عملاً غیرممکن باشد.
const failures = new Map()
const MAX_FAILS = 5
const LOCK_MS = 15 * 60 * 1000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function handleLogin(request, env) {
  if (request.method !== 'POST') return fail(env, 405, 'method not allowed')
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 10 || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return fail(env, 500, 'not_configured')
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const now = Date.now()
  if (failures.size > 500) failures.clear()
  const rec = failures.get(ip)
  if (rec && rec.until > now) return fail(env, 429, 'too_many_attempts')
  let body
  try { body = await request.json() } catch { return fail(env, 400, 'bad body') }
  const given = typeof body.password === 'string' ? body.password.slice(0, 200) : ''
  // مقایسه با زمان ثابت (از هر دو مقدار هش می‌گیریم تا طول رمز لو نرود)
  const ok = safeEqual(await hmac(env.SESSION_SECRET, 'pw:' + given), await hmac(env.SESSION_SECRET, 'pw:' + env.ADMIN_PASSWORD))
  if (!ok) {
    const n = (rec ? (rec.until && rec.until <= now ? 0 : rec.n) : 0) + 1
    failures.set(ip, n >= MAX_FAILS ? { n: 0, until: now + LOCK_MS } : { n, until: 0 })
    await sleep(800)
    return fail(env, 401, 'wrong_password')
  }
  failures.delete(ip)
  const token = await sign(env.SESSION_SECRET, { t: 'session', u: 'admin', exp: Math.floor(now / 1000) + SESSION_HOURS * 3600 })
  return json(env, { token })
}

// ---------- API ----------
async function handleApi(request, env, url) {
  const auth = request.headers.get('Authorization') || ''
  const session = await verify(env.SESSION_SECRET, auth.startsWith('Bearer ') ? auth.slice(7) : '', 'session')
  if (!session) return fail(env, 401, 'unauthorized')

  const path = url.searchParams.get('path') || ''

  if (url.pathname === '/api/me') return json(env, { user: session.u })

  if (url.pathname === '/api/list') {
    if (path !== DIR_PATH) return fail(env, 400, 'bad path')
    const res = await fetch(contentsUrl(env, DIR_PATH), { headers: ghHeaders(env) })
    if (res.status === 404) return json(env, [])
    return new Response(res.body, { status: res.status, headers: corsHeaders(env, { 'Content-Type': 'application/json; charset=utf-8' }) })
  }

  if (url.pathname !== '/api/file') return fail(env, 404, 'not found')
  if (!FILE_PATH.test(path)) return fail(env, 400, 'bad path')

  if (request.method === 'GET') {
    const raw = url.searchParams.get('raw') === '1'
    const res = await fetch(contentsUrl(env, path), { headers: ghHeaders(env, raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json') })
    return new Response(res.body, { status: res.status, headers: corsHeaders(env, { 'Content-Type': res.headers.get('Content-Type') || 'application/json' }) })
  }

  if (request.method === 'PUT') {
    const len = Number(request.headers.get('Content-Length') || 0)
    if (!len || len > MAX_UPLOAD_BYTES) return fail(env, 413, 'file too large')
    // بدنه بدون پردازش به GitHub فرستاده می‌شود (برای فایل‌های بزرگ سریع‌تر و سبک‌تر)
    const res = await fetch(contentsUrl(env, path, false), { method: 'PUT', headers: { ...ghHeaders(env), 'Content-Type': 'application/json' }, body: request.body, duplex: 'half' })
    return new Response(res.body, { status: res.status, headers: corsHeaders(env, { 'Content-Type': 'application/json; charset=utf-8' }) })
  }

  if (request.method === 'DELETE') {
    if (path === 'public/content/content.json') return fail(env, 400, 'cannot delete content')
    let body
    try { body = await request.json() } catch { return fail(env, 400, 'bad body') }
    if (!body.sha) return fail(env, 400, 'sha required')
    const res = await fetch(contentsUrl(env, path, false), {
      method: 'DELETE',
      headers: { ...ghHeaders(env), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: String(body.message || 'Remove unused file').slice(0, 200), sha: body.sha, branch: env.BRANCH || 'main' }),
    })
    return new Response(res.body, { status: res.status, headers: corsHeaders(env, { 'Content-Type': 'application/json; charset=utf-8' }) })
  }

  return fail(env, 405, 'method not allowed')
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/' || url.pathname === '') return new Response('Taraz admin API is running.', { headers: { 'Content-Type': 'text/plain' } })

    if (url.pathname.startsWith('/api/') || url.pathname === '/auth/login') {
      const origin = request.headers.get('Origin')
      if (origin && origin !== env.ALLOWED_ORIGIN) return new Response('Forbidden origin', { status: 403 })
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) })
      if (url.pathname === '/auth/login') return handleLogin(request, env)
      return handleApi(request, env, url)
    }
    return new Response('Not found', { status: 404 })
  },
}
