import { localToday } from '../../lib/dates';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowsCounterClockwise, CalendarBlank, ChatsCircle, Check, FileText, Handshake, Lightbulb, MagicWand, Notebook, Plus, ArrowCounterClockwise as RotateCcw, Rocket, Sparkle, Strategy, Target, User, Users, X } from '@phosphor-icons/react';
import { MeetingAiReview } from './MeetingAiReview';
import { extractItemsLocally, generateActionItemsWithOrvix, hashNotes } from '../../api/ai';
import { api } from '../../api/client';
import { Wave } from '../Wave.jsx';
import { TextField } from '../common/Field';
import '../../workflow.css';

const today = () => localToday();
const draftStorageKey = (user, projectId) => `synqra-meeting-editor-draft:${user?.id || 'anonymous'}:${projectId || 'none'}`;
const lastTemplateKey = 'synqra-meeting-last-template';
const templates = [
  { id: 'blank', title: 'Blank meeting', subtitle: 'Start from an empty page', icon: FileText, tint: 'slate', sections: [], notes: '' },
  { id: 'notes', title: 'Meeting notes', subtitle: 'Agenda, discussion, decisions and actions', icon: Notebook, tint: 'sky', sections: ['Agenda', 'Discussion', 'Decisions', 'Action items'], notes: 'Agenda:\n- \n\nDiscussion:\n- \n\nDecisions:\n- \n\nAction items:\n- \n' },
  { id: 'standup', title: 'Daily standup', subtitle: 'Yesterday, today and blockers', icon: Target, tint: 'emerald', sections: ['Yesterday', 'Today', 'Blockers'], notes: 'Yesterday:\n- \n\nToday:\n- \n\nBlockers:\n- \n' },
  { id: 'sprint-planning', title: 'Sprint planning', subtitle: 'Goal, stories, capacity and risks', icon: Strategy, tint: 'violet', sections: ['Sprint goal', 'Stories', 'Capacity', 'Risks'], notes: 'Sprint goal:\n\nStories:\n- \n\nCapacity:\n- \n\nRisks:\n- \n' },
  { id: 'retro', title: 'Retrospective', subtitle: 'What went well, what to improve', icon: ArrowsCounterClockwise, tint: 'amber', sections: ['Went well', 'To improve', 'Action items'], notes: 'What went well:\n- \n\nWhat to improve:\n- \n\nAction items:\n- \n' },
  { id: 'one-on-one', title: '1:1 check-in', subtitle: 'Wins, challenges, feedback, goals', icon: ChatsCircle, tint: 'rose', sections: ['Wins', 'Challenges', 'Feedback', 'Next steps'], notes: 'Wins:\n- \n\nChallenges:\n- \n\nFeedback:\n- \n\nNext steps:\n- \n' },
  { id: 'client-review', title: 'Client review', subtitle: 'Feedback, approvals and follow-ups', icon: Handshake, tint: 'sky', sections: ['Feedback', 'Approved', 'Follow-ups'], notes: 'Client feedback:\n- \n\nApproved:\n- \n\nFollow-ups:\n- \n' },
  { id: 'kickoff', title: 'Project kickoff', subtitle: 'Scope, roles, milestones and next steps', icon: Rocket, tint: 'violet', sections: ['Scope', 'Roles', 'Milestones', 'Next steps'], notes: 'Scope:\n\nRoles:\n- \n\nMilestones:\n- \n\nNext steps:\n- \n' }
];
const readLastTemplate = () => { try { return localStorage.getItem(lastTemplateKey) || ''; } catch { return ''; } };

function TemplatePreview({ template }) {
  // A miniature document: one block per section, so each card previews the structure it inserts.
  const blocks = template.sections.length ? template.sections.slice(0, 3) : null;
  return <span className={`template-preview tint-${template.tint}`} aria-hidden="true">
    <span className="template-sheet">
      <i className="template-sheet-title"/>
      {blocks ? blocks.map((section, index) => <span className="template-sheet-block" key={section}><b>{section}</b><i style={{ width: `${82 - index * 14}%` }}/><i style={{ width: `${60 + index * 9}%` }}/></span>) : <span className="template-sheet-blank"><Plus size={18}/></span>}
    </span>
  </span>;
}

