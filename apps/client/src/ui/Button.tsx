import type { ButtonHTMLAttributes } from 'react';

type Tone = 'primary' | 'secondary' | 'danger' | 'ghost';

const TONES: Record<Tone, string> = {
  primary: 'bg-amber text-ticket-ink',
  secondary: 'bg-flap text-ink border border-ink/15',
  danger: 'bg-transparent text-red border border-red/60',
  ghost: 'bg-transparent text-ink-dim underline underline-offset-4',
};

/** Plain button with press feedback (04 §2.1). Visual world lands in M4. */
export function Button({
  tone = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type="button"
      {...props}
      className={`min-h-12 rounded-md px-4 font-bold tracking-wide uppercase transition-transform duration-150 ease-[var(--ease-out)] select-none active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber ${TONES[tone]} ${className}`}
    />
  );
}
