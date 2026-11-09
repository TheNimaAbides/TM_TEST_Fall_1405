import { useEffect, useMemo, useState } from 'react'
import type { Block, Category, Chapter, ContentFile, Course, Lesson } from '../data'
import { ADMIN_API } from '../config'
import { contentUrl, formatSize } from '../content'
import { ApiError, deleteFile, getToken, listFiles, login, readContent, setToken, uploadFile, writeContent } from './api'
import { MAX_FILE_BYTES, errMsg, move, parseAparat, prepareImage, storedName, uid } from './utils'
import './admin.css'

const DRAFT_KEY = 'tm-admin-draft'
type Draft = { sha: string; categories: Category[] }
type Patch = Record<string, string | number>

const ICONS: [string, string][] = [
  ['book', 'کتاب'], ['calculator', 'ماشین‌حساب'], ['wallet', 'کیف پول'], ['store', 'فروشگاه'], ['receipt', 'فاکتور'],
  ['monitor', 'رایانه'], ['chart', 'نمودار'], ['table', 'جدول'], ['file', 'متن'], ['keyboard', 'کیبورد'], ['briefcase', 'کیف کار'],
]

const readDraft = (): Draft | null => { try { const v = localStorage.getItem(DRAFT_KEY); return v ? (JSON.parse(v) as Draft) : null } catch { return null } }
const saveDraft = (d: Draft) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch { /* storage unavailable */ } }
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY) } catch { /* storage unavailable */ } }

function locate(cats: Category[], nav: string[]) {
  const cat = cats.find(c => c.id === nav[0])
  const course = cat?.courses.find(c => c.id === nav[1])
  let chapter: Chapter | undefined
  let lesson: Lesson | undefined
  if (course && nav[2]) {
    for (const ch of course.chapters) {
      const l = ch.lessons.find(x => x.id === nav[2])
      if (l) { chapter = ch; lesson = l }
    }
  }
  return { cat, course, chapter, lesson }
}

const fileRefs = (cats: Category[]): Set<string> => {
  const s = new Set<string>()
  for (const c of cats) for (const co of c.courses) for (const ch of co.chapters) for (const l of ch.lessons)
    for (const b of l.blocks ?? []) if ((b.type === 'image' || b.type === 'file') && b.src.startsWith('files/')) s.add(b.src.slice(6))
  return s
}

function findEmptyTitle(cats: Category[]): string | null {
  for (const c of cats) {
    if (!c.title.trim()) return 'یک دسته'
    for (const co of c.courses) {
      if (!co.title.trim()) return `یک دوره در «${c.title}»`
      for (const ch of co.chapters) {
        if (!ch.title.trim()) return `یک فصل در «${co.title}»`
        for (const l of ch.lessons) if (!l.title.trim()) return `یک درس در «${ch.title}»`
      }
    }
  }
  return null
}

