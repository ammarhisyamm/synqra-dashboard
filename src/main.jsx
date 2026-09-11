import { createRoot } from 'react-dom/client';
import './styles.css';
import './detail.css';
import './detail-overrides.css';
import './fixes.css';
import './workflow.css';
import './design-system.css';
import './baseline-ui.css';
import './kanban-convergence.css';
import { App } from './App';
import { ErrorPanel } from './components/common/ErrorPanel';

createRoot(document.getElementById('root')).render(<ErrorPanel><App /></ErrorPanel>);
