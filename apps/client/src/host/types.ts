import type { Ack, HostView } from '@imposter-who/core';

export type Send = (event: string, payload?: unknown) => Promise<Ack>;

export interface HostScreenProps {
  view: HostView;
  offset: number;
  send: Send;
}
