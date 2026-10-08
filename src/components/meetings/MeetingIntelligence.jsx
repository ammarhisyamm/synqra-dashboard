import { useEffect, useId, useState } from 'react';
import { ArrowsClockwise, Microphone, ShareNetwork, StopCircle, Sparkle, Copy } from '@phosphor-icons/react';
import { meetingsApi } from '../../api/meetings';
import { ActionDialog, Modal, SelectField } from '../common/ui';
import { TextField, TextAreaField } from '../common/Field';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { localToday } from '../../lib/dates';

const stateLabels = { requested:'Bot requested',joining:'Joining meeting',awaiting_admission:'Waiting for host admission',active:'Recording & transcribing',needs_human_help:'Host action needed',stopping:'Finishing recording',completed:'Capture completed',failed:'Capture failed',connection_unknown:'Bot request not confirmed' };
const ongoing = status => status && !['completed','failed'].includes(status);
const stamp = seconds => `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
function CheckField({ checked, onChange, children, disabled=false }) {
  const id = useId();
  return <div className="flex items-start gap-3"><Checkbox id={id} className="mt-1" checked={checked} disabled={disabled} onCheckedChange={value=>onChange(value===true)}/><label htmlFor={id} className="min-w-0 text-sm leading-6 text-pretty">{children}</label></div>;
}
export function OnlineMeetingModal({ onClose,onSave }) {
  const [form,setForm] = useState({title:'',date:localToday(),notes:'',ai:false});
  const [pending,setPending] = useState(false); const [error,setError] = useState('');
  const submit = async event => {
    event.preventDefault(); if(pending || !form.title.trim())return;
    setPending(true);setError('');
    try { await onSave(form); } catch(error){setError(error.message);} finally {setPending(false);}
  };
  return <Modal title="Online meeting" subtitle="Save the meeting first, then connect a Zoom or Google Meet notetaker from its details." pending={pending} onClose={onClose}>
    <form className="grid gap-4" onSubmit={submit}>
      <TextField label="Meeting title" autoFocus required maxLength={200} value={form.title} onChange={event=>setForm({...form,title:event.target.value})} placeholder="e.g. Weekly product sync"/>
      <TextField label="Meeting date" type="date" required value={form.date} onChange={event=>setForm({...form,date:event.target.value})}/>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button><Button disabled={pending || !form.title.trim()}>{pending?'Saving…':'Save meeting'}</Button></div>
    </form>
  </Modal>;
}
export function MeetingIntelligence({ meeting,readOnly=false,isAdmin=false,onToast,onMeetingUpdated }) {
  const [data,setData] = useState(null); const [loading,setLoading] = useState(true); const [error,setError] = useState('');
  const [pending,setPending] = useState(''); const [joinOpen,setJoinOpen] = useState(false); const [shareOpen,setShareOpen] = useState(false);
  const [url,setUrl] = useState(''); const [language,setLanguage] = useState('id'); const [consent,setConsent] = useState(false);
  const [summary,setSummary] = useState(''); const [dirty,setDirty] = useState(false); const [editingNotes,setEditingNotes] = useState(false);
  const [notes,setNotes] = useState(meeting.notes || ''); const [providerMeetingId,setProviderMeetingId] = useState('');
  const [revision,setRevision] = useState(0); const [confirm,setConfirm] = useState(null);
  useEffect(()=>{
    const controller = new AbortController(); let disposed=false;
    setLoading(true);
    meetingsApi.capture(meeting.id,controller.signal).then(result=>{if(!disposed){setData(result);setSummary(result.summary || '');setError('');}})
      .catch(error=>{if(!disposed && error.name!=='AbortError')setError(error.message);}).finally(()=>{if(!disposed)setLoading(false);});
    return ()=>{disposed=true;controller.abort();};
  },[meeting.id,revision]);
  // Read-only status refresh. Capture/transcript reconciliation happens durably on the backend cron.
  useEffect(()=>{
    if(!ongoing(data?.capture?.status))return;
    const controller = new AbortController(); let disposed=false;
    const timer = setInterval(()=>{
      if(document.hidden || pending)return;
      meetingsApi.capture(meeting.id,controller.signal).then(result=>{if(!disposed){setData(result);if(!dirty)setSummary(result.summary || '');}}).catch(()=>{});
    },30000);
    return ()=>{disposed=true;clearInterval(timer);controller.abort();};
  },[meeting.id,data?.capture?.status,pending,dirty]);
  const run = async (name,operation) => {
    if(pending)return;setPending(name);setError('');
    try {
      const result = await operation(); if(result?.configured!==undefined){setData(result);if(!dirty || ['save-summary','summarize'].includes(name))setSummary(result.summary || '');}
      return result;
    } catch(error){setError(error.message);return null;} finally{setPending('');}
  };
  const capture = data?.capture;
  const start = async event => {
    event.preventDefault();
    const result = await run('start',()=>meetingsApi.start(meeting.id,{meetingUrl:url,language,consent}));
    if(result){setJoinOpen(false);setConsent(false);onToast('Bot requested. Admit Synqra Notetaker when it appears in the meeting.');}
    else {const saved = await meetingsApi.capture(meeting.id).catch(()=>null);if(saved)setData(saved);}
  };
  const saveNotes = async()=>{
    const result = await run('notes',()=>meetingsApi.update(meeting.id,{notes}));
    if(result){onMeetingUpdated?.(result);setEditingNotes(false);onToast('Meeting notes saved');}
  };
  if(loading)return <div className="border-t border-border p-6 text-sm text-muted-foreground" role="status">Loading meeting workspace…</div>;
  return <section className="min-w-0 border-t border-border p-4 sm:p-6" aria-label="Meeting intelligence">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><h3 className="text-base font-medium text-balance">Notetaker & meeting workspace</h3><p className="mt-1 text-sm text-muted-foreground text-pretty">Zoom and Google Meet · saved notes, transcript, recording and summary</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={!data || readOnly || !!pending} onClick={()=>{setError('');setShareOpen(true);}}><ShareNetwork size={16}/>Share</Button><Button variant="secondary" disabled={!data || readOnly || !!pending} onClick={()=>{setNotes(meeting.notes || '');setEditingNotes(value=>!value);}}>Edit notes</Button></div>
    </div>
    {!data && error && <Button className="mb-4" variant="secondary" onClick={()=>setRevision(value=>value+1)}>Retry workspace</Button>}
    {data && !data.configured && <div className="mb-4 rounded-lg border border-border bg-muted p-4 text-sm leading-6 text-pretty"><strong className="font-medium">Notetaker server not connected.</strong> Meeting notes and sharing work now. To send a recording bot, connect the free self-hosted Vexa server. No paid bot service is enabled.</div>}
    {capture && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted p-4">
      <div className="flex min-w-0 items-center gap-2 text-sm"><Microphone size={16}/><span role="status">{stateLabels[capture.status] || 'Status unavailable'}</span></div>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={readOnly || !!pending || !data?.configured || capture.status==='connection_unknown'} onClick={()=>run('sync',()=>meetingsApi.sync(meeting.id))}><ArrowsClockwise size={16}/>{pending==='sync'?'Syncing…':'Sync now'}</Button>{ongoing(capture.status) && <Button variant="destructive" disabled={readOnly || !!pending || !data?.configured || capture.status==='connection_unknown'} onClick={()=>setConfirm({title:'Stop meeting bot?',subtitle:'Recording will end. The saved transcript and recording remain available after synchronization.',danger:true,confirmLabel:'Stop bot',onConfirm:()=>run('stop',()=>meetingsApi.stop(meeting.id))})}><StopCircle size={16}/>{pending==='stop'?'Stopping…':'Stop bot'}</Button>}</div>
    </div>}
    {capture?.errorCode && <p className="mb-4 text-sm text-destructive text-pretty" role="status">{capture.status==='connection_unknown'?'The bot request was not confirmed. Do not send another bot; ask an admin to reconnect its Vexa meeting ID.':'The last capture request or sync failed. Saved notes and transcripts are kept. Retry Sync now when the server is available.'}</p>}
    {isAdmin && capture?.status==='connection_unknown' && <div className="mb-4 grid gap-3"><TextField label="Vexa meeting ID" value={providerMeetingId} onChange={event=>setProviderMeetingId(event.target.value)} placeholder="e.g. 42" hint="Verify the bot on the Vexa server first. Only the matching session can be reconnected."/><Button variant="secondary" disabled={!!pending || !providerMeetingId} onClick={()=>run('reconcile',()=>meetingsApi.reconcile(meeting.id,providerMeetingId))}>Reconnect confirmed session</Button></div>}
    {(!capture || (capture.status==='failed' && capture.errorCode==='start_failed')) && <Button className="mb-4" disabled={readOnly || !data?.configured || !!pending} onClick={()=>{setError('');setJoinOpen(true);}}><Microphone size={16}/>Send notetaker</Button>}
    {editingNotes && <div className="mb-6 grid gap-3"><TextAreaField label="Meeting notes" rows={6} maxLength={5000} value={notes} onChange={event=>setNotes(event.target.value)}/><div className="flex justify-end gap-2"><Button variant="ghost" disabled={!!pending} onClick={()=>setEditingNotes(false)}>Cancel</Button><Button disabled={!!pending} onClick={saveNotes}>{pending==='notes'?'Saving…':'Save notes'}</Button></div></div>}
    {error && !joinOpen && <p className="mb-4 text-sm text-destructive text-pretty" role="alert">{error}</p>}
    <Tabs defaultValue="summary">
      <TabsList className="mb-4 flex w-fit max-w-full flex-wrap"><TabsTrigger value="summary">Summary</TabsTrigger><TabsTrigger value="transcript">Transcript</TabsTrigger><TabsTrigger value="recordings">Recordings</TabsTrigger></TabsList>
      <TabsContent value="summary" className="grid min-w-0 gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground text-pretty">{dirty?'Save your changes before generating a new summary.':capture?.summarySource==='local-ai'?'Generated with your self-hosted AI model. Review before sharing.':data?.localAiConfigured?'Summaries use your self-hosted AI model.':'Free extractive summary; not an AI-generated analysis. Connect local Ollama for AI summaries.'}</p><Button variant="secondary" disabled={readOnly || dirty || !!pending || !data || (!capture?.transcript && !meeting.notes)} onClick={()=>setConfirm({title:'Generate a new summary?',subtitle:'This replaces the saved summary with a new draft. Review the result before sharing.',confirmLabel:'Generate summary',onConfirm:()=>run('summarize',()=>meetingsApi.summarize(meeting.id)).then(result=>{if(result){setDirty(false);onToast(result.generated?.fallback?'Local AI was unavailable; an extractive draft was saved.':'Summary saved');}})})}><Sparkle size={16}/>{pending==='summarize'?'Preparing…':'Generate summary'}</Button></div>
        <TextAreaField label="Meeting summary" rows={6} maxLength={4000} readOnly={readOnly} value={summary} onChange={event=>{setSummary(event.target.value);setDirty(true);}} placeholder="Generate a summary or write your own…"/>
        {!readOnly && <div className="flex justify-end"><Button disabled={!dirty || !!pending} onClick={()=>run('save-summary',()=>meetingsApi.saveSummary(meeting.id,summary)).then(result=>{if(result){setDirty(false);onToast('Summary saved');}})}>{pending==='save-summary'?'Saving…':'Save summary'}</Button></div>}
        {!!capture?.summary?.keyPoints?.length && <div><h4 className="mb-2 text-sm font-medium">Key points</h4><ul className="list-disc space-y-2 pl-4 text-sm leading-6">{capture.summary.keyPoints.map((point,index)=><li className="break-words" key={index}>{point}</li>)}</ul></div>}
        {!!capture?.summary?.actionItems?.length && <div><h4 className="mb-2 text-sm font-medium">Suggested follow-ups</h4><p className="mb-2 text-xs text-muted-foreground">Suggestions only. No tasks were automatically created.</p><ul className="list-disc space-y-2 pl-4 text-sm leading-6">{capture.summary.actionItems.map((point,index)=><li className="break-words" key={index}>{point}</li>)}</ul></div>}
      </TabsContent>
      <TabsContent value="transcript"><div className="max-h-96 overflow-y-auto rounded-lg border border-border">{capture?.segments?.length ? <ol className="divide-y divide-border">{capture.segments.map((segment,index)=><li key={index} className="grid min-w-0 gap-2 p-4"><div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><time className="tabular-nums">{stamp(segment.start)}</time><span>{segment.speaker}</span></div><p className="whitespace-pre-wrap break-words text-sm leading-6 text-pretty">{segment.text}</p></li>)}</ol> : <p className="p-4 text-sm text-muted-foreground">No transcript yet. Start the bot, admit it to the meeting, then sync the captured conversation.</p>}</div></TabsContent>
      <TabsContent value="recordings"><div className="grid gap-4">{capture?.recordings?.length ? capture.recordings.map(recording=><div key={recording.id+'-'+recording.type} className="grid min-w-0 gap-3 rounded-lg border border-border p-4"><p className="text-sm font-medium">{recording.type==='video'?'Video recording':'Audio recording'}</p>{recording.type==='video'?<video className="w-full rounded-lg bg-muted" controls preload="none" src={`/api/meetings/${meeting.id}/recording/${recording.id}?type=video`}/>:<audio className="w-full" controls preload="none" src={`/api/meetings/${meeting.id}/recording/${recording.id}?type=audio`}/>}<p className="text-xs text-muted-foreground">Private · project access required. Stored on your Vexa server.</p></div>):<p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">No recording yet. Recordings appear after capture and synchronization; playback requires the Vexa server to remain available.</p>}</div></TabsContent>
    </Tabs>
    {joinOpen && <Modal title="Send meeting notetaker" subtitle="The visible Synqra bot records and transcribes after the host admits it." pending={!!pending} onClose={()=>setJoinOpen(false)}>
      <form className="grid gap-4" onSubmit={start}><TextField label="Google Meet or Zoom link" type="url" required autoFocus maxLength={2048} value={url} onChange={event=>setUrl(event.target.value)} placeholder="https://meet.google.com/abc-defg-hij"/><SelectField label="Transcript language" value={language} options={[{value:'id',label:'Bahasa Indonesia'},{value:'en',label:'English'}]} onChange={setLanguage}/><CheckField checked={consent} onChange={setConsent} disabled={!!pending}>Participants have been informed and recording this meeting is permitted.</CheckField><p className="text-xs leading-5 text-muted-foreground">The host may need to admit the bot. Restricted meetings or recording permissions can prevent capture. No bot is sent until you confirm.</p>{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" type="button" disabled={!!pending} onClick={()=>setJoinOpen(false)}>Cancel</Button><Button disabled={!consent || !url || !!pending}>{pending==='start'?'Sending…':'Send bot'}</Button></div></form>
    </Modal>}
    {shareOpen && <MeetingShare errorMessage={error} shares={data?.shares || []} pending={!!pending} onClose={()=>setShareOpen(false)} onRevoke={shareId=>{setShareOpen(false);setConfirm({title:'Revoke meeting link?',subtitle:'Anyone using this link will lose access. You can create a new link later.',danger:true,confirmLabel:'Revoke link',onConfirm:()=>run('revoke',async()=>{await meetingsApi.revoke(meeting.id,shareId);return meetingsApi.capture(meeting.id);})});}} onCreate={body=>run('share',()=>meetingsApi.share(meeting.id,body))} onCreated={()=>meetingsApi.capture(meeting.id).then(setData).catch(()=>{})}/ >}
    {confirm && <ActionDialog dialog={confirm} onClose={()=>setConfirm(null)}/>}
  </section>;
}
function MeetingShare({shares,pending,onClose,onCreate,onCreated,onRevoke,errorMessage}) {
  const [days,setDays] = useState('7');const [transcript,setTranscript] = useState(false);const [consent,setConsent] = useState(false);const [link,setLink] = useState('');const [error,setError] = useState('');const [copied,setCopied] = useState(false);
  const create=async event=>{event.preventDefault();setError('');const result=await onCreate({days:Number(days),includeTranscript:transcript,confirmPublic:consent});if(result){setLink(result.shareUrl);onCreated();}else setError('Could not create a share link. Check your connection or revoke an older link, then retry.');};
  return <Modal title="Share meeting" subtitle="Create a read-only snapshot. Future edits do not change an existing link." pending={pending} onClose={onClose}>
    <form className="grid gap-4" onSubmit={create}><p className="text-sm text-muted-foreground text-pretty">The link includes the saved title, date, notes and summary. Recordings, join links and participant details remain private.</p><SelectField label="Link expires after" value={days} options={[{value:'1',label:'1 day'},{value:'7',label:'7 days'},{value:'30',label:'30 days'}]} onChange={setDays}/><CheckField checked={transcript} onChange={setTranscript}>Include the saved transcript</CheckField><CheckField checked={consent} onChange={setConsent}>I understand that anyone with this link can read this snapshot, including people outside this project.</CheckField>{(errorMessage || error) && <p className="text-sm text-destructive" role="alert">{errorMessage || error}</p>}{link && <div className="grid gap-3"><TextField label="Share link" readOnly value={link}/><Button type="button" variant="secondary" onClick={()=>navigator.clipboard.writeText(link).then(()=>setCopied(true)).catch(()=>setError('Select and copy the link manually.'))}><Copy size={16}/>{copied?'Copied':'Copy link'}</Button></div>}<Button disabled={pending || !consent}>{pending?'Creating…':'Create share link'}</Button></form>
    {!!shares.length && <div className="mt-6 grid gap-3 border-t border-border pt-4"><h3 className="text-sm font-medium">Active links</h3>{shares.map(share=><div key={share.id} className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">Expires {share.expiresAt} UTC</span><Button variant="destructive" size="sm" disabled={pending} onClick={()=>onRevoke(share.id)}>Revoke link</Button></div>)}</div>}
  </Modal>;
}
