import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { TaskAttachment } from '../types';
import { AttachmentIcon } from './icons/AttachmentIcon';
import { FolderIcon } from './icons/FolderIcon';
import { EmptyStateCard } from './EmptyStateCard';

interface TaskAttachmentsSectionProps {
  attachments?: TaskAttachment[];
  canReveal: boolean;
  onRevealAttachment: (filePath: string) => void;
}

export function TaskAttachmentsSection({
  attachments = [],
  canReveal,
  onRevealAttachment,
}: TaskAttachmentsSectionProps) {
  const [availabilityByPath, setAvailabilityByPath] = useState<Record<string, boolean | undefined>>({});
  const missingCount = attachments.filter(attachment => availabilityByPath[attachment.path] === false).length;

  useEffect(() => {
    let isMounted = true;
    const verify = window.electron?.attachments?.verify;

    if (!verify || attachments.length === 0) {
      setAvailabilityByPath({});
      return;
    }

    Promise.all(
      attachments.map(async attachment => {
        const result = await verify(attachment.path).catch(() => null);
        return [attachment.path, Boolean(result?.exists)] as const;
      })
    ).then(results => {
      if (!isMounted) return;
      setAvailabilityByPath(Object.fromEntries(results));
    });

    return () => {
      isMounted = false;
    };
  }, [attachments]);

  return (
    <div className="min-w-0">
      {missingCount > 0 ? (
        <div className="mb-3">
          <EmptyStateCard
            compact
            icon={<AlertTriangle className="size-4" />}
            title={missingCount === 1 ? '1 attachment is unavailable' : `${missingCount} attachments are unavailable`}
            description="These files are no longer reachable on disk, so reveal actions are disabled until the file paths are fixed."
            className="border-red-200 bg-red-50/70"
          />
        </div>
      ) : null}
      {attachments.length > 0 ? (
        <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {attachments.map(attachment => {
            const sizeLabel = formatAttachmentSize(attachment.size);
            const isMissing = availabilityByPath[attachment.path] === false;
            return (
              <div
                key={attachment.id}
                className={`flex min-h-10 min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                  isMissing ? 'border-red-100 bg-red-50' : 'border-black/[0.06] bg-white'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <AttachmentIcon className="size-4 shrink-0 text-[#71717a]" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold leading-5 text-[#71717a]">{attachment.name}</div>
                    {sizeLabel && !isMissing && (
                      <div className="truncate text-[11px] leading-4 text-[#8a8a92]">{sizeLabel}</div>
                    )}
                    {isMissing && (
                      <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-medium leading-none text-red-700">
                        <AlertTriangle className="size-3" />
                        Missing
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2 text-sm font-semibold leading-5 text-[#1a60cb] hover:bg-[#1a60cb]/10 hover:text-[#004ec5] disabled:cursor-not-allowed disabled:text-[#a5a5ac] disabled:hover:bg-transparent"
                  onClick={() => onRevealAttachment(attachment.path)}
                  disabled={!canReveal || isMissing}
                >
                  <FolderIcon className="size-4" />
                  Show
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyStateCard
          compact
          icon={<AttachmentIcon className="size-4" />}
          title="No files attached"
          description="Add files to keep source material and supporting artifacts attached to this task."
        />
      )}
    </div>
  );
}

function formatAttachmentSize(size?: number): string {
  if (!Number.isFinite(size) || !size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
