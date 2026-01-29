import { useState, useEffect } from 'react';
import { TimelineSwimlane } from '@/app/types';
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

interface SwimlaneDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (swimlane: Partial<TimelineSwimlane>) => void;
  onDelete?: (swimlaneId: string) => void;
  swimlane?: TimelineSwimlane | null;
}

export function SwimlaneDialog({
  isOpen,
  onClose,
  onSave,
  onDelete,
  swimlane,
}: SwimlaneDialogProps) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (swimlane) {
      setName(swimlane.name);
    } else {
      setName('');
    }
  }, [swimlane, isOpen]);

  const handleSave = () => {
    if (!name.trim()) return;

    const swimlaneData: Partial<TimelineSwimlane> = {
      ...(swimlane && { id: swimlane.id }),
      name: name.trim(),
    };

    onSave(swimlaneData);
    onClose();
  };

  const handleDelete = () => {
    if (swimlane && onDelete) {
      onDelete(swimlane.id);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{swimlane ? 'Edit Swimlane' : 'Create Swimlane'}</DialogTitle>
          <DialogDescription>
            {swimlane ? 'Edit the swimlane details' : 'Create a new swimlane'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Swimlane Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Frontend Team, Project Alpha, John Doe"
              autoFocus
            />
            <p className="text-xs text-gray-500">
              Name this swimlane by project, team, or person
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {swimlane && onDelete && (
            <Button variant="destructive" onClick={handleDelete} className="mr-auto">
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {swimlane ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}