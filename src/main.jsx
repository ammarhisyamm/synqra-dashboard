import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import './styles/legacy.css';
import './design-system.css';
import './kanban-convergence.css';
import './baseline-ui.css';
import { App } from './App';
import { ErrorPanel } from './components/common/ErrorPanel';

createRoot(document.getElementById('root')).render(<ErrorPanel><App /></ErrorPanel>);
