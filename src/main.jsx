import { createRoot } from 'react-dom/client';
import { setNonce } from 'get-nonce';
import './styles/globals.css';
import './styles/legacy.css';
import './design-system.css';
import './kanban-convergence.css';
import './baseline-ui.css';
import { App } from './App';
import { ErrorPanel } from './components/common/ErrorPanel';
import { lazyRoute } from './lib/lazy-route';
import { Suspense } from 'react';

const SharedMeeting=lazyRoute(()=>import('./components/meetings/SharedMeeting'),'SharedMeeting','src/components/meetings/SharedMeeting.jsx');

// Radix's scroll-lock styles use the per-document nonce supplied by the Worker.
const nonce=document.querySelector('meta[name="synqra-style-nonce"]')?.content;
if(nonce)setNonce(nonce);
const shareToken=new URLSearchParams(window.location.hash.slice(1)).get('meeting-share');
createRoot(document.getElementById('root')).render(<ErrorPanel>{shareToken ? <Suspense fallback={<p role="status">Loading shared meeting…</p>}><SharedMeeting token={shareToken}/></Suspense> : <App />}</ErrorPanel>);
