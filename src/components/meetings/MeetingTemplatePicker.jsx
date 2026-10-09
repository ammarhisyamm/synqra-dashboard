import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock, FileText } from '@phosphor-icons/react';
import { filterMeetingTemplates, meetingTemplate, TEMPLATE_DIVISIONS } from '../../lib/meeting-templates';
import { PageHeading, Empty, SelectField } from '../common/ui';
import { TextField } from '../common/Field';
import { Checkbox } from '../ui/checkbox';
import './meeting-templates.css';

export function MeetingTemplatePicker({ onUse, onCancel, currentId = 'general', replacing = false }) {
  const [query, setQuery] = useState('');
  const [division, setDivision] = useState('');
  const [selectedId, setSelectedId] = useState(currentId);
  const [approved, setApproved] = useState(false);
  const visible = useMemo(() => filterMeetingTemplates(query, division), [query, division]);
  const selected = meetingTemplate(selectedId) || meetingTemplate('general');
  return <section className="meeting-template-picker">
    <PageHeading title="Choose a meeting template" description="Preview the agenda before you start. Every section stays editable." action={<button type="button" className="text-button" onClick={onCancel}><ArrowLeft size={16}/> Back</button>}/>
    <div className="meeting-template-filters"><TextField label="Search templates" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. interview, sprint, budget"/><SelectField label="Division" value={division} onChange={setDivision} options={[{value:'', label:'All divisions'}, ...TEMPLATE_DIVISIONS.map(value => ({value,label:value}))]}/></div>
    <div className="meeting-template-layout">
      <div className="meeting-template-list" aria-label="Meeting templates">{visible.length ? visible.map(item => <button type="button" className={`meeting-template-option${selected.id === item.id ? ' selected' : ''}`} key={item.id} aria-pressed={selected.id === item.id} onClick={() => { setSelectedId(item.id); setApproved(false); }}><span><strong>{item.name}</strong><small>{item.division}{item.minutes ? ` · ${item.minutes} min suggested` : ''}</small><span>{item.description}</span></span>{selected.id === item.id && <Check size={18} aria-hidden="true"/>}</button>) : <Empty text="No matching templates. Try another search or division."/>}</div>
      <section className="meeting-template-preview" aria-label="Template preview"><header><FileText size={20}/><h2>{selected.name}</h2></header><p>{selected.description}</p>{selected.minutes > 0 && <p className="meeting-template-duration"><Clock size={14}/> Suggested duration: {selected.minutes} minutes</p>}<p className="meeting-template-help">This is guidance, not completed meeting notes. Write your own discussion and decisions in the editor.</p>
        {selected.sections.length ? selected.sections.map(part => <section className="meeting-template-section" key={part.title}><h3>{part.title}</h3><ul>{part.prompts.map(prompt => <li key={prompt}>{prompt}</li>)}</ul></section>) : <p>A blank document with no prefilled content.</p>}
        <div className="meeting-template-use">{replacing && <label className="template-replace-label"><Checkbox checked={approved} onCheckedChange={value => setApproved(value === true)} aria-label="Replace my current notes"/><span>Replace my current notes with this template. My existing notes will be removed.</span></label>}<button type="button" className="primary-button" disabled={replacing && !approved} onClick={() => onUse(selected)}>Use {selected.name}<ArrowRight size={16}/></button></div>
      </section>
    </div>
  </section>;
}
