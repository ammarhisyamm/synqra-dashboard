import { createRoot } from 'react-dom/client';
// The marketing site is its own entry point, so none of the dashboard
// stylesheets load here and nothing in this folder can restyle the app.
import './website.css';
import { Website } from './Website';

createRoot(document.getElementById('root')).render(<Website />);
