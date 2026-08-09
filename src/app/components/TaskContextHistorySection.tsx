import { useState } from 'react';
import { EmptyStateCard } from './EmptyStateCard';
import { Button } from '@/app/components/ui/button';
import { Textarea } from '@/app/components/ui/textarea';
import { useTaskContextHistory, type TaskContextSourceResult } from '../hooks/useTaskContextHistory';

interface TaskContextHistorySectionProps { taskId?: string; expectedRevision?: number; }

const provenanceLabels = {
  'system-derived': 'System generated',
  'human-authored': 'Human authored',
  'agent-authored': 'Agent authored',
} as const;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function sourceLabel(source: TaskContextSourceResult): string {
  if (source.status === 'missing') return `${source.ref.type} source is no longer available`;
  if (source.status === 'inaccessible') return `${source.ref.type} source is inaccessible`;
  const record = source.record || {};
  const content = [record.content, record.message, record.name, record.id]
    .find(value => typeof value === 'string' && value.trim());
  return typeof content === 'string' ? content : `${source.ref.type} source resolved`;
}

export function TaskContextHistorySection({ taskId, expectedRevision = 0 }: TaskContextHistorySectionProps) {
  const history = useTaskContextHistory(taskId, expectedRevision);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [summary, setSummary] = useState('');

  const handleAppend = async () => {
    if (!summary.trim()) return;
    if (await history.appendCheckpoint(summary)) {
      setSummary('');
      setIsComposerOpen(false);
    }
  };

  return (
    <section
      id="task-context-history"
      data-anchored-panel-section="task-context-history"
      aria-labelledby="task-context-history-title"
      className="min-w-0 scroll-mt-8 space-y-6"
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <h3 id="task-context-history-title" className="text-sm font-semibold leading-5 text-[#71717a]">
            Context History
          </h3>
          <Button
            type="button"
            variant="link"
            onClick={() => setIsComposerOpen(value => !value)}
            aria-expanded={isComposerOpen}
            aria-controls="task-context-checkpoint-composer"
          >
            Add Checkpoint
          </Button>
        </div>
        <p className="text-xs leading-4 text-[#71717a]">
          Meaningful history is summarized here. Current task fields and acceptance gates remain authoritative.
        </p>
      </div>

      {isComposerOpen && (
        <div id="task-context-checkpoint-composer" className="overflow-hidden rounded-[18px] border border-black/[0.08] bg-white shadow-[0_1px_2px_-1px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.06)]">
          <label htmlFor="task-context-summary" className="sr-only">Decision or handoff summary</label>
          <Textarea
            id="task-context-summary"
            value={summary}
            onChange={event => setSummary(event.target.value)}
            placeholder="Decision or handoff summary"
            className="min-h-[76px] resize-none rounded-none border-0 bg-white px-4 py-4 text-sm leading-5 shadow-none focus-visible:border-transparent focus-visible:ring-0"
          />
          <div className="flex min-h-[52px] items-center justify-end border-t border-[#71717a]/10 px-4 py-3">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleAppend}
            disabled={!summary.trim() || history.isAppending}
          >
              {history.isAppending ? 'Saving…' : 'Save checkpoint'}
            </Button>
          </div>
        </div>
      )}

      <div aria-live="polite">
        {history.state === 'loading' && history.entries.length === 0 && <div className="rounded-[14px] border border-black/[0.06] px-4 py-5 text-sm text-[#71717a]">Loading context history…</div>}
        {history.state === 'unavailable' && <EmptyStateCard compact title="Context history unavailable" description="Open this workspace in the Omvra desktop app to retrieve task context." />}
        {history.state === 'error' && <div className="rounded-[14px] border border-[#dc2626]/20 bg-[#dc2626]/[0.03] px-4 py-4 text-sm text-[#991b1b]">{history.error}<button type="button" onClick={() => void history.refresh()} className="ml-2 font-semibold underline underline-offset-2">Retry</button></div>}
        {history.state === 'ready' && history.entries.length === 0 && <EmptyStateCard compact title="No meaningful history yet" description="Routine comments, time logs, attachments, and scheduling edits do not create checkpoints." />}
      </div>

      {history.entries.length > 0 && (
        <div className="space-y-6">
          {history.entries.map((entry, index) => {
            const expanded = history.selectedEntryId === entry.id;
            const detailId = `task-context-detail-${entry.id}`;
            const dateLabel = formatDate(entry.createdAt);
            const showDate = index === 0 || formatDate(history.entries[index - 1].createdAt) !== dateLabel;
            return (
              <div key={entry.id} className="space-y-3">
                {showDate && <p className="text-xs leading-4 text-[#71717a]">{dateLabel}</p>}
                <div className="overflow-hidden rounded-xl border border-black/[0.05] bg-[#fcfbf7] shadow-[0_1px_2px_rgba(0,0,0,0.10)]">
                  <button type="button" onClick={() => void history.selectEntry(entry.id)} aria-expanded={expanded} aria-controls={detailId} className="block w-full px-4 py-4 text-left hover:bg-black/[0.015] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a60cb]/30">
                    <span className="block whitespace-pre-wrap break-words text-xs font-normal leading-4 text-[#71717a] [overflow-wrap:anywhere]">{entry.summary}</span>
                    <span className="mt-2 block text-xs leading-4 text-[#71717a]">{provenanceLabels[entry.provenance]} · revision {entry.fromRevision === entry.toRevision ? entry.toRevision : `${entry.fromRevision}–${entry.toRevision}`}</span>
                  </button>
                  {expanded && (
                    <div id={detailId} className="border-t border-black/[0.05] px-4 py-3">
                      {history.detailState === 'loading' && <p className="text-xs text-[#71717a]">Loading supporting sources…</p>}
                      {history.detailState === 'error' && <p className="text-xs text-[#991b1b]">{history.error}</p>}
                      {history.detailState === 'unavailable' && <p className="text-xs text-[#71717a]">Source details are unavailable in this environment.</p>}
                      {history.detailState === 'ready' && history.detail && (
                        <div className="space-y-2">
                          {history.detail.sources.length > 0 ? history.detail.sources.map(source => (
                            <div key={`${source.ref.type}:${source.ref.id}`} className="rounded-lg border border-black/[0.05] bg-white/70 px-3 py-2">
                              <div className="text-[11px] font-medium text-[#8b8b93]">{source.ref.type} · {source.status}</div>
                              <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-4 text-[#71717a] [overflow-wrap:anywhere]">{sourceLabel(source)}</p>
                            </div>
                          )) : <p className="text-xs text-[#71717a]">No supporting sources were recorded.</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {history.hasMore && <Button type="button" variant="link" onClick={() => void history.refresh(50)}>Show more history</Button>}
    </section>
  );
}
