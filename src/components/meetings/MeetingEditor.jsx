import { localToday } from '../../lib/dates';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarBlank, Lightbulb, MagicWand, ArrowCounterClockwise as RotateCcw, Sparkle, X } from '@phosphor-icons/react';
import { MeetingAiReview } from './MeetingAiReview';
import { extractItemsLocally, generateActionItemsWithOrvix, hashNotes } from '../../api/ai';
import { api } from '../../api/client';
import { Wave } from '../Wave.jsx';
import { TextField } from '../common/Field';
import { MeetingTemplatePicker } from './MeetingTemplatePicker';
import { meetingTemplate, templateNotes, meetingEvidence } from '../../lib/meeting-templates';
import '../../workflow.css';

const today = () => localToday();
const draftStorageKey = (user, projectId) => `synqra-meeting-editor-draft:${user?.id || 'anonymous'}:${projectId || 'none'}`;

export function MeetingEditor({ projectId, user, team = [], onClose, onCreate, onToast }) {
  const [phase, setPhase] = useState(() => {
    try { const draft = JSON.parse(localStorage.getItem(draftStorageKey(user, projectId))); return draft?.title || draft?.notes ? 'writing' : 'templates'; }
    catch { return 'templates'; }
  });
  const [form, setForm] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftStorageKey(user, projectId)));
      const base = saved?.title || saved?.notes ? { title: saved.title || '', date: saved.date || today(), notes: saved.notes || '', templateId: saved.templateId || '', attendees: Array.isArray(saved.attendees) ? saved.attendees : [] } : { title: '', date: today(), notes: '', templateId: '', attendees: [] };
      return base;
    } catch { return { title: '', date: today(), notes: '', attendees: [] }; }
  });
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [invitation, setInvitation] = useState(null);
  const participantsRef = useRef(null);
  const [items, setItems] = useState([]);
  const [brief, setBrief] = useState(null);
  const [generatedHash, setGeneratedHash] = useState('');
  const [aiError, setAiError] = useState('');
  const [saved, setSaved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const evidence = meetingEvidence(form.notes);

  const update = (key, value) => {
    setForm(previous => ({ ...previous, [key]: value }));
    setSaved(false);
  };

  const useTemplate = template => {
    setForm(previous => ({ ...previous, notes: templateNotes(template), templateId: template.id, title: previous.title || (template.id === 'blank' ? '' : template.name) }));
    setItems([]); setBrief(null); setGeneratedHash(''); setAiError(''); setSaved(false); setPhase('writing');
  };

  const generate = async () => {
    if (!evidence) {
      onToast('Write some meeting notes first');
      return;
    }
    if (generating) return;
    if (generatedHash && generatedHash === hashNotes(form.notes) && items.length) {
      onToast('These notes were already analyzed — review the suggestions');
      setPhase('ai');
      return;
    }
    setGenerating(true);
    setAiError('');
    try {
      const result = await generateActionItemsWithOrvix({ notes: evidence });
      const extracted = result?.items || [];
      if (!extracted.length) {
        onToast('No action items could be extracted. Try adding bullet points.');
        return;
      }
      setItems(extracted);
      setBrief(result?.brief || null);
      setGeneratedHash(hashNotes(form.notes));
      setPhase('ai');
    } catch (err) {
      setAiError(err.message || 'Failed to generate AI action items');
    } finally {
      setGenerating(false);
    }
  };
  const useLocalExtraction = () => {
    const extracted = extractItemsLocally(evidence);
    if (!extracted.length) {
      onToast('No action items could be extracted. Try adding bullet points.');
      return;
    }
    setItems(extracted);
    setBrief({ generatedAt: new Date().toISOString(), sourceExcerpt: form.notes.trim().slice(0, 220), model: 'local', source: 'local' });
    setGeneratedHash(hashNotes(form.notes));
    setAiError('');
    setPhase('ai');
  };

  const preview = useMemo(() => items.filter(item => item.keep).length, [items]);
  const attendees = useMemo(() => Array.isArray(form.attendees) ? form.attendees : [], [form.attendees]);
  const teamMembers = useMemo(() => {
    const seen = new Set(attendees.map(a => a.toLowerCase()));
    return (team || []).filter(t => t?.name && !seen.has(t.name.toLowerCase()));
  }, [team, attendees]);
  const toggleAttendee = name => {
    const value = (name || '').trim();
    if (!value) return;
    setForm(prev => {
      const current = Array.isArray(prev.attendees) ? prev.attendees : [];
      const exists = current.some(a => a.toLowerCase() === value.toLowerCase());
      return { ...prev, attendees: exists ? current.filter(a => a.toLowerCase() !== value.toLowerCase()) : [...current, value] };
    });
    setSaved(false);
  };
  const addManualAttendee = () => {
    if (!manualName.trim()) return;
    toggleAttendee(manualName.trim());
    setManualName('');
  };
  const inviteToProject = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) { onToast('Enter a valid email address'); return; }
    setInviting(true);
    try {
      const invited = await api('/api/project-members', { method: 'POST', body: JSON.stringify({ projectId, email, role: 'viewer' }) });
      setInvitation(invited);
      const label = email.split('@')[0];
      setForm(prev => {
        const current = Array.isArray(prev.attendees) ? prev.attendees : [];
        return current.some(a => a.toLowerCase() === label.toLowerCase() || a.toLowerCase() === email) ? prev : { ...prev, attendees: [...current, label] };
      });
      setInviteEmail('');
      onToast(invited.emailSent ? `Invitation sent to ${email}` : 'Invitation created. Copy the link to share it with your teammate.');
    } catch (err) { onToast(err.message); } finally { setInviting(false); }
  };
  useEffect(() => {
    if (!participantsOpen) return undefined;
    const onDown = e => { if (participantsRef.current && !participantsRef.current.contains(e.target)) setParticipantsOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setParticipantsOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [participantsOpen]);
  const saveDraft = () => {
    try { localStorage.setItem(draftStorageKey(user, projectId), JSON.stringify(form)); setSaved(true); onToast('Meeting draft saved'); }
    catch { onToast('Meeting draft could not be saved'); }
  };
  const create = async payload => {
    try { await onCreate(payload); }
    catch (failure) { if (failure.failedItems) setItems(failure.failedItems.map(item => ({ ...item, keep: true }))); throw failure; }
    try { localStorage.removeItem(draftStorageKey(user, projectId)); } catch {}
  };
  const saveMeeting = async () => {
    if (savingMeeting || !form.title.trim() || !form.date) return;
    setSavingMeeting(true); setSaveError('');
    try { await create({ meeting: { ...form, ai: false }, items: [] }); }
    catch (failure) { setSaveError(failure.message || 'Meeting could not be saved. Your notes are kept for retry.'); }
    finally { setSavingMeeting(false); }
  };

  if (phase === 'templates') return <MeetingTemplatePicker currentId={form.templateId || 'general'} replacing={!!form.notes.trim()} onUse={useTemplate} onCancel={() => form.title || form.notes ? setPhase('writing') : onClose()}/>;

  if (phase === 'ai') {
    return (
      <MeetingAiReview
        user={user}
        team={team}
        meeting={form}
        items={items}
        brief={brief}
        setItems={setItems}
        selectedCount={preview}
        onBack={() => setPhase('writing')}
        onCreate={create}
      />
    );
  }

  return (
    <section className="meeting-editor-page">
      <div className="meeting-editor-top">
        <button className="back-link" onClick={onClose}>
          <ArrowLeft size={17} /> Meetings
        </button>
        <div className="meeting-editor-actions">
          <button
            className="secondary-button"
            disabled={!form.title.trim()}
            onClick={saveDraft}
          >
            Save draft
          </button>
          <button className="secondary-button" disabled={savingMeeting || generating || !form.title.trim() || !form.date} onClick={saveMeeting}>{savingMeeting ? 'Saving meeting…' : 'Save meeting'}</button>
          <button
            className="primary-button"
            disabled={savingMeeting || generating || !form.title.trim() || !form.date || !evidence}
            onClick={generate}
          >
            {generating ? (
              <>
                <Wave style={{ fontSize: 13 }} /> Analyzing notes…
              </>
            ) : (
              <>
                <MagicWand size={16} /> Generate AI
              </>
            )}
          </button>
        </div>
      </div>

      <div className="meeting-editor-heading">
        <input
          className="meeting-title-input field-input" aria-label="Meeting title"
          maxLength={200}
          value={form.title}
          onChange={event => update('title', event.target.value)}
          placeholder="Untitled Meeting"
          autoFocus
        />
        <div className="meeting-meta">
          <label>
            <CalendarBlank size={14} />
            <input type="date" value={form.date} onChange={event => update('date', event.target.value)} />
          </label>
          <span className="participants-wrap" ref={participantsRef}>
            <button type="button" className="avatar avatar-button" onClick={() => setParticipantsOpen(open => !open)} aria-label="Meeting participants" aria-expanded={participantsOpen} title="Participants">
              {(user?.name || 'A').slice(0, 1).toUpperCase()}
            </button>
            {participantsOpen && (
              <div className="participants-popup" role="dialog" aria-label="Meeting participants">
                <strong>Participants</strong>
                {attendees.length > 0 && (
                  <div className="participants-chips">
                    {attendees.map(name => <span key={name} className="participant-chip">{name}<button type="button" onClick={() => toggleAttendee(name)} aria-label={`Remove ${name}`}><X size={13}/></button></span>)}
                  </div>
                )}
                <p className="participants-label">MANUAL</p>
                <div className="participants-add">
                  <input value={manualName} onChange={e => setManualName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualAttendee(); } }} placeholder="Add name…" aria-label="Add participant manually" />
                  <button type="button" className="secondary-button" disabled={!manualName.trim()} onClick={addManualAttendee}>Add</button>
                </div>
                <p className="participants-label">TIM</p>
                {teamMembers.length ? teamMembers.map(t => (
                  <label key={t.email || t.name} className="participant-row">
                    <input type="checkbox" checked={attendees.some(a => a.toLowerCase() === t.name.toLowerCase())} onChange={() => toggleAttendee(t.name)} />
                    <span>{t.name}</span>
                  </label>
                )) : <p className="participants-empty">No other team members.</p>}
                <p className="participants-label">INVITE KE PROJECT</p>
                <div className="participants-add">
                  <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); inviteToProject(); } }} placeholder="email@contoh.com" aria-label="Invite email to project" />
                  <button type="button" className="secondary-button" disabled={inviting || !inviteEmail.trim()} onClick={inviteToProject}>{inviting ? '…' : 'Invite'}</button>
                </div>
                {invitation?.inviteUrl && <div className="participants-invitation">
                  <TextField label="Meeting invitation link (expires in 7 days)" readOnly value={invitation.inviteUrl}/>
                  <button type="button" className="secondary-button" onClick={async () => {
                    try { await navigator.clipboard.writeText(invitation.inviteUrl); onToast('Invitation link copied'); }
                    catch { onToast('Copy failed. Select and copy the link above.'); }
                  }}>Copy invitation link</button>
                </div>}
              </div>
            )}
          </span>
          <span>Draft</span>
          <span className={saved ? 'save-state saved' : 'save-state'}>
            <i />
            {saved ? 'Saved' : 'Unsaved'}
          </span>
          <span className="ai-status-pill">
            <Sparkle size={12} /> Powered by Orvix AI
          </span>
        </div>
      </div>

      <div className="meeting-editor-tabs">
        <span className="active">
          <i />
          Writing
        </span>
        <span>
          <i />
          Review
        </span>
        <span>
          <i />
          Completed
        </span>
      </div>

      <div className="meeting-editor-canvas">
        {generating && (
          <div className="ai-generating-overlay">
            <div className="ai-generating-card">
              <span className="ai-spark-icon">
                <MagicWand size={24} />
              </span>
              <h3>Extracting Action Items</h3>
              <p>Orvix AI is analyzing your meeting notes, extracting tasks, assignees, and priorities…</p>
              <div className="ai-generating-wave">
                <Wave style={{ fontSize: 24 }} />
              </div>
            </div>
          </div>
        )}

        <div className="editor-prompt">
          <div className="meeting-template-context"><span>Template: {meetingTemplate(form.templateId)?.name || 'Custom notes'}</span><button type="button" className="secondary-button" disabled={generating || savingMeeting} onClick={() => setPhase('templates')}>Change template</button></div>
          <strong>Meeting notes</strong>
          <p>
            Write decisions, discussions, and next steps below. Lines beginning with &gt; are guidance and are excluded from AI extraction.
          </p>
          <textarea
            value={form.notes}
            onChange={event => update('notes', event.target.value)}
            placeholder="Start writing your meeting notes… (e.g. Action: Aria to polish login UX by Friday)"
            rows="8" className="field-input" aria-label="Meeting notes"
            maxLength={5000}
          />
        </div>

        {saveError && <p className="form-error" role="alert">{saveError}</p>}

        {aiError && (
          <div className="ai-error" role="alert">
            <div><strong>AI generation failed</strong><p>{aiError}</p></div>
            <div className="ai-error-actions">
              <button className="secondary-button" onClick={generate} disabled={generating}><RotateCcw size={14}/> Retry</button>
              <button className="text-button" onClick={useLocalExtraction}>Continue without AI</button>
            </div>
          </div>
        )}
        <div className="ai-tips">
          <span>
            <Lightbulb size={14} /> AI tips
          </span>
          <p>✨ Write clear bullet points or assignees for automatic task extraction</p>
          <p>✨ Mention due dates (e.g. &ldquo;by Friday&rdquo;) to help AI set deadlines</p>
        </div>
      </div>
    </section>
  );
}
