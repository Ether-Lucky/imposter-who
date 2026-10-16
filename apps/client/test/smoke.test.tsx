import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HostApp } from '../src/host/HostApp.tsx';
import { PlayApp } from '../src/play/PlayApp.tsx';

describe('client smoke', () => {
  it('renders the host display shell', () => {
    expect(renderToString(<HostApp />)).toContain('Imposter Who?');
  });

  it('renders the controller shell', () => {
    expect(renderToString(<PlayApp />)).toContain('Waiting for departure');
  });
});
