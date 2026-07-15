import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import '../assets/css/base.css';
import '../assets/css/layout.css';
import '../assets/css/components.css';
import '../assets/css/screens.css';
import './ui/app.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
