import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarBlank, Check, FileText, Lightbulb, MagicWand, ArrowCounterClockwise as RotateCcw, Sparkle, Target, User, Users, X } from '@phosphor-icons/react';
import { MeetingAiReview } from './MeetingAiReview';
import { extractItemsLocally, generateActionItemsWithOrvix, hashNotes } from '../../api/ai';
import { api } from '../../api/client';
import { Wave } from '../Wave.jsx';
import '../../workflow.css';

const today = () => new Date().toISOString().slice(0, 10);
const DRAFT_STORAGE_KEY = 'synqra-meeting-editor-draft';
const templates = [
  { title: 'Blank Meeting', subtitle: 'Start from scratch', icon: FileText, notes: '' },
  { title: 'Meeting Notes', subtitle: 'Standard meeting notes', icon: FileText, notes: 'Yesterday:\n\nToday:\n\nBlockers:\n' },
  { title: 'Daily Standup', subtitle: 'Yesterday / Today / Blockers', icon: Target, notes: 'Yesterday:\n\nToday:\n\nBlockers:\n' },
  { title: 'Sprint Planning', subtitle: 'Goal, stories, risks', icon: Target, notes: 'Goal:\n\nStories:\n\nRisks:\n' }
];

export function MeetingEditor({ user, team = [], onClose, onCreate, onToast }) {
  const [phase, setPhase] = useState('writing');
  const [form, setForm] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY));
      const base = saved?.title || saved?.notes ? { title: saved.title || '', date: saved.date || today(), notes: saved.notes || '', attendees: Array.isArray(saved.attendees) ? saved.attendees : [] } : { title: '', date: today(), notes: '', attendees: [] };
      return base;
    } catch { return { title: '', date: today(), notes: '', attendees: [] }; }
  });
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const participantsRef = useRef(null);
  const [items, setItems] = useState([]);
  const [brief, setBrief] = useState(null);
  const [generatedHash, setGeneratedHash] = useState('');
  const [aiError, setAiError] = useState('');
  const [saved, setSaved] = useState(false);
  const [generating, setGenerating] = useState(false);

  const update = (key, value) => {
    setForm(previous => ({ ...previous, [key]: value }));
    setSaved(false);
  };

  const useTemplate = template => {
    update('notes', template.notes);
    if (!form.title) update('title', template.title === 'Blank Meeting' ? '' : template.title);
  };

  const generate = async () => {
    if (!form.notes.trim()) {
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
      const result = await generateActionItemsWithOrvix({ notes: form.notes });
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
    const extracted = extractItemsLocally(form.notes);
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
      await api('/api/project-members', { method: 'POST', body: JSON.stringify({ email, role: 'viewer' }) });
      const label = email.split('@')[0];
      setForm(prev => {
        const current = Array.isArray(prev.attendees) ? prev.attendees : [];
        return current.some(a => a.toLowerCase() === label.toLowerCase() || a.toLowerCase() === email) ? prev : { ...prev, attendees: [...current, label] };
      });
      setInviteEmail('');
      onToast(`Invited ${email} — added to participants`);
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
    try { localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form)); setSaved(true); onToast('Meeting draft saved'); }
    catch { onToast('Meeting draft could not be saved'); }
  };
  const create = async payload => {
    await onCreate(payload);
    try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch {}
  };

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
            Save
          </button>
          <button
            className="primary-button"
            disabled={generating || !form.title.trim() || !form.notes.trim()}
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
          className="meeting-title-input"
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
          <strong>Meeting notes</strong>
          <p>
            Write decisions, discussions, and next steps below or pick a template to get started
          </p>
          <textarea
            value={form.notes}
            onChange={event => update('notes', event.target.value)}
            placeholder="Start writing your meeting notes… (e.g. Action: Aria to polish login UX by Friday)"
            rows="8"
          />
        </div>

        <div className="template-grid">
          {templates.map(template => {
            const Icon = template.icon;
            return (
              <button key={template.title} className="template-card" onClick={() => useTemplate(template)}>
                <Icon size={18} />
                <span>
                  <strong>{template.title}</strong>
                  <small>{template.subtitle}</small>
                </span>
              </button>
            );
          })}
        </div>

        <div className="recently-used">
          <span className="editor-label">
            <Check size={13} /> Recently used
          </span>
          <button className="recent-template" onClick={() => useTemplate(templates[0])}>
            <FileText size={14} /> Blank Meeting
          </button>
        </div>

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
