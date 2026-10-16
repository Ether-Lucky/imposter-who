import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/fonts.ts';
import '../styles/tokens.css';
import { HostApp } from './HostApp.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HostApp />
  </StrictMode>,
);
