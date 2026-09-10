import { useEffect, useState } from 'react';
import {
  ArrowRight, CaretLeft as ChevronLeft, CaretRight as ChevronRight,
  ClipboardText as ClipboardList, Clock as Clock3, Circle as CircleDot,
  Flag, SlidersHorizontal, SquaresFour, Rows, Tag, Target, Users, X
} from '@phosphor-icons/react';
import { AppSelect } from './AppSelect';
import { dateLabel } from '../../lib/dates';

export function SectionHead({ title, action, actionLabel, aside }) { return <div className="section-head"><h2>{title}</h2>{action ? <button onClick={action}>{actionLabel || 'View all'} <ArrowRight size={15}/></button> : <span>{aside}</span>}</div>; }
export function AttentionCard({ review, today, onReview }) {
  const meta = `${review.due < today ? 'Overdue' : review.priority} · ${review.stage} · Due ${dateLabel(review.due)}`;
  return <article className="attention-card"><div className="attention-top"><span className={`dot ${review.priority.toLowerCase()}`}/><div><strong>{review.title}</strong><p>{meta}</p></div></div><button className="review-btn" onClick={onReview}>Open review</button></article>;
}
export function StatusPill({ value }) { return <span className={`status-pill ${value.toLowerCase().replace(' ', '-')}`}>{value}</span>; }
export function Empty({ text }) { return <div className="empty-state">{text}</div>; }
export function Metric({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
export function InlineSync({ rowId, field, sync, onRetry }) {
  if (!sync) return null;
  if (sync.saving && sync.saving.id === rowId && sync.saving.field === field) return <span className="inline-sync saving" role="status">Saving…</span>;
  if (sync.failed && sync.failed.id === rowId && sync.failed.field === field) return <span className="inline-sync failed" role="alert">Failed <button type="button" className="link-button" onClick={e => { e.stopPropagation(); onRetry(sync.failed); }}>Retry</button></span>;
  if (sync.saved && sync.saved.id === rowId && sync.saved.field === field) return <span className="inline-sync saved" role="status">Saved</span>;
  return null;
}
export function DetailSection({title,children}){return <section className="detail-section"><h3>{title}</h3>{children}</section>}
export function MetricCard({ label, value }) { return <article><span>{label}</span><strong>{value}</strong></article>; }
export function Priority({ value }) { return <span className={`priority ${value.toLowerCase()}`}><i/>{value}</span>; }
export function PageHeading({ eyebrow, title, description, action }) { return <div className="page-heading"><div>{eyebrow && <small>{eyebrow}</small>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>; }
export function DatePicker({ value, onPick, onClear }) {
  const initial = value ? new Date(`${value}T12:00:00`) : new Date();
  const [view, setView] = useState({ y: initial.getFullYear(), m: initial.getMonth() });
  const move = delta => setView(v => { const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const monthLabel = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(view.y, view.m, 1));
  const offset = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const daysInPrev = new Date(view.y, view.m, 0).getDate();
  const cells = [];
  for (let i = offset - 1; i >= 0; i--) cells.push({ d: daysInPrev - i, other: true, key: `p${i}` });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, key: `c${d}` });
  let n = 1;
  while (cells.length % 7 !== 0 || cells.length < 42) cells.push({ d: n, other: true, key: `n${n++}` });
  const isoOf = day => `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return <div className="date-picker"><div className="date-picker-head"><strong>{monthLabel}</strong><div>{value && <button className="date-clear-text" onClick={onClear}>Clear</button>}<button className="date-nav" onClick={() => move(-1)} aria-label="Previous month"><ChevronLeft size={16}/></button><button className="date-nav" onClick={() => move(1)} aria-label="Next month"><ChevronRight size={16}/></button></div></div><div className="date-grid date-week">{['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(w => <span key={w}>{w}</span>)}</div><div className="date-grid">{cells.map(c => <button key={c.key} disabled={c.other} className={`date-cell${c.other ? ' other' : ''}${!c.other && isoOf(c.d) === value ? ' picked' : ''}`} onClick={() => onPick(isoOf(c.d))}>{c.d}</button>)}</div></div>;
}
export function ActionDialog({ dialog, onClose }) {
  const isSuccess = !!dialog.success;
  useEffect(() => { const onKey = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="action-dialog" role="alertdialog" aria-modal="true" aria-labelledby="action-dialog-title" onMouseDown={e => e.stopPropagation()}><button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog"><X size={19}/></button><span className={`action-icon${dialog.danger ? ' danger' : ''}${isSuccess ? ' success' : ''}`}>{dialog.icon}</span><h2 id="action-dialog-title">{dialog.title}</h2><p>{dialog.subtitle}</p>{isSuccess ? <button className="primary-button action-cta" onClick={() => { onClose(); dialog.onCta && dialog.onCta(); }}>{dialog.ctaLabel || 'Done'}</button> : <div className="modal-actions action-buttons"><button className="text-button" onClick={onClose}>{dialog.cancelLabel || 'Cancel'}</button><button className={dialog.danger ? 'danger-button' : 'primary-button'} onClick={() => { dialog.onConfirm && dialog.onConfirm(); onClose(); }}>{dialog.confirmLabel || 'Confirm'}</button></div>}</section></div>;
}
export function SelectField({ label,value,values,onChange }) { const icons = { Phase: ClipboardList, Team: Users, Status: CircleDot, Priority: Flag, Epic: Target, Feature: SquaresFour, Sprint: Rows, Labels: Tag, 'Estimate (hours)': Clock3 }; const Icon = icons[label] || SlidersHorizontal; return <label><span className="field-label"><Icon size={14}/>{label}</span><AppSelect value={value} options={values} onChange={onChange} ariaLabel={label}/></label>; }
export function Modal({title,subtitle,onClose,children}) { useEffect(() => { const onKey = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]); return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close dialog"><X size={19}/></button><h2>{title}</h2><p>{subtitle}</p>{children}</section></div>; }
