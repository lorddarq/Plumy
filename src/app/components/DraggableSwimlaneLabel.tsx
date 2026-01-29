import { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Edit2, GripVertical } from 'lucide-react';
import { TimelineSwimlane } from '../types';
import { Button } from '../components/ui/button';

const ITEM_TYPE = 'SWIMLANE_ROW';

interface DraggableSwimlaneLabelProps {
  swimlane: TimelineSwimlane;
  index: number;
  leftColWidth: number;
  rowHeight?: number;
  onEditSwimlane: (swimlane: TimelineSwimlane) => void;
  onMoveSwimlane: (dragIndex: number, hoverIndex: number) => void;
}

interface DragItem {
  type: string;
  index: number;
  swimlane: TimelineSwimlane;
}

export function DraggableSwimlaneLabel({ swimlane, index, leftColWidth, rowHeight, onEditSwimlane, onMoveSwimlane }: DraggableSwimlaneLabelProps) {  const ref = useRef<HTMLDivElement>(null);
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
      className={`border-b border-gray-100 flex items-center justify-between px-5 group bg-white ${isOver ? 'bg-blue-50/50' : ''}`}
      style={{ width: `${leftColWidth}px`, height: 'var(--row-height)', boxSizing: 'border-box', overflow: 'hidden' }}
    >
      <div className="flex items-center gap-3">
        <div ref={dragHandleRef} className="cursor-move">
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>
        <span className="text-sm font-semibold text-gray-700 break-words whitespace-normal">{swimlane.name}</span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100"
        onClick={() => onEditSwimlane(swimlane)}
      >
        <Edit2 className="w-3 h-3" />
      </Button>
    </div>
  );
}
