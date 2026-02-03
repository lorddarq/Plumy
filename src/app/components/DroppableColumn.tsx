import { useRef, useState, useEffect } from 'react';
import { useDrop } from 'react-dnd';
import { Plus, Edit2 } from 'lucide-react';
import { Task, TaskStatus, Swimlane } from '../types';
import { DraggableTaskCard } from '../components/DraggableTaskCard';
import { getReadableTextClassFor } from '../utils/contrast';

interface DroppableColumnProps {
  swimlane: Swimlane;
  tasks: Task[];
  swimlanes: Array<{ id: TaskStatus; title: string }>;
  onTaskClick: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onReorderTask: (dragIndex: number, hoverIndex: number, status: TaskStatus) => void;
  onRenameTask?: (taskId: string, newTitle: string) => void;
  onRenameColumn?: (colId: string, newTitle: string) => void;
  onChangeColumnColor?: (colId: string, newColor: string) => void;
  onDeleteColumn?: (colId: string) => void;
}

export function DroppableColumn({
  swimlane,
  tasks: swimlaneTasks,
  swimlanes,
  onTaskClick,
  onAddTask,
  onMoveTask,
  onReorderTask,
  onRenameTask,
  onRenameColumn,
  onChangeColumnColor,
  onDeleteColumn,
}: DroppableColumnProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: 'TASK_CARD',
    drop: (item: { task: Task }) => {
      if (item.task.status !== swimlane.id) {
        onMoveTask(item.task.id, swimlane.id);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  drop(ref);

  // Column header editing state
  const [isEditing, setIsEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(swimlane.title || '');
  const [colorDraft, setColorDraft] = useState<string>(swimlane.color || '#9CA3AF');

  useEffect(() => {
    setTitleDraft(swimlane.title || '');
    setColorDraft(swimlane.color || '#9CA3AF');
  }, [swimlane.id]);

  const headerStyle = (color: string | undefined) => {
    if (!color) return undefined;
    if (color.startsWith('#')) return { backgroundColor: color } as React.CSSProperties;
    return undefined;
  };

  const saveColumnEdits = () => {
    if (onRenameColumn && titleDraft.trim()) onRenameColumn(swimlane.id, titleDraft.trim());
    if (onChangeColumnColor && colorDraft) onChangeColumnColor(swimlane.id, colorDraft);
    setIsEditing(false);
  };

  const cancelEdits = () => {
    setTitleDraft(swimlane.title || '');
    setColorDraft(swimlane.color || '#9CA3AF');
    setIsEditing(false);
  };

  return (
    <div
      className="min-w-[280px] max-w-[320px] bg-gray-100 rounded-lg flex flex-col h-full"
    >
      {/* Swimlane header */}
      {isEditing ? (
        (() => {
          const headerTextClass = getReadableTextClassFor(colorDraft || '#9CA3AF', colorDraft?.startsWith('#') ? colorDraft : undefined);
          return (
            <div className={`${headerTextClass} p-3 rounded-t-lg flex items-center justify-between space-x-2`} style={headerStyle(colorDraft)}>
              <div className="flex items-center gap-2 flex-1">
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="rounded px-2 py-1 text-sm w-full"
                  aria-label="Edit column title"
                />
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={colorDraft?.startsWith('#') ? colorDraft : '#9CA3AF'} onChange={(e) => setColorDraft(e.target.value)} aria-label="Pick color" />
                <button className={`${headerTextClass} px-2 py-1 bg-white/10 rounded`} onClick={saveColumnEdits}>Save</button>
                <button className={`${headerTextClass} px-2 py-1 bg-white/10 rounded`} onClick={cancelEdits}>Cancel</button>
                <button className={`${headerTextClass} px-2 py-1 bg-red-600 rounded`} onClick={() => onDeleteColumn && onDeleteColumn(swimlane.id)}>Delete</button>
              </div>
            </div>
          );
        })()
      ) : (
        (() => {
          const key = swimlane.color || '';
          const headerTextClass = key ? getReadableTextClassFor(key, key.startsWith('#') ? key : undefined) : 'text-white';
          return (
            <div className={`${!swimlane.color?.startsWith('#') ? swimlane.color : ''} ${headerTextClass} p-3 rounded-t-lg flex items-center justify-between`} style={headerStyle(swimlane.color)}>
              <div className="flex items-center gap-2">
                <span className="font-medium" onDoubleClick={() => setIsEditing(true)}>{swimlane.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`${headerTextClass} text-sm`}>{swimlaneTasks.length}</span>
                <button className={`${headerTextClass} p-1 ml-2`} onClick={() => setIsEditing(true)} aria-label="Edit column">
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })()
      )}

      {/* Task cards */}
      <div
        ref={ref}
        className={`flex-1 p-3 space-y-2 overflow-y-auto transition-colors ${
          isOver && canDrop ? 'bg-blue-50' : ''
        }`}
      >
        {/* Add task button */}
        <button
          onClick={() => onAddTask(swimlane.id)}
          className="w-full p-3 rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 text-gray-500 hover:text-gray-700"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm">Add task</span>
        </button>

        {swimlaneTasks.map((task, index) => (
          <DraggableTaskCard
            key={task.id}
            task={task}
            index={index}
            onTaskClick={onTaskClick}
            onMoveTask={onMoveTask}
            onReorderTask={onReorderTask}
            onRenameTask={onRenameTask}
            swimlanes={swimlanes}
          />
        ))}
      </div>
    </div>
  );
}