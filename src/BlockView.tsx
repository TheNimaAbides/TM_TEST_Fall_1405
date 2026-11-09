import { useState } from 'react'
import { Download, FileText, X } from 'lucide-react'
import type { Block } from './data'
import { contentUrl, formatSize } from './content'

export function BlockView({ block }: { block: Block }) {
  const [zoom, setZoom] = useState(false)

  if (block.type === 'text') return <div className="text-block">{block.text}</div>

  if (block.type === 'video') {
    return (
      <div>
        <div className="video-frame"><iframe src={`https://www.aparat.com/video/video/embed/videohash/${block.id}/vt/frame?titleShow=true`} allowFullScreen loading="lazy" title="ویدئوی آموزشی" /></div>
        <a className="video-link" href={`https://www.aparat.com/v/${block.id}`} target="_blank" rel="noopener noreferrer">باز کردن ویدئو در آپارات ↗</a>
      </div>
    )
  }

  if (block.type === 'image') {
    const src = contentUrl(block.src)
    return (
      <figure className="img-block">
        <img src={src} alt={block.caption || ''} loading="lazy" onClick={() => setZoom(true)} />
        {block.caption && <figcaption>{block.caption}</figcaption>}
        {zoom && (
          <div className="lightbox" role="dialog" aria-label="نمایش بزرگ تصویر" onClick={() => setZoom(false)}>
            <button className="lightbox-close" aria-label="بستن"><X size={22}/></button>
            <img src={src} alt={block.caption || ''} />
          </div>
        )}
      </figure>
    )
  }

  const href = contentUrl(block.src)
  const isPdf = block.src.toLowerCase().endsWith('.pdf')
  return (
    <div className="file-block">
      <span className="file-icon"><FileText size={22}/></span>
      <span className="file-info"><strong>{block.name}</strong><small>{formatSize(block.size)}</small></span>
      {isPdf && <a className="file-btn" href={href} target="_blank" rel="noopener noreferrer">مشاهده</a>}
      <a className="file-btn primary" href={href} download={block.name}><Download size={16}/> دانلود</a>
    </div>
  )
}
