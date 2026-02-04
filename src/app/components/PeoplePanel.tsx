import { useState } from 'react';
import { Person, Task, TaskStatus } from '../types';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Plus, User, Trash2 } from 'lucide-react';

interface PeoplePanelProps {
  isOpen: boolean;
  onClose: () => void;
  people: Person[];
  tasks: Task[];
  statusColumns: Array<{ id: TaskStatus; title: string; color?: string }>;
  onAddPerson: (person: Omit<Person, 'id'>) => void;
  onDeletePerson: (personId: string) => void;
}

export function PeoplePanel({
  isOpen,
  onClose,
  people,
  tasks,
  statusColumns,
  onAddPerson,
  onDeletePerson,
}: PeoplePanelProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');

  function getTaskCountForPerson(personId: string, status?: TaskStatus): number {
    return tasks.filter(t => {
      const matchesPerson = t.assigneeId === personId;
      const matchesStatus = status ? t.status === status : true;
      return matchesPerson && matchesStatus;
    }).length;
  }

  function handleAddPerson() {
    if (!newName.trim()) return;
    onAddPerson({ name: newName.trim(), role: newRole.trim() || 'Team Member' });
    setNewName('');
    setNewRole('');
    setIsAdding(false);
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader className="px-6">
          <SheetTitle>Team Members</SheetTitle>
          <SheetDescription>
            View and manage team members and their task assignments.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 px-6 space-y-4">{/* Add new person */}
          {/* Add new person */}
          {isAdding ? (
            <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
              <div className="space-y-2">
                <Label htmlFor="person-name">Name</Label>
                <Input
                  id="person-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter name..."
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="person-role">Role</Label>
                <Input
                  id="person-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  placeholder="Enter role..."
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddPerson} size="sm">Add</Button>
                <Button onClick={() => { setIsAdding(false); setNewName(''); setNewRole(''); }} variant="outline" size="sm">Cancel</Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setIsAdding(true)} className="w-full" variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Add Team Member
            </Button>
          )}

          {/* People list */}
          <div className="space-y-3">
            {people.map(person => {
              const totalTasks = getTaskCountForPerson(person.id);
              
              return (
                <div key={person.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <User className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium">{person.name}</div>
                        <div className="text-sm text-gray-500">{person.role}</div>
                      </div>
                    </div>
                    <Button
                      onClick={() => onDeletePerson(person.id)}
                      variant="ghost"
                      size="sm"
                      className="text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Task count by status */}
                  <div className="flex flex-wrap gap-2">
                    <div className="text-xs px-2 py-1 bg-gray-100 rounded">
                      Total: {totalTasks}
                    </div>
                    {statusColumns.map(col => {
                      const count = getTaskCountForPerson(person.id, col.id);
                      if (count === 0) return null;
                      return (
                        <div
                          key={col.id}
                          className="text-xs px-2 py-1 rounded text-white"
                          style={{ backgroundColor: col.color || '#9ca3af' }}
                        >
                          {col.title}: {count}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {people.length === 0 && !isAdding && (
              <div className="text-center py-8 text-gray-500">
                No team members yet. Click "Add Team Member" to get started.
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
