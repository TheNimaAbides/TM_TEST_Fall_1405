export type Block = { type: 'text'; text: string } | { type: 'video'; id: string }
export type Lesson = { id: string; title: string; summary?: string; blocks?: Block[] }
export type Chapter = { id: string; title: string; lessons: Lesson[] }
export type Course = { id: string; title: string; description: string; chapters: Chapter[] }
export type Category = { id: string; title: string; icon: string; color: string; courses: Course[] }

const sampleCourse: Course = {
  id: 'accounting-1',
  title: 'دوره اصول حسابداری ۱',
  description: 'آشنایی با مفاهیم پایه و معادله حسابداری',
  chapters: [
    { id: 'ch-1', title: 'فصل اول: آشنایی با حسابداری', lessons: [
      { id: 'l-1', title: 'تعریف حسابداری', summary: 'مفهوم، هدف و جایگاه حسابداری' },
      { id: 'l-2', title: 'انواع مؤسسات', summary: 'طبقه‌بندی مؤسسات از نظر فعالیت' },
      { id: 'l-3', title: 'استفاده‌کنندگان اطلاعات', summary: 'استفاده‌کنندگان داخلی و خارجی' },
    ]},
    { id: 'ch-2', title: 'فصل دوم: معادله حسابداری', lessons: [
      { id: 'l-4', title: 'دارایی', summary: 'تعریف و نمونه‌های دارایی' },
      { id: 'l-5', title: 'بدهی', summary: 'تعهدات اقتصادی واحد تجاری' },
      { id: 'l-6', title: 'سرمایه', summary: 'حقوق مالکانه و اجزای آن' },
    ]},
  ],
}

const sepidarCourse: Course = {
  id: 'sepidar-1',
  title: 'دوره آموزش سپیدار ۱',
  description: 'آشنایی با محیط و تنظیمات اولیه نرم‌افزار سپیدار',
  chapters: [
    { id: 'sp-ch-1', title: 'فصل اول: شروع کار با سپیدار', lessons: [
      { id: 'sp-l-1', title: 'آشنایی با محیط نرم‌افزار', summary: 'منوها و بخش‌های اصلی سپیدار', blocks: [
        { type: 'text', text: 'در این درس با محیط کلی نرم‌افزار سپیدار، منوها و بخش‌های اصلی آن آشنا می‌شوید. پیشنهاد می‌شود پیش از دیدن ویدئو، این مقدمه را مطالعه کنید.' },
        { type: 'video', id: 'nbeao6c' },
        { type: 'text', text: 'پس از دیدن ویدئو، نرم‌افزار را باز کنید و منوهای اصلی را یک‌بار به‌صورت عملی مرور کنید تا با جای هر بخش آشنا شوید.' },
      ] },
      { id: 'sp-l-2', title: 'ایجاد سال مالی', summary: 'ساخت اولین سال مالی', blocks: [
        { type: 'text', text: 'محتوای این درس به‌زودی اضافه می‌شود.' },
      ] },
    ]},
  ],
}

export const categories: Category[] = [
  { id: 'accounting', title: 'اصول حسابداری', icon: 'calculator', color: 'violet', courses: [sampleCourse] },
  { id: 'payroll', title: 'حقوق و دستمزد', icon: 'wallet', color: 'green', courses: [] },
  { id: 'commerce', title: 'سامانه جامع تجارت', icon: 'store', color: 'blue', courses: [] },
  { id: 'holoo', title: 'نرم‌افزار هلو', icon: 'receipt', color: 'orange', courses: [] },
  { id: 'sepidar', title: 'نرم‌افزار سپیدار', icon: 'monitor', color: 'cyan', courses: [sepidarCourse] },
  { id: 'raz', title: 'نرم‌افزار راز', icon: 'chart', color: 'pink', courses: [] },
  { id: 'excel', title: 'اکسل', icon: 'table', color: 'green', courses: [] },
  { id: 'word', title: 'ورد', icon: 'file', color: 'blue', courses: [] },
  { id: 'typing', title: 'تایپ ده‌انگشتی', icon: 'keyboard', color: 'amber', courses: [] },
  { id: 'career', title: 'محاسبه شغلی', icon: 'briefcase', color: 'slate', courses: [] },
]