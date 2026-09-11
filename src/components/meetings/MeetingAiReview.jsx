import { useMemo, useState } from 'react';
import { ArrowLeft, CheckSquare, Trash, Flag, Users, MagicWand, Plus, Check } from '@phosphor-icons/react';
import { AREAS, PRIORITIES } from '../../constants/workflow';
import { AppSelect } from '../common/AppSelect';

const initials = name => (name || 'M').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const STATUS_OPTIONS = ['Open', 'In Progress', 'Review', 'Resolved', 'Rejected'];

export function MeetingAiReview({ user, meeting, items, brief, setItems, selectedCount, onBack, onCreate }) {
  const [editingId, setEditingId] = useState(null);
  const update = (id, key, value) => {
    setItems(previous => previous.map(item => (item.id === id ? { ...item, [key]: value } : item)));
  };

  const remove = id => {
    setItems(previous => previous.map(item => (item.id === id ? { ...item, keep: false } : item)));
  };

  const permanentlyDelete = id => {
    setItems(previous => previous.filter(item => item.id !== id));
  };

  const toggleAll = selectAll => {
    setItems(previous => previous.map(item => ({ ...item, keep: selectAll })));
  };

  const addNewItem = (assignee = '') => {
    const newItem = {
      id: `manual-ai-${Date.now()}`,
      keep: true,
      title: 'New action item',
      description: 'Action item identified from meeting discussion.',
      assignee: assignee || user?.name || '',
      due: '',
      priority: 'Major',
      area: 'Engineering'
    };
    setItems(previous => [...previous, newItem]);
  };

  const create = () => {
    onCreate({
      meeting: { ...meeting, ai: true, itemCount: selectedCount },
      items: items.filter(item => item.keep)
    });
  };

  const allSelected = items.length > 0 && items.every(item => item.keep);
  const groups = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const key = (item.assignee || '').trim() || 'Unassigned';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return [...map.entries()].sort((a, b) => b[1].filter(i => i.keep).length - a[1].filter(i => i.keep).length || a[0].localeCompare(b[0]));
  }, [items]);

  return (
    <section className="meeting-ai-page">
      <div className="ai-review-header">
        <div>
          <button className="back-link" onClick={onBack}>
            <ArrowLeft size={17} /> Back to editor
          </button>
          <div className="ai-review-title">
            <span className="ai-review-icon">
              <MagicWand size={18} />
            </span>
            <div>
              <h1>AI Review</h1>
              <p>
                {items.length} items extracted by {brief?.source === 'local' ? 'local heuristics' : 'Orvix AI'} — review, refine, and select items to convert to board tasks
              </p>
              {brief?.generatedAt && <small className="ai-generated-at">Generated {new Date(brief.generatedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}{brief?.model ? ` · ${brief.model}` : ''}</small>}
            </div>
          </div>
        </div>
        <div className="ai-review-head-actions">
          <button className="text-button" onClick={() => toggleAll(!allSelected)}>
            <Check size={14} /> {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          <button className="secondary-button" onClick={() => addNewItem()}>
            <Plus size={15} /> Add Item
          </button>
        </div>
      </div>

      <div className="ai-review-content">
        {brief && (brief.summary || brief.keyPoints?.length || brief.decisions?.length || brief.risks?.length || brief.openQuestions?.length) ? (
          <section className="ai-brief" aria-label="Meeting brief">
            {brief.summary && <div className="ai-brief-block"><h3>Summary</h3><p>{brief.summary}</p></div>}
            {brief.keyPoints?.length > 0 && <div className="ai-brief-block"><h3>Key points</h3><ul>{brief.keyPoints.map((point, index) => <li key={index}>{point}</li>)}</ul></div>}
            {brief.decisions?.length > 0 && <div className="ai-brief-block"><h3>Decisions</h3><ul>{brief.decisions.map((point, index) => <li key={index}>{point}</li>)}</ul></div>}
            {brief.risks?.length > 0 && <div className="ai-brief-block"><h3>Risks &amp; blockers</h3><ul>{brief.risks.map((point, index) => <li key={index}>{point}</li>)}</ul></div>}
            {brief.openQuestions?.length > 0 && <div className="ai-brief-block"><h3>Open questions</h3><ul>{brief.openQuestions.map((point, index) => <li key={index}>{point}</li>)}</ul></div>}
          </section>
        ) : null}
        <div className="ai-section-label">
          <span>
            ⌄ <CheckSquare size={15} /> Action Items
          </span>
          <small>{selectedCount} of {items.length} selected to create</small>
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <p>No items in review. Click &ldquo;Add Item&rdquo; to manually create one or go back to edit notes.</p>
            <button className="secondary-button" onClick={() => addNewItem()}>
              <Plus size={15} /> Add Action Item
            </button>
          </div>
        ) : (
          <div className="ai-task-groups">
            {groups.map(([assignee, groupItems]) => {
              const kept = groupItems.filter(i => i.keep).length;
              return (
                <section className="ai-task-card" key={assignee}>
                  <header className="ai-task-card-head">
                    <span className="avatar avatar-dark">{initials(assignee === 'Unassigned' ? '?' : assignee)}</span>
                    <strong>{assignee}</strong>
                    <span className="ai-task-count">{kept} task{kept === 1 ? '' : 's'}</span>
                    <button type="button" className="text-button ai-task-add" onClick={() => addNewItem(assignee === 'Unassigned' ? '' : assignee)}><Plus size={14}/> Add task</button>
                  </header>
                  <div className="ai-task-table-wrap">
                    <table className="ai-task-table">
                      <thead>
                        <tr><th>Task Name</th><th>Requested by</th><th>Severity</th><th>Status</th><th>Due</th><th aria-label="Actions" /></tr>
                      </thead>
                      <tbody>
                        {groupItems.map(item => (
                          <tr key={item.id} className={item.keep ? '' : 'discarded'}>
                            <td>
                              <label className="ai-task-check">
                                <input type="checkbox" checked={item.keep} onChange={event => update(item.id, 'keep', event.target.checked)} aria-label={`Include ${item.title}`} />
                                {editingId === item.id ? (
                                  <input
                                    className="ai-task-title-input"
                                    value={item.title}
                                    autoFocus
                                    onChange={event => update(item.id, 'title', event.target.value)}
                                    onBlur={() => setEditingId(null)}
                                    onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Escape') setEditingId(null); }}
                                    aria-label="Task title"
                                  />
                                ) : (
                                  <button type="button" className="ai-task-title" onClick={() => setEditingId(item.id)} title="Click to edit">{item.title}</button>
                                )}
                              </label>
                            </td>
                            <td className="muted">{meeting?.title || 'Meeting Notes'}</td>
                            <td>
                              <span className={`severity severity-${item.priority.toLowerCase()}`}><i />{item.priority}</span>
                            </td>
                            <td>
                              <AppSelect
                                className="inline status-inline"
                                value={item.status || 'Open'}
                                options={STATUS_OPTIONS}
                                onChange={val => update(item.id, 'status', val)}
                                ariaLabel={`Status of ${item.title}`}
                              />
                            </td>
                            <td className="muted">{item.due || '—'}</td>
                            <td>
                              <button
                                className="ai-delete small"
                                onClick={() => (item.keep ? remove(item.id) : permanentlyDelete(item.id))}
                                aria-label={item.keep ? `Discard ${item.title}` : `Remove ${item.title}`}
                                title={item.keep ? 'Discard item' : 'Permanently remove'}
                              >
                                <Trash size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {editingId && groupItems.some(i => i.id === editingId) && (
                    <div className="ai-task-edit">
                      {(() => {
                        const item = groupItems.find(i => i.id === editingId);
                        return (
                          <>
                            <textarea value={item.description} onChange={event => update(item.id, 'description', event.target.value)} placeholder="Add a description or acceptance criteria…" rows="2" aria-label="Task description" />
                            <div className="ai-task-edit-row">
                              <label>Assignee<input value={item.assignee} onChange={event => update(item.id, 'assignee', event.target.value)} placeholder={user?.name || 'Assignee'} /></label>
                              <label>Due<input type="date" value={item.due} onChange={event => update(item.id, 'due', event.target.value)} /></label>
                              <div className="ai-select-field"><Flag size={14} /><AppSelect value={item.priority} options={PRIORITIES} onChange={val => update(item.id, 'priority', val)} ariaLabel="Priority" /></div>
                              <div className="ai-select-field"><Users size={14} /><AppSelect value={item.area} options={AREAS} onChange={val => update(item.id, 'area', val)} ariaLabel="Area" /></div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      <div className="ai-review-footer">
        <span>
          <strong>{selectedCount}</strong> items selected to create as tasks
        </span>
        <button className="primary-button" disabled={!selectedCount} onClick={create}>
          Create {selectedCount} item{selectedCount === 1 ? '' : 's'} <ArrowLeft style={{ transform: 'rotate(180deg)' }} size={16}/>
        </button>
      </div>
    </section>
  );
}
