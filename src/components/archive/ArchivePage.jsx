import { Archive, ArrowRight } from '@phosphor-icons/react';
import { Priority, PageHeading } from '../common/ui';

export function ArchivePage({ reviews, restoreReview, goTo }) { return <section className="page"><PageHeading eyebrow="PROJECT TRACKER" title="Archive" description="Resolved or paused items stay here without disappearing."/>{reviews.length ? <div className="archive-list">{reviews.map(r=><article key={r.id}><div><Priority value={r.priority}/><h3>{r.title}</h3><p>{r.area} · Archived item</p></div><button className="text-button" onClick={()=>restoreReview(r.id)}>Restore <ArrowRight size={15}/></button></article>)}</div> : <div className="archive-empty"><Archive size={26}/><strong>No archived reviews yet</strong><p>Archived reviews will appear here and can be restored later.</p><button className="primary-button" onClick={() => goTo('All Reviews')}>Go to All Reviews</button></div>}</section>; }