export default function Admin({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<'login' | 'loading' | 'ready' | 'error'>('loading')
  const [cats, setCats] = useState<Category[]>([])
  const [publishedJson, setPublishedJson] = useState('')
  const [sha, setSha] = useState('')
  const [nav, setNav] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [stale, setStale] = useState<Draft | null>(null)
  const [conflict, setConflict] = useState(false)

  const dirty = useMemo(() => phase === 'ready' && JSON.stringify(cats) !== publishedJson, [cats, publishedJson, phase])

  const handleError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { setPhase('login'); setErr(e.message); return }
    setErr(errMsg(e))
  }

  const load = async () => {
    setPhase('loading'); setErr(''); setConflict(false)
    try {
      const { data, sha: newSha } = await readContent()
      setSha(newSha)
      setPublishedJson(JSON.stringify(data.categories))
      const draft = readDraft()
      if (draft && draft.sha === newSha) { setCats(draft.categories); setNotice('پیش‌نویس ذخیره‌شده روی این دستگاه بازیابی شد.') }
      else { setCats(data.categories); if (draft) setStale(draft) }
      setPhase('ready')
    } catch (e) {
      handleError(e)
      setPhase(e instanceof ApiError && e.status === 401 ? 'login' : 'error')
    }
  }

  useEffect(() => {
    if (!ADMIN_API) { setPhase('login'); return }
    if (!getToken()) { setPhase('login'); return }
    load()
  }, [])

  // ذخیره خودکار پیش‌نویس روی همین دستگاه
  useEffect(() => {
    if (phase !== 'ready' || stale) return
    const t = window.setTimeout(() => { if (dirty) saveDraft({ sha, categories: cats }); else clearDraft() }, 400)
    return () => window.clearTimeout(t)
  }, [cats, dirty, sha, phase, stale])

  const edit = (fn: (draft: Category[]) => void) => setCats(prev => { const next = structuredClone(prev); fn(next); return next })
  const touch = (l: Lesson) => { l.updatedAt = new Date().toISOString() }

  const publish = async () => {
    const empty = findEmptyTitle(cats)
    if (empty) { setErr(`عنوان ${empty} خالی است. اول آن را پر کنید.`); return }
    setBusy('در حال انتشار...'); setErr(''); setNotice('')
    try {
      const prevRefs = fileRefs(JSON.parse(publishedJson) as Category[])
      const now = new Date().toISOString()
      const file: ContentFile = { version: 1, updatedAt: now, categories: cats }
      const newSha = await writeContent(JSON.stringify(file, null, 2) + '\n', sha, `Update content (${now.slice(0, 10)})`)
      setSha(newSha); setPublishedJson(JSON.stringify(cats)); clearDraft()
      setNotice('منتشر شد. حدود یک دقیقه دیگر برای دانشجویان نمایش داده می‌شود.')
      // پاک کردن فایل‌هایی که قبلاً منتشر شده بودند و دیگر استفاده نمی‌شوند
      const nowRefs = fileRefs(cats)
      const gone = [...prevRefs].filter(n => !nowRefs.has(n))
      if (gone.length) {
        const files = await listFiles()
        for (const f of files) if (gone.includes(f.name)) await deleteFile(f.name, f.sha).catch(() => undefined)
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(true)
      else handleError(e)
    }
    setBusy('')
  }

  const discard = () => {
    if (!window.confirm('همه تغییرات منتشرنشده دور ریخته شود؟')) return
    setCats(JSON.parse(publishedJson) as Category[]); clearDraft(); setNav([])
  }

  const [password, setPassword] = useState('')
  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setBusy('در حال ورود...'); setErr('')
    try {
      await login(password)
      setPassword('')
      setBusy('')
      await load()
    } catch (e2) {
      setBusy(''); setErr(errMsg(e2))
    }
  }

  const logout = () => { setToken(null); clearDraft(); setPhase('login'); setCats([]); setErr(''); setNotice('') }

  // ---------- صفحه ورود ----------
  if (phase === 'login' || (phase === 'loading' && !getToken())) {
    return (
      <div className="adm"><div className="adm-card adm-login">
        <h1>پنل مدیریت ترازمشاور</h1>
        {!ADMIN_API
          ? <p className="adm-warn">پنل هنوز راه‌اندازی نشده است. مراحل «راهنمای راه‌اندازی پنل» را انجام دهید و آدرس Worker را در فایل <code>src/config.ts</code> بنویسید.</p>
          : <p>رمز عبور مدیر را وارد کنید.</p>}
        {err && <div className="adm-err" role="alert">{err}</div>}
        {ADMIN_API && (
          <form onSubmit={submitLogin} className="adm-form">
            <input className="adm-input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="رمز عبور" aria-label="رمز عبور" />
            <button className="adm-btn primary" type="submit" disabled={!password || !!busy}>{busy || 'ورود'}</button>
          </form>
        )}
        <button className="adm-btn" onClick={onExit}>بازگشت به برنامه</button>
      </div></div>
    )
  }
  if (phase === 'loading') return <div className="adm"><div className="adm-card"><p>در حال بارگذاری محتوا...</p></div></div>
  if (phase === 'error') {
    return (
      <div className="adm"><div className="adm-card adm-login">
        <h1>بارگذاری محتوا انجام نشد</h1>
        {err && <div className="adm-err" role="alert">{err}</div>}
        <button className="adm-btn primary" onClick={load}>تلاش مجدد</button>
        <button className="adm-btn" onClick={onExit}>بازگشت به برنامه</button>
      </div></div>
    )
  }

  // ---------- محتوای صفحه بر اساس مسیر ----------
  const { cat, course, chapter, lesson } = locate(cats, nav)
  const level = lesson ? 3 : course ? 2 : cat ? 1 : 0

  const crumbs: { label: string; to: string[] }[] = [{ label: 'دسته‌ها', to: [] }]
  if (cat) crumbs.push({ label: cat.title || 'دسته', to: [cat.id] })
  if (course && cat) crumbs.push({ label: course.title || 'دوره', to: [cat.id, course.id] })
  if (lesson && cat && course) crumbs.push({ label: lesson.title || 'درس', to: [cat.id, course.id, lesson.id] })

  const rowButtons = (index: number, total: number, onMove: (d: -1 | 1) => void, onDelete: () => void) => (
    <span className="adm-actions">
      <button className="adm-icon" aria-label="بالا" disabled={index === 0} onClick={() => onMove(-1)}>▲</button>
      <button className="adm-icon" aria-label="پایین" disabled={index === total - 1} onClick={() => onMove(1)}>▼</button>
      <button className="adm-icon danger" aria-label="حذف" onClick={onDelete}>🗑</button>
    </span>
  )
  const confirmDelete = (what: string) => window.confirm(`«${what || 'این مورد'}» حذف شود؟ این کار بعد از انتشار برگشت‌پذیر نیست.`)

  let body: React.ReactNode = null

  if (level === 0) {
    body = (
      <>
        <h2>دسته‌های آموزشی</h2>
        {cats.map((c, i) => (
          <div className="adm-row" key={c.id}>
            <input className="adm-input" value={c.title} aria-label="نام دسته" onChange={e => edit(d => { d[i].title = e.target.value })} />
            <select className="adm-select" value={c.icon} aria-label="آیکن" onChange={e => edit(d => { d[i].icon = e.target.value })}>
              {ICONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              {!ICONS.some(([k]) => k === c.icon) && <option value={c.icon}>{c.icon}</option>}
            </select>
            {rowButtons(i, cats.length, dir => edit(d => move(d, i, dir)), () => { if (confirmDelete(c.title)) edit(d => { d.splice(i, 1) }) })}
            <button className="adm-open" onClick={() => setNav([c.id])}>{c.courses.length.toLocaleString('fa-IR')} دوره ‹</button>
          </div>
        ))}
        <button className="adm-btn" onClick={() => edit(d => { d.push({ id: 'c-' + uid(), title: 'دسته جدید', icon: 'book', color: 'blue', courses: [] }) })}>+ افزودن دسته</button>
      </>
    )
  } else if (level === 1 && cat) {
    const ci = cats.findIndex(c => c.id === cat.id)
    body = (
      <>
        <h2>دوره‌های «{cat.title}»</h2>
        {cat.courses.length === 0 && <p className="adm-muted">هنوز دوره‌ای ثبت نشده است.</p>}
        {cat.courses.map((co, i) => (
          <div className="adm-row wrap" key={co.id}>
            <input className="adm-input" value={co.title} aria-label="نام دوره" onChange={e => edit(d => { d[ci].courses[i].title = e.target.value })} />
            {rowButtons(i, cat.courses.length, dir => edit(d => move(d[ci].courses, i, dir)), () => { if (confirmDelete(co.title)) edit(d => { d[ci].courses.splice(i, 1) }) })}
            <input className="adm-input full" value={co.description} placeholder="توضیح کوتاه دوره" aria-label="توضیح دوره" onChange={e => edit(d => { d[ci].courses[i].description = e.target.value })} />
            <button className="adm-open" onClick={() => setNav([cat.id, co.id])}>فصل‌ها و درس‌ها ‹</button>
          </div>
        ))}
        <button className="adm-btn" onClick={() => edit(d => { d[ci].courses.push({ id: 'co-' + uid(), title: 'دوره جدید', description: '', chapters: [] }) })}>+ افزودن دوره</button>
      </>
    )
  } else if (level === 2 && cat && course) {
    const ci = cats.findIndex(c => c.id === cat.id)
    const oi = cat.courses.findIndex(c => c.id === course.id)
    const at = (d: Category[]): Course => d[ci].courses[oi]
    body = (
      <>
        <h2>{course.title}</h2>
        {course.chapters.length === 0 && <p className="adm-muted">هنوز فصلی ثبت نشده است.</p>}
        {course.chapters.map((ch, i) => (
          <div className="adm-card" key={ch.id}>
            <div className="adm-row">
              <input className="adm-input" value={ch.title} aria-label="نام فصل" onChange={e => edit(d => { at(d).chapters[i].title = e.target.value })} />
              {rowButtons(i, course.chapters.length, dir => edit(d => move(at(d).chapters, i, dir)), () => { if (confirmDelete(ch.title)) edit(d => { at(d).chapters.splice(i, 1) }) })}
            </div>
            {ch.lessons.map((l, j) => (
              <div className="adm-row lesson" key={l.id}>
                <button className="adm-open grow" onClick={() => setNav([cat.id, course.id, l.id])}>{l.title || '(بدون عنوان)'} ‹</button>
                {rowButtons(j, ch.lessons.length, dir => edit(d => move(at(d).chapters[i].lessons, j, dir)), () => { if (confirmDelete(l.title)) edit(d => { at(d).chapters[i].lessons.splice(j, 1) }) })}
              </div>
            ))}
            <button className="adm-btn small" onClick={() => {
              const id = 'l-' + uid()
              edit(d => { at(d).chapters[i].lessons.push({ id, title: 'درس جدید', summary: '', blocks: [], updatedAt: new Date().toISOString() }) })
              setNav([cat.id, course.id, id])
            }}>+ افزودن درس</button>
          </div>
        ))}
        <button className="adm-btn" onClick={() => edit(d => { at(d).chapters.push({ id: 'ch-' + uid(), title: 'فصل جدید', lessons: [] }) })}>+ افزودن فصل</button>
      </>
    )
  } else if (level === 3 && cat && course && chapter && lesson) {
    const ci = cats.findIndex(c => c.id === cat.id)
    const oi = cat.courses.findIndex(c => c.id === course.id)
    const hi = course.chapters.findIndex(c => c.id === chapter.id)
    const li = chapter.lessons.findIndex(l => l.id === lesson.id)
    const at = (d: Category[]): Lesson => d[ci].courses[oi].chapters[hi].lessons[li]
    const blocks = lesson.blocks ?? []
    const patchBlock = (i: number, patch: Patch) => edit(d => { const l = at(d); touch(l); Object.assign((l.blocks as Block[])[i], patch) })
    const addBlock = (b: Block) => edit(d => { const l = at(d); touch(l); l.blocks = [...(l.blocks ?? []), b] })

    body = (
      <>
        <label className="adm-label">عنوان درس
          <input className="adm-input" value={lesson.title} onChange={e => edit(d => { const l = at(d); touch(l); l.title = e.target.value })} />
        </label>
        <label className="adm-label">توضیح کوتاه (زیر عنوان در فهرست درس‌ها)
          <input className="adm-input" value={lesson.summary ?? ''} onChange={e => edit(d => { const l = at(d); touch(l); l.summary = e.target.value })} />
        </label>

        <h3>محتوای درس (از بالا به پایین نمایش داده می‌شود)</h3>
        {blocks.length === 0 && <p className="adm-muted">هنوز محتوایی اضافه نشده است. از دکمه‌های پایین استفاده کنید.</p>}
        {blocks.map((b, i) => (
          <div className="adm-block" key={i}>
            <div className="adm-block-head">
              <strong>{b.type === 'text' ? 'متن' : b.type === 'video' ? 'ویدئو (آپارات)' : b.type === 'image' ? 'تصویر' : 'فایل'}</strong>
              {rowButtons(i, blocks.length, dir => edit(d => { const l = at(d); touch(l); move(l.blocks as Block[], i, dir) }), () => { if (window.confirm('این بخش حذف شود؟')) edit(d => { const l = at(d); touch(l); (l.blocks as Block[]).splice(i, 1) }) })}
            </div>
            {b.type === 'text' && <textarea className="adm-input adm-text" rows={7} value={b.text} placeholder="متن درس را اینجا بنویسید..." onChange={e => patchBlock(i, { text: e.target.value })} />}
            {b.type === 'video' && <VideoEditor id={b.id} onId={id => patchBlock(i, { id })} />}
            {b.type === 'image' && <ImageEditor block={b} onPatch={p => patchBlock(i, p)} />}
            {b.type === 'file' && <FileEditor block={b} onPatch={p => patchBlock(i, p)} />}
          </div>
        ))}
        <div className="adm-add">
          <button className="adm-btn" onClick={() => addBlock({ type: 'text', text: '' })}>+ متن</button>
          <button className="adm-btn" onClick={() => addBlock({ type: 'video', id: '' })}>+ ویدئو آپارات</button>
          <button className="adm-btn" onClick={() => addBlock({ type: 'image', src: '' })}>+ تصویر</button>
          <button className="adm-btn" onClick={() => addBlock({ type: 'file', src: '', name: '' })}>+ PDF / فایل</button>
        </div>
      </>
    )
  }

  return (
    <div className="adm">
      <header className="adm-top">
        <strong>پنل مدیریت</strong>
        <span className="adm-top-actions">
          <button className="adm-link" onClick={onExit}>مشاهده برنامه</button>
          <button className="adm-link" onClick={logout}>خروج</button>
        </span>
      </header>

      <nav className="adm-crumbs" aria-label="مسیر">
        {crumbs.map((c, i) => (
          <span key={i}>{i > 0 && <i>‹</i>}{i < crumbs.length - 1 ? <button onClick={() => setNav(c.to)}>{c.label}</button> : <span className="cur">{c.label}</span>}</span>
        ))}
      </nav>

      {err && <div className="adm-err" role="alert">{err}<button aria-label="بستن" onClick={() => setErr('')}>✕</button></div>}
      {notice && <div className="adm-ok" role="status">{notice}<button aria-label="بستن" onClick={() => setNotice('')}>✕</button></div>}
      {conflict && (
        <div className="adm-err" role="alert">
          محتوای منتشرشده در این بین تغییر کرده است (احتمالاً از دستگاه دیگر). برای جلوگیری از پاک شدن کار آنجا، انتشار انجام نشد.
          <div className="adm-inline"><button className="adm-btn small" onClick={() => { clearDraft(); load() }}>بارگذاری نسخه منتشرشده (تغییرات این دستگاه حذف می‌شود)</button></div>
        </div>
      )}
      {stale && (
        <div className="adm-err" role="alert">
          روی این دستگاه یک پیش‌نویس قدیمی‌تر هست که مربوط به نسخه‌ای قبل از آخرین انتشار است.
          <div className="adm-inline">
            <button className="adm-btn small" onClick={() => { clearDraft(); setStale(null) }}>حذف پیش‌نویس قدیمی</button>
            <button className="adm-btn small" onClick={() => { setCats(stale.categories); setStale(null) }}>جایگزین کردن با پیش‌نویس</button>
          </div>
        </div>
      )}

      <main className="adm-main">{body}</main>

      <footer className="adm-bar">
        <span className={dirty ? 'adm-status dirty' : 'adm-status'}>{busy || (dirty ? 'تغییرات منتشر نشده (پیش‌نویس روی این دستگاه ذخیره شد)' : 'همه‌چیز منتشر شده است')}</span>
        <button className="adm-btn" disabled={!dirty || !!busy} onClick={discard}>دور انداختن</button>
        <button className="adm-btn primary" disabled={!dirty || !!busy} onClick={publish}>انتشار</button>
      </footer>
    </div>
  )
}

function VideoEditor({ id, onId }: { id: string; onId: (id: string) => void }) {
  const [raw, setRaw] = useState(id ? `https://www.aparat.com/v/${id}` : '')
  const parsed = raw.trim() ? parseAparat(raw) : null
  return (
    <>
      <input className="adm-input" dir="ltr" value={raw} placeholder="لینک ویدئو یا کد جاسازی آپارات را اینجا بچسبانید" onChange={e => { setRaw(e.target.value); const p = parseAparat(e.target.value); if (p) onId(p) }} />
      {raw.trim() && !parsed && <p className="adm-warn">لینک شناخته نشد. لینک مثل https://www.aparat.com/v/xxxx یا کد iframe را بچسبانید.</p>}
      {id && <div className="adm-video"><iframe title="پیش‌نمایش ویدئو" src={`https://www.aparat.com/video/video/embed/videohash/${id}/vt/frame`} allowFullScreen /></div>}
      {id && <p className="adm-muted" dir="ltr">video id: {id}</p>}
    </>
  )
}

function ImageEditor({ block, onPatch }: { block: Extract<Block, { type: 'image' }>; onPatch: (p: Patch) => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [preview, setPreview] = useState('')
  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true); setMsg('')
    try {
      const { bytes, ext } = await prepareImage(file)
      const name = storedName(file.name, ext)
      if (!name) throw new Error('فرمت تصویر پشتیبانی نمی‌شود.')
      await uploadFile(name, bytes)
      setPreview(URL.createObjectURL(file))
      onPatch({ src: `files/${name}` })
    } catch (e) { setMsg(errMsg(e)) }
    setBusy(false)
  }
  const shown = preview || (block.src ? contentUrl(block.src) : '')
  return (
    <>
      <label className="adm-btn file-pick">{busy ? 'در حال بارگذاری...' : block.src ? 'تعویض تصویر' : 'انتخاب تصویر'}
        <input type="file" accept="image/*" disabled={busy} onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      {msg && <p className="adm-warn">{msg}</p>}
      {shown && <img className="adm-preview" src={shown} alt="" />}
      <input className="adm-input" value={block.caption ?? ''} placeholder="توضیح زیر تصویر (اختیاری)" onChange={e => onPatch({ caption: e.target.value })} />
    </>
  )
}

function FileEditor({ block, onPatch }: { block: Extract<Block, { type: 'file' }>; onPatch: (p: Patch) => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const pick = async (file: File | undefined) => {
    if (!file) return
    setMsg('')
    if (file.size > MAX_FILE_BYTES) { setMsg('حجم فایل بیشتر از ۲۰ مگابایت است.'); return }
    const name = storedName(file.name)
    if (!name) { setMsg('این نوع فایل پشتیبانی نمی‌شود. (PDF، Word، Excel، PowerPoint، ZIP، TXT)'); return }
    setBusy(true)
    try {
      await uploadFile(name, new Uint8Array(await file.arrayBuffer()))
      onPatch({ src: `files/${name}`, size: file.size, ...(block.name ? {} : { name: file.name }) })
    } catch (e) { setMsg(errMsg(e)) }
    setBusy(false)
  }
  return (
    <>
      <label className="adm-btn file-pick">{busy ? 'در حال بارگذاری...' : block.src ? 'تعویض فایل' : 'انتخاب فایل (PDF و ...)'}
        <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv" disabled={busy} onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      {msg && <p className="adm-warn">{msg}</p>}
      {block.src && <p className="adm-muted">فایل بارگذاری شد{block.size ? ` (${formatSize(block.size)})` : ''}.</p>}
      <input className="adm-input" value={block.name} placeholder="نام نمایشی فایل برای دانشجو" onChange={e => onPatch({ name: e.target.value })} />
    </>
  )
}
