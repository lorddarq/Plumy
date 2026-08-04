import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Task } from '../types';
import { TaskExecutionAction } from './TaskExecutionAction';

interface AgentSessionRequest {
  task: Task;
  repositoryFolder?: string;
  startOnRequest: boolean;
  requestId: number;
}

interface AgentSessionSupervisorContextValue {
  requestTask: (task: Task, options?: { repositoryFolder?: string; startOnRequest?: boolean }) => void;
}

const AgentSessionSupervisorContext = createContext<AgentSessionSupervisorContextValue | null>(null);

export function useAgentSessionSupervisor() {
  const context = useContext(AgentSessionSupervisorContext);
  if (!context) throw new Error('AgentSessionSupervisor must be rendered above its launch surfaces.');
  return context;
}

export function AgentSessionSupervisorProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<AgentSessionRequest | null>(null);
  const requestTask = useCallback((task: Task, options: { repositoryFolder?: string; startOnRequest?: boolean } = {}) => {
    setRequest(current => ({
      task,
      repositoryFolder: options.repositoryFolder,
      startOnRequest: options.startOnRequest ?? true,
      requestId: (current?.requestId || 0) + 1,
    }));
  }, []);
  const value = useMemo(() => ({ requestTask }), [requestTask]);

  return (
    <AgentSessionSupervisorContext.Provider value={value}>
      {children}
      {request && (
        <TaskExecutionAction
          task={request.task}
          repositoryFolder={request.repositoryFolder}
          openRequest={request.requestId}
          startOnOpenRequest={request.startOnRequest}
          trigger={null}
        />
      )}
    </AgentSessionSupervisorContext.Provider>
  );
}
