import { useState, useEffect } from 'react';
import { Task, TaskStatus, TimelineSwimlane } from '@/app/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';

interface TaskDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Partial<Task>) => void;
  onDelete?: (taskId: string) => void;
  task?: Task | null;
  defaultStatus?: TaskStatus;
  defaultDate?: Date;
  defaultSwimlaneId?: string;
  swimlanes: TimelineSwimlane[];
}

export function TaskDialog({
  isOpen,
  onClose,
  onSave,
  onDelete,
  task,
  defaultStatus,
  defaultDate,
  defaultSwimlaneId,
  swimlanes,
}: TaskDialogProps) {
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<TaskStatus>('open');
  const [notes, setNotes] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [swimlaneOnly, setSwimlaneOnly] = useState(false);
  const [swimlaneId, setSwimlaneId] = useState('');

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setStatus(task.status);
      setNotes(task.notes || '');
      setStartDate(task.startDate || '');
      setEndDate(task.endDate || '');
      setSwimlaneOnly(task.swimlaneOnly || false);
      setSwimlaneId(task.swimlaneId || '');
    } else {
      setTitle('');
      setStatus(defaultStatus || 'open');
      setNotes('');
      setSwimlaneId(defaultSwimlaneId || (swimlanes[0]?.id || ''));
      
      if (defaultDate) {
        const dateStr = defaultDate.toISOString().split('T')[0];
        setStartDate(dateStr);
        const endDateObj = new Date(defaultDate);
        endDateObj.setDate(endDateObj.getDate() + 2);
        setEndDate(endDateObj.toISOString().split('T')[0]);
        setSwimlaneOnly(false);
      } else {
        setStartDate('');
        setEndDate('');
        setSwimlaneOnly(true);
      }
    }
  }, [task, defaultStatus, defaultDate, defaultSwimlaneId, swimlanes, isOpen]);

  const handleSave = () => {
    if (!title.trim()) return;

    const taskData: Partial<Task> = {
      ...(task && { id: task.id }),
      title: title.trim(),
      status,
      notes: notes.trim(),
      swimlaneOnly,
      swimlaneId: swimlaneOnly ? undefined : swimlaneId,
    };

    if (!swimlaneOnly && startDate && endDate) {
      taskData.startDate = startDate;
      taskData.endDate = endDate;
    }

    onSave(taskData);
    onClose();
  };

  const handleDelete = () => {
    if (task && onDelete) {
      onDelete(task.id);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'Create Task'}</DialogTitle>
          <DialogDescription>
            {task ? 'Edit the task details below.' : 'Enter the task details below.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Task Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title..."
              autoFocus
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as TaskStatus)}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="under-review">Under Review</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Timeline toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="swimlaneOnly"
              checked={swimlaneOnly}
              onChange={(e) => setSwimlaneOnly(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <Label htmlFor="swimlaneOnly" className="cursor-pointer">
              Status columns only (no timeline)
            </Label>
          </div>

          {/* Swimlane selection */}
          {!swimlaneOnly && swimlanes.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="swimlane">Assign to Swimlane</Label>
              <Select value={swimlaneId} onValueChange={setSwimlaneId}>
                <SelectTrigger id="swimlane">
                  <SelectValue placeholder="Select swimlane" />
                </SelectTrigger>
                <SelectContent>
                  {swimlanes.map(swimlane => (
                    <SelectItem key={swimlane.id} value={swimlane.id}>
                      {swimlane.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Dates */}
          {!swimlaneOnly && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes & Details</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes, details, or requirements..."
              rows={4}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {task && onDelete && (
            <Button variant="destructive" onClick={handleDelete} className="mr-auto">
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title.trim()}>
            {task ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}