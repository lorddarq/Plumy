import { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Edit2, GripVertical, User } from 'lucide-react';
import { TimelineSwimlane } from '../types';

const ITEM_TYPE = 'SWIMLANE_ROW';

interface DraggableSwimlaneLabelProps {
  swimlane: TimelineSwimlane;
  index: number;
  leftColWidth: number;
  rowHeight?: number;
  onEditSwimlane: (swimlane: TimelineSwimlane) => void;
  onMoveSwimlane: (dragIndex: number, hoverIndex: number) => void;
  mode?: 'projects' | 'people';
  taskCount?: number;
}

interface DragItem {
  type: string;
  index: number;
  swimlane: TimelineSwimlane;
}

export function DraggableSwimlaneLabel({ swimlane, index, leftColWidth, rowHeight, onEditSwimlane, onMoveSwimlane, mode = 'projects', taskCount = 0 }: DraggableSwimlaneLabelProps) {  const ref = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, preview] = useDrag({
    type: ITEM_TYPE,
    item: { type: ITEM_TYPE, index, swimlane },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [{ isOver }, drop] = useDrop({
    accept: ITEM_TYPE,
    hover: (item: DragItem, monitor) => {
      if (!ref.current) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;

      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = (clientOffset as any).y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;

      onMoveSwimlane(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
    collect: (monitor) => ({ isOver: monitor.isOver() }),
  });

  preview(drop(ref));
  // attach drag to the handle
  drag(dragHandleRef);

  return (
    <div
      ref={ref}
      className={`flex flex-col justify-center px-5 py-3 group bg-white ${isOver ? 'bg-blue-50/50' : ''}`}
      style={{ 
        width: `${leftColWidth}px`, 
        height: `${rowHeight || 48}px`, 
        boxSizing: 'border-box', 
        minHeight: `${rowHeight || 48}px`,
        borderLeft: swimlane.color ? `4px solid ${swimlane.color}` : undefined
      }}
    >
      <div className="flex items-center justify-between w-full gap-2">
        <div ref={dragHandleRef} className="cursor-move flex-shrink-0">
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>
        
        {mode === 'people' ? (
          <>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-sm font-semibold text-gray-700 truncate">{swimlane.name}</span>
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0">{taskCount} {taskCount === 1 ? 'task' : 'tasks'}</span>
          </>
        ) : (
          <span className="text-sm font-semibold text-gray-700 flex-1 break-words line-clamp-3">{swimlane.name}</span>
        )}

        {mode === 'projects' && (
          <button
            type="button"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0 inline-flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors"
            onClick={() => onEditSwimlane(swimlane)}
          >
            <Edit2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
