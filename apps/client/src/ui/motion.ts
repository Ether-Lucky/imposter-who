import { useContext } from 'react';
import { FlapMotion, usePrefersReducedMotion } from '../flap/Flap.tsx';

/** Reduced motion: forced by the host setting (via FlapMotion), else the OS (REQ-UX-2). */
export function useReducedMotion(): boolean {
  const forced = useContext(FlapMotion).reduced;
  const prefers = usePrefersReducedMotion();
  return forced ?? prefers;
}
