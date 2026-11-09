import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen, BriefcaseBusiness, Calculator, ChartNoAxesCombined, ChevronLeft,
  Download, FileText, FileSpreadsheet, Home, Keyboard, Monitor, Moon, Receipt, Search, Settings,
  ShoppingBag, Sun, Type, Wallet, Bell, ArrowRight, RefreshCw, ShieldCheck, X, BookMarked,
} from 'lucide-react'
import type { Category, Chapter, Course, Lesson } from './data'
import { fetchContent } from './content'
import { BlockView } from './BlockView'
import { APP_VERSION, checkForUpdate } from './update'

const Admin = lazy(() => import('./admin/Admin'))

type Tab = 'home' | 'courses' | 'offline' | 'settings'
type Theme = 'light' | 'dark' | 'system'
type FontSize = 'sm' | 'md' | 'lg'

const iconMap: Record<string, React.ElementType> = {
  calculator: Calculator, wallet: Wallet, store: ShoppingBag, receipt: Receipt,
  monitor: Monitor, chart: ChartNoAxesCombined, table: FileSpreadsheet, file: Type,
  keyboard: Keyboard, briefcase: BriefcaseBusiness,
}

function App() {
  const [theme, setTheme] = useState<Theme>(() => { try { return (localStorage.getItem('tm-theme') as Theme) || 'system' } catch { return 'system' } })
  const [fontSize, setFontSize] = useState<FontSize>(() => { try { const v = localStorage.getItem('tm-fs'); return v === 'sm' || v === 'lg' ? v : 'md' } catch { return 'md' } })
  const [tab, setTab] = useState<Tab>('home')
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)
  const [expanded, setExpanded] = useState<string[]>(['ch-1'])
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const lastRaw = useRef('')
  const [hash, setHash] = useState(window.location.hash)
  const [updateMessage, setUpdateMessage] = useState('')
  const [updateReady, setUpdateReady] = useState(false)

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
    document.getElementById('theme-color')?.setAttribute('content', isDark ? '#071626' : '#ffffff')
    try { localStorage.setItem('tm-theme', theme) } catch { /* storage unavailable */ }
  }, [theme, isDark])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => { if (theme === 'system') document.documentElement.dataset.theme = media.matches ? 'dark' : 'light' }
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [theme])

  useEffect(() => { if (selectedCourse) setExpanded(selectedCourse.chapters[0] ? [selectedCourse.chapters[0].id] : []) }, [selectedCourse?.id])

  useEffect(() => {
    document.documentElement.dataset.fs = fontSize
    try { localStorage.setItem('tm-fs', fontSize) } catch { /* storage unavailable */ }
  }, [fontSize])

  useEffect(() => {
    if (!updateMessage) return
    const t = window.setTimeout(() => setUpdateMessage(''), 4000)
    return () => window.clearTimeout(t)
  }, [updateMessage])

  // بررسی خودکار نسخه جدید: هنگام باز شدن، وصل شدن اینترنت و برگشتن به برنامه
  useEffect(() => {
    const run = () => { checkForUpdate().then(r => { if (r === 'new') setUpdateReady(true) }) }
    const t = window.setTimeout(run, 2500)
    const onVisible = () => { if (document.visibilityState === 'visible') run() }
    window.addEventListener('online', run)
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearTimeout(t); window.removeEventListener('online', run); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  const manualCheck = async () => {
    setUpdateMessage('در حال بررسی نسخه جدید...')
    const r = await checkForUpdate()
    if (r === 'new') { setUpdateReady(true); setUpdateMessage('نسخه جدید آماده است. دکمه «به‌روزرسانی» را بزنید.') }
    else if (r === 'current') setUpdateMessage(`برنامه به‌روز است (نسخه ${APP_VERSION}).`)
    else if (r === 'offline') setUpdateMessage('اتصال اینترنت برقرار نیست. بعد از وصل شدن دوباره بررسی کنید.')
    else setUpdateMessage('بررسی انجام نشد. کمی بعد دوباره تلاش کنید.')
  }

  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // بارگذاری محتوا: هنگام باز شدن، وصل شدن اینترنت و برگشتن به برنامه (بدون نیاز به نصب نسخه جدید برنامه)
  const loadContent = async () => {
    const res = await fetchContent()
    if (!res) { setLoadFailed(true); return }
    setLoadFailed(false)
    if (res.raw === lastRaw.current) return
    lastRaw.current = res.raw
    setCategories(res.categories)
  }
  useEffect(() => {
    loadContent()
    const onVisible = () => { if (document.visibilityState === 'visible') loadContent() }
    window.addEventListener('online', loadContent)
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.removeEventListener('online', loadContent); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  // اگر محتوا در حین استفاده به‌روز شد، صفحه‌ای که باز است با نسخه جدید جایگزین شود
  useEffect(() => {
    if (!categories) return
    const cat = selectedCategory ? categories.find(c => c.id === selectedCategory.id) ?? null : null
    const course = cat && selectedCourse ? cat.courses.find(c => c.id === selectedCourse.id) ?? null : null
    const lesson = course && selectedLesson ? course.chapters.flatMap(ch => ch.lessons).find(l => l.id === selectedLesson.id) ?? null : null
    if (cat !== selectedCategory) setSelectedCategory(cat)
    if (course !== selectedCourse) setSelectedCourse(course)
    if (lesson !== selectedLesson) setSelectedLesson(lesson)
  }, [categories])

  const cats = useMemo(() => categories ?? [], [categories])
  const recent = useMemo(() => {
    const out: { category: Category; course: Course; chapter: Chapter; lesson: Lesson }[] = []
    for (const category of cats) for (const course of category.courses) for (const chapter of course.chapters) for (const lesson of chapter.lessons) if (lesson.updatedAt) out.push({ category, course, chapter, lesson })
    return out.sort((x, y) => (y.lesson.updatedAt as string).localeCompare(x.lesson.updatedAt as string)).slice(0, 3)
  }, [cats])
  const openRecent = (r: { category: Category; course: Course; chapter: Chapter; lesson: Lesson }) => {
    setSelectedCategory(r.category); setSelectedCourse(r.course); setSelectedLesson(r.lesson); setExpanded([r.chapter.id]); setTab('courses')
  }

  const filtered = useMemo(() => cats.filter(c => c.title.includes(query.trim())), [cats, query])
  const flat = useMemo(() => selectedCourse ? selectedCourse.chapters.flatMap(chapter => chapter.lessons.map(lesson => ({ lesson, chapter }))) : [], [selectedCourse])
  const lessonIndex = selectedLesson ? flat.findIndex(x => x.lesson.id === selectedLesson.id) : -1
  const lessonChapter = lessonIndex >= 0 ? flat[lessonIndex].chapter : null
  const prevItem = lessonIndex > 0 ? flat[lessonIndex - 1] : null
  const nextItem = lessonIndex >= 0 && lessonIndex < flat.length - 1 ? flat[lessonIndex + 1] : null
  const viewKey = [tab, selectedCategory?.id, selectedCourse?.id, selectedLesson?.id].join('|')
  useEffect(() => { window.scrollTo(0, 0) }, [viewKey])

  const crumbItems: { label: string; onClick?: () => void }[] = []
  if (selectedCategory) {
    crumbItems.push({ label: selectedCategory.title, onClick: selectedCourse ? () => { setSelectedCourse(null); setSelectedLesson(null) } : undefined })
    if (selectedCourse) {
      crumbItems.push({ label: selectedCourse.title, onClick: selectedLesson ? () => setSelectedLesson(null) : undefined })
      if (selectedLesson && lessonChapter) crumbItems.push({ label: lessonChapter.title.split(':')[0], onClick: () => { setExpanded([lessonChapter.id]); setSelectedLesson(null) } })
    }
  }
  const crumbs = crumbItems.length ? (
    <nav className="crumbs" aria-label="مسیر صفحه">
      {crumbItems.map((it, i) => <span className="crumb" key={i}>{i > 0 && <i>‹</i>}{it.onClick ? <button onClick={it.onClick}>{it.label}</button> : <span className="cur">{it.label}</span>}</span>)}
    </nav>
  ) : null

  const goHome = () => { setSelectedCategory(null); setSelectedCourse(null); setSelectedLesson(null); setTab('home') }
  const chooseCategory = (category: Category) => { setSelectedCategory(category); setSelectedCourse(null); setSelectedLesson(null); setTab('courses') }
  const back = () => {
    if (selectedLesson) setSelectedLesson(null)
    else if (selectedCourse) setSelectedCourse(null)
    else if (selectedCategory) setSelectedCategory(null)
    else setTab('home')
  }

  const navItems: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'home', label: 'خانه', icon: Home },
    { id: 'courses', label: 'دوره‌ها', icon: BookOpen },
    { id: 'offline', label: 'آفلاین', icon: Download },
    { id: 'settings', label: 'تنظیمات', icon: Settings },
  ]

  if (hash.startsWith('#/admin')) {
    return <Suspense fallback={<div className="adm-loading">در حال بارگذاری پنل...</div>}><Admin onExit={() => { window.location.hash = '' }} /></Suspense>
  }

  if (categories === null) {
    return (
      <div className="app-shell"><div className="main-content">
        {loadFailed
          ? <div className="empty-panel"><BookOpen size={30}/><strong>محتوا بارگذاری نشد</strong><p>اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.</p><button className="retry-btn" onClick={loadContent}>تلاش مجدد</button></div>
          : <><div className="sk-b" style={{ height: 92 }}/><div className="sk-grid" style={{ marginTop: 26 }}>{[0, 1, 2, 3].map(i => <div className="sk-b" key={i} style={{ height: 112 }}/>)}</div></>}
      </div></div>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-mark" onClick={goHome} aria-label="صفحه اصلی"><img src={`${import.meta.env.BASE_URL}logo-emblem.png`} alt="لوگوی ترازمشاور" /></button>
        <div className="brand-copy"><strong>ترازمشاور</strong><small>نسخه آزمایشی</small></div>
        <div className="top-actions">
          <button className="icon-button" aria-label={isDark ? 'تغییر به حالت روز' : 'تغییر به حالت شب'} onClick={() => setTheme(isDark ? 'light' : 'dark')}>{isDark ? <Sun size={19}/> : <Moon size={19}/>}</button>
          <button className="icon-button" aria-label="جست‌وجو" onClick={() => { setSelectedCategory(null); setSelectedCourse(null); setSelectedLesson(null); setTab('home'); setTimeout(() => document.getElementById('course-search')?.focus(), 0) }}><Search size={19}/></button>
          <button className="icon-button" aria-label="اعلان‌ها" onClick={() => setUpdateMessage('در حال حاضر اعلان جدیدی وجود ندارد.')}><Bell size={19}/></button>
        </div>
      </header>

      <main className="main-content">
        <div className="view-anim" key={viewKey}>
        {tab === 'home' && !selectedCategory && !selectedCourse && !selectedLesson && (
          <>
            <section className="welcome-card">
              <div className="welcome-orb"><BookMarked size={25}/></div>
              <div><p className="eyebrow">مرجع آموزشی مؤسسه</p><h1>یادگیری را از اینجا شروع کنید</h1><p>دوره و درس موردنظر خود را انتخاب کنید.</p></div>
            </section>
            <div className="section-heading"><div><h2>موضوعات آموزشی</h2><p>{cats.length.toLocaleString('fa-IR')} حوزه آموزشی</p></div><span className="count-pill">{cats.length.toLocaleString('fa-IR')} موضوع</span></div>
            <div className="search-box"><Search size={18}/><input id="course-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="جست‌وجوی موضوع آموزشی..." /></div>
            <section className="category-grid">
              {filtered.map(category => {
                const Icon = iconMap[category.icon] || BookOpen
                return <button className="category-card" key={category.id} onClick={() => chooseCategory(category)}>
                  <span className={`category-icon ${category.color}`}><Icon size={22}/></span>
                  <span className="category-title">{category.title}</span>
                  <span className="category-meta">{category.courses.length ? `${category.courses.length.toLocaleString('fa-IR')} دوره` : 'به‌زودی'}</span>
                  <ChevronLeft className="card-arrow" size={17}/>
                </button>
              })}
              {filtered.length === 0 && <div className="empty-state">موضوعی با این نام پیدا نشد.</div>}
            </section>
            {recent.length > 0 && <section className="recent-section">
              <div className="section-heading"><div><h2>آخرین مطالب اضافه‌شده</h2><p>دسترسی سریع به محتوای آموزشی</p></div></div>
              {recent.map(r => <button className="recent-card" key={r.lesson.id} onClick={() => openRecent(r)}>
                <span className="recent-icon"><FileText size={21}/></span>
                <span className="recent-text"><strong>{r.lesson.title}</strong><small>{r.category.title} · {r.chapter.title.split(':')[0]}</small></span>
                <ChevronLeft size={18}/>
              </button>)}
            </section>}
          </>
        )}

        {tab === 'courses' && !selectedCategory && !selectedCourse && !selectedLesson && (
          <section className="page-section">
            <div className="page-title"><h1>دوره‌های آموزشی</h1><p>یکی از موضوعات را برای مشاهده دوره‌ها انتخاب کنید.</p></div>
            <div className="category-list">{cats.map(c => <button className="list-row" key={c.id} onClick={() => chooseCategory(c)}><span>{c.title}</span><ChevronLeft size={18}/></button>)}</div>
          </section>
        )}

        {selectedCategory && !selectedCourse && !selectedLesson && (
          <section className="page-section">
            <button className="back-link" onClick={back}><ArrowRight size={17}/> بازگشت</button>
            {crumbs}
            <div className="page-title"><p className="eyebrow">موضوع آموزشی</p><h1>{selectedCategory.title}</h1><p>دوره‌های موجود در این دسته</p></div>
            {selectedCategory.courses.length ? selectedCategory.courses.map(course => <button className="course-card" key={course.id} onClick={() => setSelectedCourse(course)}><span className="course-symbol"><BookOpen/></span><span><strong>{course.title}</strong><small>{course.description}</small><small>{course.chapters.length} فصل</small></span><ChevronLeft/></button>) : <div className="empty-panel"><BookOpen size={30}/><strong>هنوز دوره‌ای ثبت نشده است</strong><p>محتوای این بخش در نسخه‌های بعدی اضافه خواهد شد.</p></div>}
          </section>
        )}

        {selectedCourse && !selectedLesson && (
          <section className="page-section">
            <button className="back-link" onClick={back}><ArrowRight size={17}/> بازگشت به دوره‌ها</button>
            {crumbs}
            <div className="page-title"><p className="eyebrow">فهرست آموزشی</p><h1>{selectedCourse.title}</h1><p>{selectedCourse.description}</p></div>
            <div className="chapter-list">
              {selectedCourse.chapters.map(chapter => <div className="chapter" key={chapter.id}>
                <button className="chapter-heading" onClick={() => setExpanded(old => old.includes(chapter.id) ? old.filter(x => x !== chapter.id) : [...old, chapter.id])}>
                  <span>{chapter.title}</span><ChevronLeft className={expanded.includes(chapter.id) ? 'rotate-down' : ''} size={18}/>
                </button>
                {expanded.includes(chapter.id) && <div className="lesson-list">{chapter.lessons.map(lesson => <button className="lesson-row" key={lesson.id} onClick={() => setSelectedLesson(lesson)}><span className="lesson-dot"/><span><strong>{lesson.title}</strong><small>{lesson.summary}</small></span><ChevronLeft size={16}/></button>)}</div>}
              </div>)}
            </div>
          </section>
        )}

        {selectedLesson && (
          <section className="page-section">
            <button className="back-link" onClick={back}><ArrowRight size={17}/> بازگشت به فهرست درس‌ها</button>
            {crumbs}
            <div className="page-title"><p className="eyebrow">درس آموزشی</p><h1>{selectedLesson.title}</h1></div>
            <div className="fsbar"><span>اندازه متن</span><div className="fsbtns">
              {([['sm', 'کوچک', 14], ['md', 'متوسط', 17], ['lg', 'بزرگ', 21]] as const).map(([key, label, px]) =>
                <button key={key} className={`fsb ${fontSize === key ? 'sel' : ''}`} aria-label={`متن ${label}`} onClick={() => setFontSize(key)} style={{ fontSize: px }}>آ</button>)}
            </div></div>
            {selectedLesson.blocks?.length ? selectedLesson.blocks.map((block, i) => <BlockView key={i} block={block} />)
              : <article className="lesson-content"><h2>محتوای درس</h2><p>{selectedLesson.summary || 'محتوای این درس هنوز آماده نشده است.'}</p><div className="content-placeholder"><FileText size={28}/><strong>فضای محتوای آموزشی</strong><span>متن قالب‌بندی‌شده، تصویر، جدول، PDF و ویدئو در این بخش قرار می‌گیرند.</span></div></article>}
            <div className="lend">پایان درس «{selectedLesson.title}»<br/>درس {(lessonIndex + 1).toLocaleString('fa-IR')} از {flat.length.toLocaleString('fa-IR')}</div>
            <div className="lnav">
              <button className="pv" disabled={!prevItem} onClick={() => prevItem && setSelectedLesson(prevItem.lesson)}>→ درس قبلی<small>{prevItem ? prevItem.lesson.title : '—'}</small></button>
              <button className="nx" disabled={!nextItem} onClick={() => nextItem && setSelectedLesson(nextItem.lesson)}>درس بعدی ←<small>{nextItem ? nextItem.lesson.title : '—'}</small></button>
            </div>
          </section>
        )}

        {tab === 'offline' && <section className="page-section"><div className="page-title"><h1>محتوای آفلاین</h1><p>مدیریت محتوای ذخیره‌شده برای مطالعه بدون اینترنت</p></div><div className="empty-panel"><Download size={30}/><strong>هنوز محتوایی ذخیره نشده است</strong><p>امکان دریافت درس‌ها و فایل‌ها در مرحله بعدی توسعه اضافه می‌شود.</p></div><p className="notice">توجه: در نسخه فعلی فقط پوسته برنامه و فایل‌های اصلی قابلیت cache شدن دارند؛ دانلود انتخابی درس‌ها هنوز پیاده‌سازی نشده است.</p></section>}

        {tab === 'settings' && <section className="page-section"><div className="page-title"><h1>تنظیمات</h1><p>شخصی‌سازی و مدیریت برنامه</p></div>
          <div className="settings-group"><h3>مدیریت برنامه</h3>
            <button className="setting-row" onClick={manualCheck}><RefreshCw/><span><strong>بررسی به‌روزرسانی</strong><small>نسخه فعلی: {APP_VERSION}</small></span><ChevronLeft/></button>
            <button className="setting-row" onClick={() => setTab('offline')}><Download/><span><strong>مدیریت محتوای آفلاین</strong><small>مشاهده فایل‌های ذخیره‌شده</small></span><ChevronLeft/></button>
            <button className="setting-row" onClick={() => { window.location.hash = '#/admin' }}><ShieldCheck/><span><strong>پنل مدیریت</strong><small>ورود مدیر و ویرایش محتوا</small></span><ChevronLeft/></button>
          </div>
          <div className="settings-group"><h3>درباره برنامه</h3><div className="about-card"><div className="about-logo"><img src={`${import.meta.env.BASE_URL}logo-full.png`} alt="ترازمشاور؛ خدمات مالی، مالیاتی و حسابداری؛ برگزارکننده دوره‌های آموزشی" /></div><strong>ترازمشاور (آزمایشی)</strong><span>نسخه {APP_VERSION}</span><p>مرجع آموزشی مؤسسه؛ نسخه اولیه جهت بررسی ساختار و تجربه کاربری.</p></div></div>
        </section>}
        </div>
      </main>

      <nav className="bottom-nav" aria-label="منوی اصلی">
        {navItems.map(item => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => { setTab(item.id); setSelectedCategory(null); setSelectedCourse(null); setSelectedLesson(null) }}><Icon size={21}/><span>{item.label}</span></button> })}
      </nav>
      {updateReady && <div className="update-banner" role="alert"><RefreshCw size={18}/><span>نسخه جدید برنامه آماده است.</span><button className="update-go" onClick={() => window.location.reload()}>به‌روزرسانی</button><button className="update-close" onClick={() => setUpdateReady(false)} aria-label="بستن"><X size={17}/></button></div>}
      {updateMessage && <div className="toast" role="status"><span>{updateMessage}</span><button onClick={() => setUpdateMessage('')} aria-label="بستن"><X size={17}/></button></div>}
    </div>
  )
}
export default App