import { useCallback } from 'react';
import type { Person, Task } from '../types.ts';

interface UsePeopleActionsOptions {
  setPeople: React.Dispatch<React.SetStateAction<Person[]>>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
}

export function usePeopleActions({
  setPeople,
  setTasks,
}: UsePeopleActionsOptions) {
  const addPerson = useCallback((personData: Omit<Person, 'id'>) => {
    const newPerson: Person = {
      id: Date.now().toString(),
      name: personData.name,
      role: personData.role,
      kind: personData.kind === 'agentic' ? 'agentic' : 'human',
      avatar: personData.avatar,
      agentInstructions: personData.kind === 'agentic' ? personData.agentInstructions?.trim() || undefined : undefined,
      agentOperationalInstructions: personData.kind === 'agentic' ? personData.agentOperationalInstructions?.trim() || undefined : undefined,
      availableForSubagentDelegation: personData.kind === 'agentic' && personData.availableForSubagentDelegation === true,
    };
    setPeople(prevPeople => [...prevPeople, newPerson]);
  }, [setPeople]);

  const deletePerson = useCallback((personId: string) => {
    setPeople(prevPeople => prevPeople.filter(p => p.id !== personId));
    setTasks(prevTasks => prevTasks.map(t => (t.assigneeId === personId ? { ...t, assigneeId: undefined } : t)));
  }, [setPeople, setTasks]);

  const updatePerson = useCallback((
    personId: string,
    updates: Pick<Person, 'name' | 'role' | 'kind' | 'agentInstructions' | 'agentOperationalInstructions' | 'availableForSubagentDelegation'>
  ) => {
    setPeople(prevPeople => prevPeople.map(p => {
      if (p.id !== personId) return p;
      const nextKind = updates.kind === 'agentic' ? 'agentic' : 'human';
      return {
        ...p,
        ...updates,
        kind: nextKind,
        agentInstructions: nextKind === 'agentic' ? updates.agentInstructions?.trim() || undefined : undefined,
        agentOperationalInstructions: nextKind === 'agentic' ? updates.agentOperationalInstructions?.trim() || undefined : undefined,
        availableForSubagentDelegation: nextKind === 'agentic' && updates.availableForSubagentDelegation === true,
      };
    }));
  }, [setPeople]);

  const reorderPeople = useCallback((reorderedPeople: Person[]) => {
    setPeople(reorderedPeople);
  }, [setPeople]);

  return {
    addPerson,
    deletePerson,
    updatePerson,
    reorderPeople,
  };
}
