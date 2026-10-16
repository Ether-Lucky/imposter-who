import type { ReactNode } from 'react';

/**
 * An error message: bold, in the surrounding text colour, marked by a red bar. Red text
 * at body size misses AA contrast on both the board and the ticket (REQ-UX-7), and the
 * bar plus the words keep the state from resting on colour alone (REQ-UX-6).
 */
export function ErrorText({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p role="alert" className={`border-l-4 border-red pl-3 text-left font-bold ${className}`}>
      {children}
    </p>
  );
}
