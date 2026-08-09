import { ChevronLeft, ChevronRight, Plus, Sparkles } from 'lucide-react';
import type { GoalElement, GoalRecord } from '../../types.ts';
import { Button } from '../ui/button';

type GoalsSidebarProps = {
  goals: GoalRecord[];
  selectedGoalId: string;
  collapsed: boolean;
  onSelectGoal: (goal: GoalRecord) => void;
  onToggleCollapsed: () => void;
  onNewGoal: () => void;
  statusChipClass: (status: GoalElement['status']) => string;
  compactChipClass: (colorClass: string) => string;
  statusLabel: (status: GoalElement['status']) => string;
  StatusIcon: (props: { status: GoalElement['status']; className?: string }) => JSX.Element;
};

export function GoalsSidebar({ goals, selectedGoalId, collapsed, onSelectGoal, onToggleCollapsed, onNewGoal, statusChipClass, compactChipClass, statusLabel, StatusIcon }: GoalsSidebarProps) {
  return (
    <aside className={`absolute bottom-4 left-4 top-4 z-20 flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm transition-[width] duration-200 ${collapsed ? 'w-12' : 'w-64'}`}>
      <div className={`flex items-center border-b px-3 py-3 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        <div className={collapsed ? 'hidden' : ''}>
          <h1 className="text-sm font-semibold text-slate-900">Goals</h1>
          <p className="mt-0.5 text-xs text-slate-500">Shape work as a loop</p>
        </div>
        <button type="button" onClick={onToggleCollapsed} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={collapsed ? 'Expand goals panel' : 'Collapse goals panel'}>
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
      </div>
      <div className={`flex-1 space-y-1 overflow-auto p-2 ${collapsed ? 'hidden' : ''}`}>
        {goals.map(goal => {
          const goalStatus = goal.elements.find(element => element.type === 'goal')?.status ?? 'draft';
          return <button type="button" key={goal.id} onClick={() => onSelectGoal(goal)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${goal.id === selectedGoalId ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}>
            <span className="block truncate">{goal.title}</span>
            <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
              <span>{goal.elements.filter(element => element.type === 'subgoal').length} subgoals · {goal.elements.length} nodes</span>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium ${compactChipClass(statusChipClass(goalStatus))}`}><StatusIcon status={goalStatus} className="size-3" />{statusLabel(goalStatus)}</span>
            </span>
          </button>;
        })}
      </div>
      <div className={`flex-1 flex-col items-center gap-2 overflow-auto p-2 ${collapsed ? 'flex' : 'hidden'}`}>
        {goals.map(goal => <button type="button" key={goal.id} onClick={() => onSelectGoal(goal)} className={`rounded-lg p-2 ${goal.id === selectedGoalId ? 'bg-slate-100' : 'hover:bg-slate-50'}`} aria-label={goal.title} title={goal.title}><Sparkles className="size-4" style={{ color: goal.color ?? '#2563eb' }} /></button>)}
      </div>
      <div className={`border-t p-3 ${collapsed ? 'hidden' : ''}`}><Button type="button" onClick={onNewGoal} className="w-full text-xs"><Plus className="size-3.5" /> New goal</Button></div>
    </aside>
  );
}
