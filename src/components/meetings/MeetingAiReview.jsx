import { ArrowLeft, CheckSquare, Trash, User, Flag, Users, MagicWand, Plus, Check } from '@phosphor-icons/react';
import { AREAS, PRIORITIES } from '../../constants/workflow';
import { AppSelect } from '../common/AppSelect';

export function MeetingAiReview({ user, meeting, items, brief, setItems, selectedCount, onBack, onCreate }) {
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

  const addNewItem = () => {
    const newItem = {
      id: `manual-ai-${Date.now()}`,
      keep: true,
      title: 'New action item',
      description: 'Action item identified from meeting discussion.',
      assignee: user?.name || '',
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
          <button className="secondary-button" onClick={addNewItem}>
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
            <button className="secondary-button" onClick={addNewItem}>
              <Plus size={15} /> Add Action Item
            </button>
          </div>
        ) : (
          <div className="ai-item-list">
            {items.map((item, index) => (
              <article className={`ai-item-card${item.keep ? '' : ' discarded'}`} key={item.id}>
                <div className="ai-item-top">
                  <label>
                    <input
                      type="checkbox"
                      checked={item.keep}
                      onChange={event => update(item.id, 'keep', event.target.checked)}
                    />
                    <strong>{item.keep ? 'Keep for board' : 'Discarded'}</strong>
                  </label>
                  <span className="ai-item-badges"><em className="ai-badge">{brief?.source === 'local' ? 'Needs confirmation' : 'AI suggestion'}</em><span>Item #{String(index + 1).padStart(2, '0')}</span></span>
                </div>
                <div className="ai-item-fields">
                  <input
                    className="ai-item-title"
                    value={item.title}
                    onChange={event => update(item.id, 'title', event.target.value)}
                    placeholder="Action item title"
                    aria-label={`Action item ${index + 1} title`}
                  />
                  <button
                    className="ai-delete"
                    onClick={() => (item.keep ? remove(item.id) : permanentlyDelete(item.id))}
                    aria-label={item.keep ? 'Discard item' : 'Permanently remove'}
                    title={item.keep ? 'Discard item' : 'Permanently remove'}
                  >
                    <Trash size={16} />
                  </button>
                  <textarea
                    value={item.description}
                    onChange={event => update(item.id, 'description', event.target.value)}
                    placeholder="Add a description or acceptance criteria…"
                    rows="2"
                  />
                  <div className="ai-item-grid">
                    <label>
                      <User size={14} />
                      <input
                        value={item.assignee}
                        onChange={event => update(item.id, 'assignee', event.target.value)}
                        placeholder={user?.name || 'Assignee'}
                      />
                    </label>
                    <label className="ai-date-field">
                      <input
                        type="date"
                        aria-label="Due date"
                        value={item.due}
                        onChange={event => update(item.id, 'due', event.target.value)}
                      />
                    </label>
                    <div className="ai-select-field">
                      <Flag size={14} />
                      <AppSelect
                        value={item.priority}
                        options={PRIORITIES}
                        onChange={val => update(item.id, 'priority', val)}
                        ariaLabel="Priority"
                      />
                    </div>
                    <div className="ai-select-field">
                      <Users size={14} />
                      <AppSelect
                        value={item.area}
                        options={AREAS}
                        onChange={val => update(item.id, 'area', val)}
                        ariaLabel="Area"
                      />
                    </div>
                  </div>
                </div>
              </article>
            ))}
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
