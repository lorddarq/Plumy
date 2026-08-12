import { useEffect, useState, type ComponentType, type ReactNode } from 'react';

interface DeferredSurfaceProps {
  load: () => Promise<{ default: ComponentType<any> }>;
  componentProps: any;
  fallback: ReactNode;
  errorLabel: string;
}

export function DeferredSurface({ load, componentProps, fallback, errorLabel }: DeferredSurfaceProps) {
  const [Component, setComponent] = useState<ComponentType<any> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    void load().then(module => {
      if (active) setComponent(() => module.default);
    }).catch(loadError => {
      if (active) setError(loadError);
    });
    return () => { active = false; };
  }, [attempt, load]);

  if (error) {
    return (
      <div className="flex items-center justify-center p-6" role="alert">
        <div className="max-w-sm rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{errorLabel} could not be loaded.</p>
          <button type="button" className="mt-3 rounded-md border border-red-300 px-3 py-1.5 font-medium hover:bg-red-100" onClick={() => setAttempt(value => value + 1)}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!Component) return <>{fallback}</>;
  return <Component {...componentProps} />;
}
