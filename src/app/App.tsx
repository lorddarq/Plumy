import { AppHeader } from './components/headers/AppHeader';
import { AppMainViews } from './components/views/AppMainViews';
import { AppPanels } from './components/AppPanels';
import { AppStatusBar } from './components/statuses/AppStatusBar';
import { DeleteConfirmDialog } from './components/dialogs/DeleteConfirmDialog';
import { UpdateAvailablePopup } from './components/UpdateAvailablePopup';
import { useAppShell } from './hooks/useAppShell.ts';
import { UiLayoutStoreProvider } from './store/uiLayoutStore.tsx';
import { WorkspaceStoreProvider, useWorkspaceStore } from './store/workspaceStore.tsx';
import { Toaster } from './components/ui/sonner';
import { AgentRuntimeNotifications } from './components/AgentRuntimeNotifications.tsx';
import { OnboardingDialog } from './components/OnboardingDialog.tsx';
import { hasCompletedOnboarding } from './utils/onboarding.ts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentSessionSupervisorProvider } from './components/AgentSessionSupervisor';

function AppContent() {
  const appShell = useAppShell();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const onboardingHandledRef = useRef(false);
  const closeOnboarding = useCallback(() => { onboardingHandledRef.current = true; setOnboardingOpen(false); }, []);

  useEffect(() => {
    if (!appShell.isHydrated || onboardingHandledRef.current) return;
    let cancelled = false;
    void hasCompletedOnboarding().then(completed => { if (!cancelled && !completed) setOnboardingOpen(true); else onboardingHandledRef.current = true; });
    return () => { cancelled = true; };
  }, [appShell.isHydrated, appShell.panelsProps.adminActions]);

  useEffect(() => {
    if (!appShell.isHydrated) return;
    const replay = () => { appShell.panelsProps.adminActions.onClosePreferences(); setOnboardingOpen(true); };
    window.addEventListener('omvra:replay-onboarding', replay);
    return () => window.removeEventListener('omvra:replay-onboarding', replay);
  }, [appShell.isHydrated, appShell.panelsProps.adminActions]);

  if (!appShell.isHydrated) {
    return (
      <div
        className="flex h-dvh items-center justify-center bg-gray-50 text-sm text-gray-500"
        role="status"
        aria-live="polite"
      >
        <span className="inline-flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
          >
            <title>Loading</title>
            <g fill="#71717A">
              <g className="nc-loop-dots-4-16-icon-f">
                <circle cx="3" cy="8" r="2" />
                <circle cx="8" cy="8" r="2" />
                <circle cx="13" cy="8" r="2" />
              </g>
              <style>{`
                .nc-loop-dots-4-16-icon-f { --animation-duration: 0.8s; }
                .nc-loop-dots-4-16-icon-f * {
                  opacity: 0.4;
                  transform: scale(0.75);
                  animation: nc-loop-dots-4-anim var(--animation-duration) infinite;
                }
                .nc-loop-dots-4-16-icon-f :nth-child(1) {
                  transform-origin: 3px 8px;
                  animation-delay: calc(var(--animation-duration) / -2.666);
                }
                .nc-loop-dots-4-16-icon-f :nth-child(2) {
                  transform-origin: 8px 8px;
                  animation-delay: calc(var(--animation-duration) / -5.333);
                }
                .nc-loop-dots-4-16-icon-f :nth-child(3) { transform-origin: 13px 8px; }
                @keyframes nc-loop-dots-4-anim {
                  0%, 100% { opacity: 0.4; transform: scale(0.75); }
                  50% { opacity: 1; transform: scale(1); }
                }
              `}</style>
            </g>
          </svg>
          Loading workspace...
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-dvh flex-col bg-gray-50">
        <AppHeader {...appShell.headerProps} />
        <AppMainViews {...appShell.mainViewsProps} />
        <AppStatusBar {...appShell.statusBarProps} />
        <AppPanels {...appShell.panelsProps} />
        <UpdateAvailablePopup {...appShell.updatePopupProps} />
      </div>

      <DeleteConfirmDialog {...appShell.deleteConfirmProps} />
      <OnboardingDialog open={onboardingOpen} onClose={closeOnboarding} />
    </>
  );
}

function AppStoreShell() {
  const {
    hasHydratedCanonicalWorkspace,
    timelineSwimlanes,
    people,
    tasks,
    milestones,
  } = useWorkspaceStore();

  return (
    <UiLayoutStoreProvider
      hasHydratedCanonicalWorkspace={hasHydratedCanonicalWorkspace}
      projects={timelineSwimlanes}
      people={people}
      tasks={tasks}
      milestones={milestones}
    >
      <AgentRuntimeNotifications tasks={tasks} />
      <AgentSessionSupervisorProvider tasks={tasks} projects={timelineSwimlanes}>
        <AppContent />
      </AgentSessionSupervisorProvider>
    </UiLayoutStoreProvider>
  );
}

function App() {
  return (
    <div className="antialiased">
      <Toaster />
      <WorkspaceStoreProvider>
        <AppStoreShell />
      </WorkspaceStoreProvider>
    </div>
  );
}

export default App;
