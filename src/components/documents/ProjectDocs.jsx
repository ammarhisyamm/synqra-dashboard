import { useEffect, useMemo, useState } from 'react';
import { Archive, ArrowCounterClockwise, DownloadSimple, FileText, Plus } from '@phosphor-icons/react';
import { documentsApi } from '../../api/documents';
import { PageHeading, SelectField, Empty, Modal } from '../common/ui';
import { TextField, TextAreaField } from '../common/Field';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import './documents.css';

const types = [{value:'general',label:'General'}, {value:'prd',label:'Product requirements'}, {value:'retrospective',label:'Retrospective'}, {value:'meeting-notes',label:'Meeting notes'}, {value:'runbook',label:'Runbook'}];
const fieldsOf = doc => ({title:doc.title, type:doc.type, content:doc.content, epicId:doc.epicId || '', sprintId:doc.sprintId || ''});
const changed = (draft, doc) => !!draft && !!doc && JSON.stringify(draft) !== JSON.stringify(fieldsOf(doc));

// A deliberately small Markdown subset. React escapes all content; raw HTML and
// link syntax stay text, so project notes cannot execute scripts or unsafe URLs.
export function DocumentPreview({content}) {
  if (!content.trim()) return <Empty text="No content yet. Add notes in the editor."/>;
  return <div className="document-preview">{content.split('\n').map((line,index) => {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { const Heading = `h${heading[1].length + 1}`; return <Heading key={index}>{heading[2]}</Heading>; }
    if (/^\s*[-*]\s/.test(line)) return <p className="document-bullet" key={index}><span aria-hidden="true">•</span>{line.replace(/^\s*[-*]\s/,'')}</p>;
    if (line.startsWith('>')) return <blockquote key={index}>{line.slice(1).trim()}</blockquote>;
    return line.trim() ? <p key={index}>{line}</p> : <div className="document-paragraph-gap" key={index}/>;
  })}</div>;
}