function TemplateGallery({ open, onToggle, activeId, lastUsedId, onPick }) {
  const active = templates.find(template => template.id === activeId);
  return <section className={`template-gallery${open ? ' open' : ''}`} aria-labelledby="template-gallery-title">
    <header className="template-gallery-head">
      <div><h3 id="template-gallery-title">{open ? 'Start from a template' : active ? `Template: ${active.title}` : 'Templates'}</h3><p>{open ? 'Pick a structure. You can edit everything after it is inserted.' : 'Swap the structure of your notes at any time.'}</p></div>
      <button type="button" className="secondary-button" aria-expanded={open} aria-controls="template-gallery-grid" onClick={onToggle}>{open ? 'Hide templates' : 'Browse templates'}</button>
    </header>
    {open && <div className="template-grid" id="template-gallery-grid">
      {templates.map(template => {
        const Icon = template.icon;
        const active = template.id === activeId;
        return <button key={template.id} type="button" className={`template-card${active ? ' active' : ''}`} aria-pressed={active} onClick={() => onPick(template)}>
          <TemplatePreview template={template}/>
          <span className="template-card-body">
            <span className={`template-card-icon tint-${template.tint}`}><Icon size={15}/></span>
            <span className="template-card-text"><strong>{template.title}</strong><small>{template.subtitle}</small></span>
            {active ? <span className="template-card-badge"><Check size={11}/> In use</span> : template.id === lastUsedId ? <span className="template-card-badge muted">Last used</span> : null}
          </span>
        </button>;
      })}
    </div>}
  </section>;
}

export function MeetingEditor({ projectId, user, team = [], onClose, onCreate, onToast }) {
  const [phase, setPhase] = useState('writing');
  const [form, setForm] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftStorageKey(user, projectId)));
      const base = saved?.title || saved?.notes ? { title: saved.title || '', date: saved.date || today(), notes: saved.notes || '', attendees: Array.isArray(saved.attendees) ? saved.attendees : [] } : { title: '', date: today(), notes: '', attendees: [] };
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

  const update = (key, value) => {
    setForm(previous => ({ ...previous, [key]: value }));
    setSaved(false);
  };

  const [pendingTemplate, setPendingTemplate] = useState(null);
  const [galleryOpen, setGalleryOpen] = useState(() => !form.notes.trim());
  const notesRef = useRef(null);
  const [lastUsedTemplate, setLastUsedTemplate] = useState(readLastTemplate);
  const activeTemplateId = templates.find(template => template.notes && template.notes === form.notes)?.id || (!form.notes.trim() && lastUsedTemplate === 'blank' ? 'blank' : '');
  const applyTemplate = template => {
    setForm(previous => ({ ...previous, notes: template.notes, title: previous.title || (template.id === 'blank' ? '' : template.title) }));
    setSaved(false);
    setPendingTemplate(null);
    setGalleryOpen(false);
    setLastUsedTemplate(template.id);
    requestAnimationFrame(() => notesRef.current?.focus());
    try { localStorage.setItem(lastTemplateKey, template.id); } catch {}
  };
  // Inserting a template replaces the notes, so ask before discarding text the user wrote.
  const pickTemplate = template => {
    const untouched = !form.notes.trim() || templates.some(item => item.notes === form.notes);
    if (untouched) applyTemplate(template);
    else setPendingTemplate(template);
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
          className="meeting-title-input field-input" aria-label="Meeting title"
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
                <p className="participants-label">Add by name</p>
                <div className="participants-add">
                  <input value={manualName} onChange={e => setManualName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualAttendee(); } }} placeholder="Add name…" aria-label="Add participant manually" />
                  <button type="button" className="secondary-button" disabled={!manualName.trim()} onClick={addManualAttendee}>Add</button>
                </div>
                <p className="participants-label">Team</p>
                {teamMembers.length ? teamMembers.map(t => (
                  <label key={t.email || t.name} className="participant-row">
                    <input type="checkbox" checked={attendees.some(a => a.toLowerCase() === t.name.toLowerCase())} onChange={() => toggleAttendee(t.name)} />
                    <span>{t.name}</span>
                  </label>
                )) : <p className="participants-empty">No other team members.</p>}
                <p className="participants-label">Invite to project</p>
                <div className="participants-add">
                  <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); inviteToProject(); } }} placeholder="name@company.com" aria-label="Invite email to project" />
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
          <span className={saved ? 'save-state saved' : 'save-state'}>
            <i />
            {saved ? 'Draft saved' : 'Unsaved draft'}
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

        <TemplateGallery open={galleryOpen} onToggle={() => setGalleryOpen(open => !open)} activeId={activeTemplateId} lastUsedId={lastUsedTemplate} onPick={pickTemplate}/>

        <div className="editor-prompt">
          <strong>Meeting notes</strong>
          <p>
            Write decisions, discussions and next steps. Lines like “Action: Aria to polish login by Friday” become tasks.
          </p>
          <textarea
            value={form.notes}
            onChange={event => update('notes', event.target.value)}
            placeholder="Start writing your meeting notes… (e.g. Action: Aria to polish login UX by Friday)"
            rows="8" className="field-input" aria-label="Meeting notes" ref={notesRef}
          />
        </div>

        {pendingTemplate && (
          <div className="template-confirm" role="alert">
            <span><strong>Replace your notes?</strong> Inserting &ldquo;{pendingTemplate.title}&rdquo; will replace what you have written.</span>
            <span className="template-confirm-actions">
              <button type="button" className="text-button" onClick={() => setPendingTemplate(null)}>Keep my notes</button>
              <button type="button" className="secondary-button" onClick={() => applyTemplate(pendingTemplate)}>Replace</button>
            </span>
          </div>
        )}

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
