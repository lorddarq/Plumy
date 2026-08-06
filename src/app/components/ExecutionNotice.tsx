import type { ReactNode } from 'react';
import { AlertTriangle, CircleAlert, Info } from 'lucide-react';

type ExecutionNoticeTone = 'info' | 'warning' | 'danger';

export function ExecutionNotice({ tone, title, children, assertive = false, nextStep, actionLabel, onAction }: { tone: ExecutionNoticeTone; title: string; children: ReactNode; assertive?: boolean; nextStep?: string; actionLabel?: string; onAction?: () => void }) {
  const Icon = tone === 'danger' ? CircleAlert : tone === 'warning' ? AlertTriangle : Info;
  const toneClass = tone === 'danger'
    ? 'border-red-200 bg-red-50 text-red-800'
    : tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : 'border-blue-200 bg-blue-50 text-blue-800';
  return <div role={assertive || tone === 'danger' ? 'alert' : 'status'} aria-live={assertive || tone === 'danger' ? 'assertive' : 'polite'} className={`flex items-start gap-2 rounded-xl border p-3 text-xs leading-5 ${toneClass}`}>
    <Icon className="mt-0.5 size-3.5 shrink-0" />
    <div className="min-w-0 flex-1"><div className="font-semibold">{title}</div><div className="mt-1">{children}</div>{nextStep && <div className="mt-2 border-t border-current/10 pt-2 text-[11px]"><span className="font-semibold">Next step:</span> {nextStep}</div>}{actionLabel && onAction && <button type="button" onClick={onAction} className="mt-2 rounded-md border border-current/20 bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-1">{actionLabel}</button>}</div>
  </div>;
}
