import React, { useEffect, useRef, useState } from 'react';
import { Edit2 } from 'lucide-react';
import { Badge } from './ui/badge';

interface TaskCardProps {
  title: string;
  notes?: string;
  color?: string;
  swimlane?: string;
  onClick?: () => void;
  onRename?: (newTitle: string) => void;
}

export function TaskCard({ title, notes, color, swimlane, onClick, onRename }: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setDraft(title), [title]);
  useEffect(() => { if (isEditing) inputRef.current?.focus(); }, [isEditing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (onRename && trimmed && trimmed !== title) onRename(trimmed);
    setIsEditing(false);
  };

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-gray-200 max-w-[300px] overflow-hidden"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 ">
          <div className="flex-1 min-w-0 overflow-hidden pr-12 truncate-anywhere max-w-[320px]">
            {isEditing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                  if (e.key === 'Escape') { setIsEditing(false); setDraft(title); }
                }}
                className="w-full border-b px-1 py-0.5 text-sm font-medium"
              />
            ) : (
              <p
                className="text-sm font-medium text-gray-900 w-full max-w-[296px] truncate-anywhere truncate-fade truncate-fade-horizontal"
                onDoubleClick={(e) => { e.stopPropagation(); if (onRename) setIsEditing(true); }}
              >
                {title}
              </p>
            )}

            {swimlane && <div className="mt-1"><Badge variant="secondary">{swimlane}</Badge></div>}
            {notes && <p className="text-xs text-gray-500 mt-1 line-clamp-3">{notes}</p>}
          </div>
        </div>

        {onRename && (
          <button
            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            className="text-gray-400 hover:text-gray-600 p-1"
            aria-label="Edit title"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
