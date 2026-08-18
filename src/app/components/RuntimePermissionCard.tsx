import { ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface RuntimePermissionField {
  name: string;
  type: string;
  title: string;
  description: string;
  required: boolean;
  defaultValue?: unknown;
  options?: unknown[];
}

export interface RuntimePermissionRequest {
  bindingId: string;
  turnId?: string;
  requestId: string | number;
  method: string;
  responseKind?: 'elicitation' | 'codex-approval';
  serverName: string;
  mode: string;
  message: string;
  fields: RuntimePermissionField[];
}

interface RuntimePermissionCardProps {
  requests: RuntimePermissionRequest[];
  busy?: boolean;
  getValue: (request: RuntimePermissionRequest, field: RuntimePermissionField) => unknown;
  isMissing: (request: RuntimePermissionRequest, field: RuntimePermissionField) => boolean;
  onValueChange: (request: RuntimePermissionRequest, field: RuntimePermissionField, value: unknown) => void;
  onRespond: (request: RuntimePermissionRequest, action: 'accept' | 'decline') => void;
}

const requestValueKey = (request: RuntimePermissionRequest, fieldName: string) => `${String(request.requestId)}:${fieldName}`;

export function RuntimePermissionCard({ requests, busy = false, getValue, isMissing, onValueChange, onRespond }: RuntimePermissionCardProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const request = requests[selectedIndex] || requests[0];

  useEffect(() => {
    setSelectedIndex(current => Math.min(current, Math.max(0, requests.length - 1)));
  }, [requests.length]);

  if (!request) return null;
  const missingRequired = request.fields.some(field => isMissing(request, field));
  const hasMultiple = requests.length > 1;

  return (
    <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50 shadow-[0_8px_24px_rgba(146,64,14,0.08)]" aria-live="assertive">
      <div key={`${request.method}-${request.requestId}`} className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 p-4 transition-opacity">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
            <ShieldCheck className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">Permission requested</div>
                <p className="mt-1 text-sm font-medium leading-5 text-amber-950">{request.message}</p>
              </div>
              {hasMultiple && <span className="shrink-0 text-[11px] font-medium text-amber-700">{selectedIndex + 1} / {requests.length}</span>}
            </div>
            {request.serverName && <div className="mt-2 text-[11px] text-amber-800/80">Requested by {request.serverName}</div>}
            {request.fields.length > 0 && <div className="mt-3 space-y-2 rounded-lg border border-amber-200/80 bg-white/70 p-3">{request.fields.map(field => {
              const value = getValue(request, field);
              return <label key={field.name} className="block text-xs text-slate-700"><span className="font-medium">{field.title}{field.required ? ' *' : ''}</span>{field.description && <span className="ml-1 text-slate-500">{field.description}</span>}
                {field.type === 'boolean'
                  ? <input type="checkbox" checked={Boolean(value)} onChange={event => onValueChange(request, field, event.target.checked)} className="ml-2 align-middle" />
                  : field.options?.length
                    ? <select value={String(value)} onChange={event => onValueChange(request, field, event.target.value)} className="mt-1 block w-full rounded-md border border-amber-200 bg-white px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-amber-500"> <option value="">Select…</option>{field.options.map(option => <option key={String(option)} value={String(option)}>{String(option)}</option>)}</select>
                    : <input type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'} value={String(value)} onChange={event => onValueChange(request, field, event.target.value)} className="mt-1 block w-full rounded-md border border-amber-200 bg-white px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-amber-500" />}
              </label>;
            })}</div>}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-amber-200/80 bg-amber-100/50 px-4 py-3">
        <div className="flex items-center gap-1">{hasMultiple && <><button type="button" aria-label="Previous permission request" disabled={busy || selectedIndex === 0} onClick={() => setSelectedIndex(current => Math.max(0, current - 1))} className="rounded-md p-1 text-amber-800 outline-none hover:bg-amber-200 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-amber-600"><ChevronLeft className="size-4" aria-hidden="true" /></button><div className="flex items-center gap-1 px-1" aria-label={`Permission request ${selectedIndex + 1} of ${requests.length}`}>{requests.map((item, index) => <button key={`${item.method}-${item.requestId}`} type="button" aria-label={`Show permission request ${index + 1}`} aria-current={index === selectedIndex ? 'step' : undefined} onClick={() => setSelectedIndex(index)} className={`size-1.5 rounded-full transition-all ${index === selectedIndex ? 'bg-amber-800 ring-2 ring-amber-300' : 'bg-amber-300 hover:bg-amber-500'}`} />)}</div><button type="button" aria-label="Next permission request" disabled={busy || selectedIndex === requests.length - 1} onClick={() => setSelectedIndex(current => Math.min(requests.length - 1, current + 1))} className="rounded-md p-1 text-amber-800 outline-none hover:bg-amber-200 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-amber-600"><ChevronRight className="size-4" aria-hidden="true" /></button></>}</div>
        <div className="flex items-center gap-2"><button type="button" onClick={() => onRespond(request, 'decline')} disabled={busy} className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 outline-none transition-colors hover:bg-amber-50 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-amber-600">Deny</button><button type="button" onClick={() => onRespond(request, 'accept')} disabled={busy || missingRequired} className="rounded-md bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white outline-none transition-colors hover:bg-amber-950 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-amber-600">Allow</button></div>
      </div>
    </div>
  );
}

export { requestValueKey };
