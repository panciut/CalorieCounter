import { useState, useEffect, type ReactNode } from 'react';

interface CollapsibleSectionProps {
  /** Title shown in the header (e.g. "Energy"). */
  title: string;
  /** Optional caption under the title. */
  subtitle?: string;
  /** Optional summary shown when collapsed (e.g. "240 kcal · 8000 steps"). */
  summary?: ReactNode;
  /** Right-aligned action buttons; rendered only when expanded. */
  actions?: ReactNode;
  /** localStorage key for persisting open/closed state. */
  storageKey: string;
  /** Default state on first visit. */
  defaultCollapsed?: boolean;
  /** Bump this number to force the section open (used for programmatic auto-open, e.g. after a successful barcode lookup). */
  openSignal?: number;
  children: ReactNode;
}

export default function CollapsibleSection({
  title, subtitle, summary, actions,
  storageKey, defaultCollapsed = false, openSignal, children,
}: CollapsibleSectionProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v === '1') return true;
      if (v === '0') return false;
      return defaultCollapsed;
    } catch { return defaultCollapsed; }
  });

  function toggle() {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* */ }
      return next;
    });
  }

  // Force open when openSignal bumps (skipping the value the parent passes on mount)
  useEffect(() => {
    if (openSignal === undefined || openSignal === 0) return;
    setCollapsed(false);
    try { localStorage.setItem(storageKey, '0'); } catch { /* */ }
  }, [openSignal, storageKey]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className={`flex items-center gap-3 px-4 ${collapsed ? 'py-3' : 'pt-4 pb-2'}`}>
        <button
          onClick={toggle}
          aria-expanded={!collapsed}
          className="flex items-center gap-2 cursor-pointer group flex-1 min-w-0 text-left"
        >
          <span className={`text-text-sec text-xs transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}>▼</span>
          <h3 className="text-xs font-semibold text-text-sec uppercase tracking-wider group-hover:text-text transition-colors whitespace-nowrap">
            {title}
          </h3>
          {subtitle && !collapsed && (
            <span className="text-xs text-text-sec/70 truncate">· {subtitle}</span>
          )}
          {collapsed && summary && (
            <span className="text-xs text-text-sec truncate">· {summary}</span>
          )}
        </button>
        {!collapsed && actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {!collapsed && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}
