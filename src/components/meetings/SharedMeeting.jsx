import { useEffect,useState } from 'react';
import { api } from '../../api/client';
import { Button } from '../ui/button';

export function SharedMeeting({token}) {
  const [meeting,setMeeting] = useState(null);const [error,setError] = useState('');const [revision,setRevision] = useState(0);
  useEffect(()=>{
    const controller=new AbortController();let disposed=false;setError('');setMeeting(null);
    api('/api/public/meetings/read',{method:'POST',body:JSON.stringify({token}),signal:controller.signal}).then(result=>{if(!disposed)setMeeting(result.meeting);}).catch(error=>{if(!disposed)setError(error.message);});
    return ()=>{disposed=true;controller.abort();};
  },[token,revision]);
  return <main className="min-h-dvh bg-background p-4 text-foreground sm:p-8">
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <a href="/" className="ui-focus-ring rounded-sm text-xl font-medium text-foreground no-underline hover:underline">Synqra</a>
        <span className="text-xs text-muted-foreground">Shared meeting · read-only snapshot</span>
      </header>
      {error ? <section className="grid gap-4 rounded-lg border border-border p-6">
        <h1 className="m-0 text-xl font-medium">Meeting unavailable</h1>
        <p role="alert" className="m-0 text-sm text-muted-foreground">{error}</p>
        <Button className="w-fit" onClick={()=>setRevision(value=>value+1)}>Try again</Button>
      </section> : !meeting ? <p className="m-0" role="status">Loading shared meeting…</p> : <>
        <div className="grid gap-2">
          <h1 className="m-0 break-words text-2xl font-medium text-balance">{meeting.title}</h1>
          <p className="m-0 text-sm text-muted-foreground">{meeting.date}</p>
        </div>
        {[['Summary',meeting.summary],['Notes',meeting.notes],['Transcript',meeting.transcript]].filter(([,text])=>text).map(([label,text])=>
          <section key={label} className="grid min-w-0 gap-4 rounded-lg border border-border bg-card p-4 sm:p-6">
            <h2 className="m-0 text-base font-medium">{label}</h2>
            <p className="m-0 whitespace-pre-wrap break-words text-sm leading-6 text-pretty">{text}</p>
          </section>
        )}
        <p className="m-0 text-xs text-muted-foreground">Only the content explicitly shared by the meeting owner is shown. Recordings remain private.</p>
      </>}
    </div>
  </main>;
}
