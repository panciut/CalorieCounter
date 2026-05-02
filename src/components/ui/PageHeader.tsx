import type { ReactNode } from 'react';

interface PageHeaderProps {
  /** Small uppercase label rendered in accent color above the title (e.g. "Database", "Health"). */
  eyebrow?: string;
  /** Main title — rendered in serif italic. */
  title: ReactNode;
  /** Right-side content: action buttons, range picker, etc. */
  action?: ReactNode;
  /** Subtitle/description rendered below the title. */
  subtitle?: ReactNode;
  className?: string;
}

/**
 * Top-of-page header with eyebrow + serif italic title and optional right-aligned action(s).
 * Used across all pages for a consistent header style.
 */
export default function PageHeader({ eyebrow, title, action, subtitle, className = '' }: PageHeaderProps) {
  return (
    <div className={`flex items-center justify-between flex-wrap gap-3 ${className}`}>
      <div>
        {eyebrow && (
          <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-accent">
            {eyebrow}
          </div>
        )}
        <h1
          className="text-[22px] italic leading-tight text-text"
          style={{ fontFamily: 'var(--font-family-serif)' }}
        >
          {title}
        </h1>
        {subtitle != null && <p className="text-sm text-text-sec mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
