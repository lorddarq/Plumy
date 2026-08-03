import { useRef, type KeyboardEvent } from 'react';
import { ButtonStop } from './icons/button-stop';
import { SendMessage } from './icons/send-message';

interface TaskSessionComposerProps {
  value: string;
  running: boolean;
  busy: boolean;
  canSubmit: boolean;
  canStop: boolean;
  placeholder: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
}

export function TaskSessionComposer({
  value,
  running,
  busy,
  canSubmit,
  canStop,
  placeholder,
  onChange,
  onSubmit,
  onStop,
}: TaskSessionComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const buttonDisabled = busy || (running ? !canStop : !canSubmit);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || !canSubmit || busy) return;
    event.preventDefault();
    onSubmit();
  };

  return (
    <div
      className="cursor-text rounded-xl border border-slate-200 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] focus-within:border-slate-300 focus-within:shadow-[0_1px_3px_rgba(15,23,42,0.08)]"
      onClick={() => inputRef.current?.focus()}
    >
      <textarea
        ref={inputRef}
        value={value}
        rows={2}
        onChange={event => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={running ? 'Add optional guidance to current work' : 'Start an optional follow-up instruction'}
        className="block max-h-32 min-h-10 w-full resize-none bg-transparent text-[13px] leading-5 text-slate-800 outline-none placeholder:text-slate-400"
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            if (running) onStop();
            else onSubmit();
          }}
          disabled={buttonDisabled}
          aria-label={running ? 'Stop current work' : 'Send instruction'}
          title={running ? 'Stop current work' : 'Send instruction'}
          className="flex size-8 items-center justify-center rounded-lg bg-slate-900 text-white transition-[background-color,transform] enabled:hover:bg-slate-700 enabled:active:scale-95 disabled:bg-slate-100 disabled:text-slate-400"
        >
          {running ? <ButtonStop title="" className="size-3" /> : <SendMessage title="" className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}
