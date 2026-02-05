import { useState, useEffect } from 'react';
import { Swimlane } from '../types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

interface ColumnDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, color: string) => void;
  onDelete?: () => void;
  column?: Swimlane | null;
}

export function ColumnDialog({
  isOpen,
  onClose,
  onSave,
  onDelete,
  column,
}: ColumnDialogProps) {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState('#9CA3AF');

  useEffect(() => {
    if (column) {
      setTitle(column.title || '');
      setColor(column.color || '#9CA3AF');
    } else {
      setTitle('');
      setColor('#9CA3AF');
    }
  }, [column, isOpen]);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave(title.trim(), color);
    onClose();
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{column ? 'Edit Column' : 'Create Column'}</DialogTitle>
          <DialogDescription>
            {column ? 'Edit the column details below' : 'Create a new column for your board'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Column Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., In Progress, Review, Done"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">Column Color</Label>
            <div className="flex items-center gap-3">
              <Input
                id="color"
                type="color"
                value={color.startsWith('#') ? color : '#9CA3AF'}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-20 cursor-pointer"
              />
              <Input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#9CA3AF"
                className="flex-1 font-mono text-sm"
              />
            </div>
            <p className="text-xs text-gray-500">
              Choose a color to help identify this column
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {column && onDelete && (
            <Button variant="destructive" onClick={handleDelete} className="mr-auto">
              Delete Column
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title.trim()}>
            {column ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
