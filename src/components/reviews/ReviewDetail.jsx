import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Archive, ArrowRight, CalendarBlank, ChatCircle as MessageCircle, Clock as Clock3, List, ListChecks, Paperclip, Plus, Tag, Trash as Trash2, User, X } from '@phosphor-icons/react';
import { api } from '../../api/client';
import { reviewsApi } from '../../api/reviews';
import { AppSelect } from '../common/AppSelect';
import { MultiCheckSelect, AssigneeOption } from '../common/MultiCheckSelect';
import { TextField, TextAreaField, Field } from '../common/Field';
import { Button } from '../ui/button';
import { dateLabel, relativeDate } from '../../lib/dates';
import { elapsedLabel, historyDateLabel, statusFor, makeHistoryModel } from '../../lib/helpers';
import { DetailSection, SelectField, StatusPill, Priority } from '../common/ui';
import { AREAS, STAGES, PRIORITIES } from '../../constants/workflow';
import '../../workflow.css';
import '../../detail.css';

export function ReviewDetailEnhanced({ review, meetings = [], metadata = [], sprints = [], user, team = [], onClose, onUpdated, onDeleted, onToast, onRemoveRequest, onActivity = () => {}, readOnly = false }) {
  const [detail, setDetail] = useState(null);
  const [draft, setDraft] = useState(review);
  const [comment, setComment] = useState('');
  const [subtask, setSubtask] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [failedPatch, setFailedPatch] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [now, setNow] = useState(Date.now());
  const hydrated = useRef(false);
  const saving = useRef(false);
  const mounted = useRef(false);
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const refresh = useRef(() => {});
  useEffect(() => {
    mounted.current = true; hydrated.current = false;
    setDetail(null); setDraft(review); setError(''); setLoadError('');
    refresh.current = async () => {
      const version = revision.current;
      try {
        const result = await reviewsApi.details(review.id);
        if (!mounted.current || version !== revision.current || saving.current) return;
        setDetail(result); setLoadError('');
        if (!hydrated.current) { setDraft(result.review); hydrated.current = true; }
      } catch (failure) { if (mounted.current) setLoadError(failure.message); }
    };
    refresh.current();
    const poll = window.setInterval(() => refresh.current(), 10000);
    const clock = window.setInterval(() => setNow(Date.now()), 30000);
    return () => { mounted.current = false; window.clearInterval(poll); window.clearInterval(clock); };
  }, [review.id]);
  // Serial writes prevent responses from overwriting unrelated edits.
  const save = patch => {
    if (readOnly) return Promise.resolve();
    revision.current += 1;
    queue.current = queue.current.then(async () => {
      saving.current = true;
      if (mounted.current) { setBusy('saving'); setError(''); }
      try {
        const saved = await reviewsApi.update(review.id, patch);
        if (!mounted.current) return;
        setDraft(previous => {
          const next = { ...previous };
          for (const key of Object.keys(patch)) next[key] = saved[key] ?? patch[key];
          return next;
        });
        setDetail(previous => ({ ...previous, review: saved }));
        setFailedPatch(null); onUpdated(saved); onActivity(); onToast('Task updated');
      } catch (failure) { if (mounted.current) { setFailedPatch(patch); setError(`${failure.message} This change was not saved.`); } }
      finally { saving.current = false; if (mounted.current) setBusy(''); }
    });
    return queue.current;
  };
  const mutate = async (name, action, propagate = false) => {
    if (busy || readOnly) return;
    setBusy(name); setError('');
    try { await action(); onActivity(); }
    catch (failure) { setError(failure.message); if (propagate) throw failure; }
    finally { if (mounted.current) setBusy(''); }
  };
  const addSubtask = event => {
    event.preventDefault(); if (!subtask.trim()) return;
    mutate('subtask', async () => {
      const saved = await api(`/api/reviews/${review.id}/subtasks`, { method: 'POST', body: JSON.stringify({ title: subtask.trim() }) });
      setDetail(previous => ({ ...previous, subtasks: [...(previous?.subtasks || []), saved] })); setSubtask('');
    });
  };
  const toggleSubtask = item => mutate('subtask', async () => {
    const update = patch => setDetail(previous => ({ ...previous, subtasks: (previous?.subtasks || []).map(current => current.id === item.id ? { ...current, ...patch } : current) }));
    update({ completed: !item.completed });
    try { update(await api(`/api/reviews/${review.id}/subtasks/${item.id}`, { method: 'PATCH', body: JSON.stringify({ completed: !item.completed }) })); }
    catch (failure) { update({ completed: item.completed }); throw failure; }
  });
  const submitComment = event => {
    event.preventDefault(); if (!comment.trim()) return;
    mutate('comment', async () => {
      const saved = await api(`/api/reviews/${review.id}/comments`, { method: 'POST', body: JSON.stringify({ body: comment.trim() }) });
      setDetail(previous => ({ ...previous, comments: [...(previous?.comments || []), saved] })); setComment(''); onToast('Comment added');
    });
  };
  const remove = () => {
    const action = () => mutate('delete', async () => { await reviewsApi.remove(review.id); onDeleted(review.id); }, true);
    if (onRemoveRequest) onRemoveRequest(action);
  };
  const uploadFile = async file => {
    if (!file || uploading || readOnly) return;
    if (file.size > 50 * 1024 * 1024) { setError('Choose a file smaller than 50 MB.'); return; }
    setUploading(true); setError('');
    try {
      const form = new FormData(); form.append('file', file);
      const result = await api(`/api/reviews/${review.id}/attachments`, { method:'POST', body:form });
      setDetail(previous => ({ ...previous, attachments: [result, ...(previous?.attachments || [])] })); onActivity(); onToast('Attachment uploaded');
    } catch (failure) { setError(failure.message); } finally { setUploading(false); }
  };
  const edit = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const options = (type, value) => [{ value: '', label: `No ${type}` }, ...[...new Set([...metadata.filter(item => item.type === type && !item.archived).map(item => item.name), value].filter(Boolean))]];
  const sprintOptions = [{ value: '', label: 'No sprint' }, ...[...new Set([...sprints.map(item => item.name), draft.sprint].filter(Boolean))]];
  const labels = Array.isArray(draft.labels) ? draft.labels : [];
  const labelOptions = [...new Set([...metadata.filter(item => item.type === 'label' && !item.archived).map(item => item.name), ...labels])];
  const historyModel = makeHistoryModel(detail?.history, statusFor(draft), draft.createdAt, now);
  const estimateMinutes = Number(draft.estimateHours || 0) * 60;
  const overBy = estimateMinutes ? Math.max(0, historyModel.activeMinutes - estimateMinutes) : 0;
  const meetingOptions = [{ value: '', label: 'No related meeting' }, ...meetings.map(item => ({ value: item.id, label: item.title }))];
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="detail-backdrop" />
    <Dialog.Content className="detail-panel" aria-describedby={undefined}>
      <Dialog.Title className="sr-only">Task details</Dialog.Title>
      <Dialog.Close className="detail-close" aria-label="Close task details"><X size={20}/></Dialog.Close>
      <div className="detail-head">
        <TextAreaField readOnly={readOnly} label="Task title" className="detail-title-field" rows={2} value={draft.title || ''} onChange={event => edit('title', event.target.value)} onBlur={event => {
          const title = event.target.value.trim();
          if (!title) setError('Task title cannot be empty.'); else if (title !== detail?.review?.title) save({ title });
        }}/>
        <div className="detail-badges"><StatusPill value={statusFor(draft)}/><Priority value={draft.priority || 'Minor'}/><span>{draft.key || 'No key'}</span><span>{dateLabel(draft.due)}</span></div>
      </div>
      <div className="detail-scroll">
        {loadError && <div className="detail-message" role="alert"><p>{loadError}</p><Button variant="outline" onClick={() => refresh.current()}>Retry loading details</Button></div>}
        {!detail && !loadError && <p className="detail-message" role="status">Loading task details…</p>}
      <fieldset className="detail-fields" disabled={readOnly}>
        <DetailSection title="Description" icon={List}><TextAreaField label="Description" value={draft.description || ''} onChange={event => edit('description', event.target.value)} onBlur={event => { if (event.target.value !== (detail?.review?.description || '')) save({ description: event.target.value }); }} placeholder="Add context or acceptance criteria…"/></DetailSection>
        <DetailSection title="Related meeting"><Field label="Related meeting"><AppSelect value={draft.meetingId || ''} options={meetingOptions} onChange={meetingId => save({ meetingId })} ariaLabel="Related meeting"/></Field></DetailSection>
        <DetailSection title="Properties"><div className="detail-grid">
          <SelectField label="Phase" value={draft.stage} values={STAGES} onChange={stage => save({ stage })}/>
          <SelectField label="Team" value={draft.area} values={AREAS} onChange={area => save({ area })}/>
          <SelectField label="Status" value={statusFor(draft)} values={['Open', 'In Progress', 'Review', 'Resolved', 'Rejected']} onChange={status => save({ status })}/>
          <SelectField label="Priority" value={draft.priority} values={PRIORITIES} onChange={priority => save({ priority })}/>
          <SelectField label="Epic" value={draft.epic || ''} values={options('epic', draft.epic)} onChange={epic => save({ epic })}/>
          <SelectField label="Feature" value={draft.feature || ''} values={options('feature', draft.feature)} onChange={feature => save({ feature })}/>
          <SelectField label="Sprint" value={draft.sprint || ''} values={sprintOptions} onChange={sprint => save({ sprint })}/>
          <TextField label="Estimate (hours)" icon={Clock3} type="number" min="0" step="0.5" placeholder="e.g. 2.5" hint="Hours in 0.5-hour increments." value={draft.estimateHours ?? ''} onChange={event => edit('estimateHours', event.target.value)} onBlur={event => {
            if (!event.target.validity.valid) { setError('Estimate must be zero or more, in 0.5-hour increments.'); return; }
            save({ estimateHours: event.target.value === '' ? null : Number(event.target.value) });
          }}/>
          <Field label="Labels" icon={Tag} className="detail-wide"><MultiCheckSelect values={labels} options={labelOptions} onChange={next => save({ labels: next })} placeholder="No labels" ariaLabel="Labels" emptyLabel="Create labels from the Board toolbar"/></Field>
        </div></DetailSection>
        <DetailSection title="Ownership"><div className="detail-grid">
          <Field label="Assignees" icon={User}><MultiCheckSelect values={draft.assignees?.length ? draft.assignees : (draft.assignee ? [draft.assignee] : [])} options={team.filter(item => item.name).map((item, index) => ({ value: item.name, label: item.name, email: item.email, index }))} onChange={next => save({ assignees: next, assignee: next[0] || '' })} placeholder="Unassigned" ariaLabel="Assignees" emptyLabel="Invite project members first" renderOption={item => <AssigneeOption name={item.label} email={item.email} index={item.index}/>}/></Field>
          <TextField label="Reporter" icon={User} value={draft.reporter ?? draft.submittedBy ?? user?.name ?? ''} onChange={event => edit('reporter', event.target.value)} onBlur={event => save({ reporter: event.target.value })}/>
          <TextField label="Submitted by" value={draft.submittedBy || user?.name || ''} readOnly/>
        </div></DetailSection>
        <DetailSection title="Planning"><div className="detail-grid">
          <TextField label="Start date" icon={CalendarBlank} type="date" value={draft.startDate || ''} onChange={event => save({ startDate: event.target.value })}/>
          <TextField label="Due date" icon={CalendarBlank} type="date" value={draft.due || ''} onChange={event => save({ due: event.target.value })}/>
        </div></DetailSection>
        <DetailSection title="Subtasks" icon={ListChecks}><div className="subtask-list">{detail?.subtasks?.map(item => <label key={item.id} className="subtask-row"><input type="checkbox" checked={!!item.completed} disabled={!!busy} onChange={() => toggleSubtask(item)}/><span className={item.completed ? 'completed' : ''}>{item.title}</span></label>)}</div><form className="detail-inline-form" onSubmit={addSubtask}><TextField label="New subtask" value={subtask} onChange={event => setSubtask(event.target.value)} placeholder="Add subtask…"/><Button disabled={!subtask.trim() || !!busy}><Plus size={16}/>Add</Button></form></DetailSection>
        <DetailSection title="Attachments" icon={Paperclip}><input id={`attachment-${review.id}`} type="file" onChange={event => { uploadFile(event.target.files?.[0]); event.target.value = ''; }} hidden disabled={uploading}/><label className="attachment-dropzone" htmlFor={`attachment-${review.id}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); uploadFile(event.dataTransfer.files?.[0]); }}><Paperclip size={24}/><strong>{uploading ? 'Uploading…' : 'Click to upload or drag & drop'}</strong><span>Documents and images · max 50 MB</span></label><div className="attachment-list">{detail?.attachments?.map(file => <a key={file.id || file.url} href={file.url || `/api/attachments/${file.id}`} target="_blank" rel="noreferrer">{file.name || file.filename || 'Attachment'}</a>)}</div></DetailSection>
        <DetailSection title="Discussion" icon={MessageCircle}><form className="detail-inline-form" onSubmit={submitComment}><TextField label="New comment" value={comment} onChange={event => setComment(event.target.value)} placeholder="Add a comment…"/><Button disabled={!comment.trim() || !!busy}>Comment</Button></form>{detail?.comments?.map(item => <article className="comment-list" key={item.id}><strong>{item.name}</strong><p>{item.body}</p><small>{relativeDate(item.createdAt)}</small></article>)}</DetailSection>
        <DetailSection title="Status history"><div className="history-heading"><strong>{historyModel.timeline.length} changes</strong><span>Live</span></div><div className="history-chips">{Object.entries(historyModel.totals).map(([name, minutes]) => <span key={name}>{name} <small>{elapsedLabel(minutes)}</small></span>)}</div><div className={`active-time-banner${overBy ? ' over' : ''}`}><Clock3 size={18}/><span><strong>Time in active statuses:</strong> {elapsedLabel(historyModel.activeMinutes)}{overBy ? ` (+${elapsedLabel(overBy)} over estimate)` : ''}</span></div><p className="field-hint">Elapsed time in In Progress and Review, not tracked working hours.</p><div className="status-timeline">{historyModel.timeline.map(item => <div className="status-event" key={item.id}><i className={`history-dot ${String(item.toStatus).toLowerCase().replace(/\s+/g, '-')}`}/><div><p><StatusPill value={item.from}/><ArrowRight size={14}/><StatusPill value={item.toStatus}/></p><small>by {item.name || 'System'} · {historyDateLabel(item.createdAt)}</small><em>spent {item.spent} in {item.toStatus}</em></div></div>)}</div></DetailSection>
        <DetailSection title="Activity"><div className="detail-activity">{detail?.activity?.map(item => <div key={item.id}><Clock3 size={16}/><p><strong>{item.name || 'System'}</strong> {item.action === 'created' ? 'created this task' : item.action === 'commented' ? 'commented' : item.action === 'subtask_added' ? 'added a subtask' : `updated ${item.metadata?.fields?.join(', ') || 'this task'}`}<small>{relativeDate(item.createdAt)}</small></p></div>)}</div></DetailSection>
      </fieldset>
      </div>
      <div className="detail-footer">
        {error && <p className="form-error" role="alert">{error}</p>}
        {failedPatch && <Button variant="outline" onClick={() => save(failedPatch)}>Retry save</Button>}
        {busy && <span role="status">{busy === 'saving' ? 'Saving…' : 'Working…'}</span>}
        {readOnly ? <p>View only · Ask an editor to make changes.</p> : <div><Button variant="outline" disabled={!!busy} onClick={() => save({ archived: 1 })}><Archive size={16}/>Archive</Button><Button variant="destructive" disabled={!!busy} onClick={remove}><Trash2 size={16}/>Delete</Button></div>}
      </div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
