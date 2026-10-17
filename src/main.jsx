import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import './styles/legacy.css';
import './design-system.css';
import './kanban-convergence.css';
import './baseline-ui.css';
// Feature styles used by global surfaces (command palette, notifications,
// project dialogs). Loading them up front keeps those surfaces styled before
// a lazy route happens to import them, and fixes the cascade order.
import './workflow.css';
import './detail.css';
import './components/common/MultiCheckSelect.css';
import './components/kanban/kanban-workspace.css';
import './components/kanban/metadata.css';
// Final visual layer: tokens and component skin for the refreshed UI.
import './redesign.css';
import { App } from './App';
import { ErrorPanel } from './components/common/ErrorPanel';

createRoot(document.getElementById('root')).render(<ErrorPanel><App /></ErrorPanel>);
