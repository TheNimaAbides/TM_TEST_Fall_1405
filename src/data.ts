// ساختار داده‌های آموزشی. خود محتوا در فایل public/content/content.json نگهداری می‌شود
// و از طریق پنل مدیریت (یا ویرایش مستقیم همان فایل) تغییر می‌کند.
export type Block =
  | { type: 'text'; text: string }
  | { type: 'video'; id: string }
  | { type: 'image'; src: string; caption?: string }
  | { type: 'file'; src: string; name: string; size?: number }

export type Lesson = { id: string; title: string; summary?: string; blocks?: Block[]; updatedAt?: string }
export type Chapter = { id: string; title: string; lessons: Lesson[] }
export type Course = { id: string; title: string; description: string; chapters: Chapter[] }
export type Category = { id: string; title: string; icon: string; color: string; courses: Course[] }
export type ContentFile = { version: number; updatedAt?: string; categories: Category[] }
