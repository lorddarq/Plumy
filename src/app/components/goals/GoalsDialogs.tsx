import type { FormEvent } from 'react';
import { Input } from '../ui/input';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

type DeleteGoalDialogProps = { open: boolean; onCancel: () => void; onConfirm: () => void };
export function DeleteGoalDialog({ open, onCancel, onConfirm }: DeleteGoalDialogProps) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
    <div role="alertdialog" aria-modal="true" aria-labelledby="delete-goal-title" aria-describedby="delete-goal-description" className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
      <h2 id="delete-goal-title" className="text-base font-semibold text-slate-900">Delete this Goal?</h2>
      <p id="delete-goal-description" className="mt-2 text-sm text-slate-500">This removes the Goal graph and its canvas entry. Durable execution history remains preserved.</p>
      <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onCancel} className="min-h-10 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button><button type="button" onClick={onConfirm} className="min-h-10 rounded-md bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700">Delete Goal</button></div>
    </div>
  </div>;
}

type ResetGoalExecutionDialogProps = { open: boolean; onCancel: () => void; onConfirm: () => void };
export function ResetGoalExecutionDialog({ open, onCancel, onConfirm }: ResetGoalExecutionDialogProps) {
  return <Dialog open={open} onOpenChange={nextOpen => { if (!nextOpen) onCancel(); }}>
    <DialogContent showClose={false}>
      <DialogHeader>
        <DialogTitle>Reset this Goal execution?</DialogTitle>
        <DialogDescription>The current attempt will be preserved in history and the Goal will return to its initial not-started state.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild><button type="button" className="min-h-10 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button></DialogClose>
        <button type="button" onClick={onConfirm} className="min-h-10 rounded-md bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700">Reset execution</button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

type NewGoalDialogProps = { open: boolean; title: string; body: string; auditDirectory: string; existingGoalCount: number; onTitleChange: (value: string) => void; onBodyChange: (value: string) => void; onPickDirectory: () => Promise<void>; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void };
export function NewGoalDialog({ open, title, body, auditDirectory, existingGoalCount, onTitleChange, onBodyChange, onPickDirectory, onCancel, onSubmit }: NewGoalDialogProps) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
    <form role="dialog" aria-modal="true" aria-labelledby="new-goal-title" className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl" onSubmit={onSubmit}>
      <h2 id="new-goal-title" className="text-base font-semibold text-slate-900">Create a Goal</h2>
      <p className="mt-1 text-sm text-slate-500">Start with the outcome. You can shape the workflow on the canvas afterward.</p>
      <label className="mt-5 block text-xs font-medium text-slate-600">Goal title<Input autoFocus value={title} onChange={event => onTitleChange(event.target.value)} placeholder="e.g. Launch the workspace" className="mt-1" /></label>
      <label className="mt-4 block text-xs font-medium text-slate-600">Outcome and context<textarea value={body} onChange={event => onBodyChange(event.target.value)} rows={4} placeholder="What should be true when this Goal is complete?" className="mt-1 w-full resize-y rounded-md border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
      {!auditDirectory && !existingGoalCount && <div className="mt-4 rounded-md border border-blue-100 bg-blue-50/60 p-3 text-xs text-slate-600"><div className="font-semibold text-slate-700">Choose an audit history location</div><p className="mt-1 leading-4">Goal cleanup attempts are retained indefinitely in an external folder. You can also configure this later in Settings.</p><button type="button" className="mt-2 rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50" onClick={() => void onPickDirectory()}>Choose folder</button></div>}
      <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onCancel} className="min-h-10 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button><button type="submit" className="min-h-10 rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-700">Create Goal</button></div>
    </form>
  </div>;
}