export function ProjectDocs({projectId, user, readOnly = false, metadata = [], sprints = [], requestConfirm}) {
  const draftKey = `synqra-doc-draft:${user.id}:${projectId}`;
  const [documents,setDocuments] = useState([]);
  const [selected,setSelected] = useState(null);
  const [draft,setDraft] = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [refresh,setRefresh] = useState(0);
  const [pending,setPending] = useState(false);
  const [query,setQuery] = useState('');
  const [type,setType] = useState('');
  const [archived,setArchived] = useState(false);
  const [preview,setPreview] = useState(readOnly);
  const [creating,setCreating] = useState(false);
  const [newDoc,setNewDoc] = useState(() => ({id:crypto.randomUUID(),title:'',type:'general'}));
  const dirty = changed(draft,selected);
  const visible = useMemo(() => documents.filter(doc => !!doc.archived === archived && (!type || doc.type === type) && doc.title.toLowerCase().includes(query.toLowerCase())),[documents,archived,type,query]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    documentsApi.list(projectId,controller.signal).then(result => {
      setDocuments(result.documents);
      let restored;
      try { restored = JSON.parse(localStorage.getItem(draftKey)); } catch {}
      const saved = restored && result.documents.find(doc => doc.id === restored.document?.id);
      if (saved && !readOnly && restored.draft && typeof restored.draft.content === 'string' && typeof restored.draft.title === 'string') {
        setSelected({...saved,version:restored.document.version}); setDraft({...fieldsOf(saved),...restored.draft}); setArchived(!!saved.archived);
        setNotice(saved.version === restored.document.version ? 'Your unsaved draft was restored on this device.' : 'A newer version exists. Download your draft, then reload the latest version before editing.');
      } else { setSelected(null); setDraft(null); }
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  },[projectId,draftKey,readOnly,refresh]);

  useEffect(() => {
    if (loading || readOnly) return;
    try {
      if (dirty) localStorage.setItem(draftKey,JSON.stringify({document:{id:selected.id,version:selected.version},draft}));
      else localStorage.removeItem(draftKey);
    } catch { if (dirty) setNotice('Device draft storage is unavailable. Save or download before leaving this page.'); }
  },[draft,selected,dirty,draftKey,loading,readOnly]);
  useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload',warn);
    return () => window.removeEventListener('beforeunload',warn);
  },[dirty]);

  const guarded = action => {
    if (pending) return;
    if (!dirty) { action(); return; }
    requestConfirm({title:'Discard unsaved document edits?',subtitle:'Download your draft or save it before switching. Continuing removes the device draft.',confirmLabel:'Discard edits',onConfirm:() => { try { localStorage.removeItem(draftKey); } catch {} action(); }});
  };
  const choose = doc => guarded(() => { setSelected(doc); setDraft(fieldsOf(doc)); setError(''); setNotice(''); setPreview(readOnly || !!doc.archived); });
  const replace = saved => { setDocuments(previous => [saved,...previous.filter(doc => doc.id !== saved.id)]); setSelected(saved); setDraft(fieldsOf(saved)); setError(''); };
  const save = async archiveValue => {
    if (pending || readOnly || !selected || !draft.title.trim()) return;
    setPending(true); setError(''); setNotice('');
    try {
      const saved = await documentsApi.update(selected.id,{...draft,version:selected.version,...(archiveValue != null ? {archived:archiveValue} : {})});
      replace(saved); setArchived(!!saved.archived); setNotice(archiveValue == null ? 'Document saved.' : archiveValue ? 'Document archived.' : 'Document restored.');
    } catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  };
  const create = async event => {
    event.preventDefault(); if (pending || !newDoc.title.trim()) return;
    setPending(true); setError('');
    try { const saved = await documentsApi.create({...newDoc,projectId,content:''}); replace(saved); setArchived(false); setCreating(false); setNewDoc({id:crypto.randomUUID(),title:'',type:'general'}); setQuery(''); setType(''); setPreview(false); }
    catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([`# ${draft.title}\n\n${draft.content}`],{type:'text/markdown;charset=utf-8'}));
    const link = document.createElement('a'); link.href=url; link.download=`${draft.title.replace(/[^\p{L}\p{N}\s_-]/gu,'').slice(0,80) || 'document'}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  };
  const update = (key,value) => setDraft(previous => ({...previous,[key]:value}));
  const relationOptions = (items,value,empty) => [{value:'',label:empty},...items.map(item => ({value:item.id,label:item.name})),...(value && !items.some(item => item.id === value) ? [{value,label:'Previously linked item'}] : [])];

  return <section className="page project-docs-page">
    <PageHeading title="Project Docs" description="Project knowledge, requirements, retrospectives, and runbooks. Visible only to people with project access." action={<><Button variant="outline" disabled={pending} onClick={() => guarded(() => { setSelected(null); setDraft(null); setRefresh(value => value + 1); })}><ArrowCounterClockwise size={16}/> Reload latest</Button><Button disabled={readOnly || pending || loading} onClick={() => guarded(() => { setSelected(null); setDraft(null); setError(''); setCreating(true); })}><Plus size={16}/> New document</Button></>}/>
    {notice && <p className="document-notice" role="status">{notice}</p>}
    {error && !creating && <p className="form-error" role="alert">{error}</p>}
    {loading ? <Empty text="Loading project documents…"/> : <div className="project-docs-layout">
      <aside className="project-docs-list" aria-label="Project documents"><TextField label="Search documents" value={query} onChange={event => setQuery(event.target.value)}/><SelectField label="Document type" value={type} onChange={setType} options={[{value:'',label:'All types'},...types]}/><label className="document-archive-filter"><Checkbox checked={archived} onCheckedChange={value => setArchived(value === true)} aria-label="Show archived"/><span>Show archived</span></label>
        <div className="document-list-items">{visible.length ? visible.map(doc => <button className={`document-list-item${selected?.id === doc.id ? ' selected' : ''}`} type="button" key={doc.id} disabled={pending} aria-pressed={selected?.id === doc.id} onClick={() => choose(doc)}><FileText size={18}/><span><strong>{doc.title}</strong><small>{types.find(item => item.value === doc.type)?.label} · v{doc.version}</small></span></button>) : <Empty text={archived ? 'No archived documents.' : 'No matching documents. Create one or adjust the filters.'}/>}</div>
      </aside>
      <section className="project-docs-editor" aria-label="Document workspace">{selected && draft ? <><div className="document-toolbar"><span>{dirty ? 'Unsaved changes · device draft' : `Version ${selected.version}`}{selected.archived ? ' · Archived' : ''}</span><div><Button variant="outline" onClick={download}><DownloadSimple size={16}/> Download</Button>{!readOnly && !selected.archived && <Button variant="outline" aria-pressed={preview} onClick={() => setPreview(value => !value)}>{preview ? 'Edit document' : 'Preview'}</Button>}<Button disabled={readOnly || pending || !draft.title.trim() || (!dirty && !selected.archived)} onClick={() => save(selected.archived ? false : null)}>{pending ? 'Saving…' : selected.archived ? 'Restore document' : 'Save document'}</Button></div></div>
        <fieldset disabled={readOnly || pending || !!selected.archived}><TextField label="Document title" maxLength={200} value={draft.title} onChange={event => update('title',event.target.value)}/><div className="document-properties"><SelectField label="Type" value={draft.type} onChange={value => update('type',value)} options={types}/><SelectField label="Epic" value={draft.epicId} onChange={value => update('epicId',value)} options={relationOptions(metadata.filter(item => item.type === 'epic' && !item.archived),draft.epicId,'No epic')}/><SelectField label="Sprint" value={draft.sprintId} onChange={value => update('sprintId',value)} options={relationOptions(sprints,draft.sprintId,'No sprint')}/></div></fieldset>
        {preview || readOnly || selected.archived ? <DocumentPreview content={draft.content}/> : <TextAreaField label="Document content" hint="Markdown headings, bullets, and quotes are supported. Raw HTML and links display as text. Maximum 20,000 characters." rows={16} maxLength={20000} disabled={pending} value={draft.content} onChange={event => update('content',event.target.value)}/>}
        {!readOnly && !selected.archived && <div className="document-footer"><Button variant="outline" disabled={pending} onClick={() => requestConfirm({title:'Archive document?',subtitle:dirty ? 'Your current edits will be saved and archived. You can restore this document later.' : 'The document will move to Archived. It can be restored later.',confirmLabel:'Archive document',onConfirm:async () => { await save(true); }})}><Archive size={16}/> Archive document</Button></div>}
      </> : <Empty text="Choose a document to read or edit, or create a new document."/>}</section>
    </div>}
    {creating && <Modal title="New document" subtitle="Start a document in the current project." pending={pending} onClose={() => { setCreating(false); setError(''); }}><form className="document-create-form" onSubmit={create}><TextField label="Document title" autoFocus required maxLength={200} disabled={pending} value={newDoc.title} onChange={event => setNewDoc(previous => ({...previous,id:crypto.randomUUID(),title:event.target.value}))}/><SelectField label="Type" value={newDoc.type} disabled={pending} options={types} onChange={value => setNewDoc(previous => ({...previous,id:crypto.randomUUID(),type:value}))}/>{error && <p className="form-error" role="alert">{error}</p>}<div className="document-create-actions"><Button type="button" variant="ghost" disabled={pending} onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" disabled={pending || !newDoc.title.trim()}>{pending ? 'Creating…' : 'Create document'}</Button></div></form></Modal>}
  </section>;
}
