import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import { PlayApp } from './PlayApp.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlayApp />
  </StrictMode>,
);
