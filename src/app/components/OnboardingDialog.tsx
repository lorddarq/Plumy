import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import logo from '../images/logo-large.svg';
import { persistOnboardingStatus } from '../utils/onboarding.ts';

interface Slide { title: string; body: string; description: string; kind: 'welcome' | 'plan' | 'delegate' | 'start'; }
const slides: Slide[] = [
  { title: 'Welcome to Omvra', body: 'Plan work, delegate it, and supervise execution with less noise.', description: 'The Omvra workflow: plan work, delegate it, and supervise execution.', kind: 'welcome' },
  { title: 'Plan the work', body: 'Projects provide workspace context. Tasks hold the work request, dates, and the outcome you want.', description: 'A project called Product launch contains a task called Prepare launch brief.', kind: 'plan' },
  { title: 'Delegate with intent', body: 'Create an agent with persona and operational instructions, then assign the task to connect the work to that agent.', description: 'An agent profile shows persona behavior instructions and operational work-method instructions, with a task assignment.', kind: 'delegate' },
  { title: 'Start work with confidence', body: 'Start work checks the agent, workspace, ACP/runtime configuration, model, and task context before execution.', description: 'The Start work preflight lists agent, workspace, runtime, model, and task context checks.', kind: 'start' },
];

function IllustratedPanel({ kind }: { kind: Slide['kind'] }) {
  if (kind === 'welcome') return <div className="omvra-onboarding-welcome-mark" aria-hidden="true"><img src={logo} alt="" /><span>Plan · Delegate · Supervise</span></div>;
  const labels = kind === 'plan' ? ['Product launch', 'Prepare launch brief', 'Workspace context'] : kind === 'delegate' ? ['Atlas · Agent', 'Persona & behavior', 'Operational work method', 'Assigned task'] : ['Start work preflight', 'Agent verified', 'Workspace ready', 'Runtime configured', 'Model · Task context'];
  return <div className={`omvra-onboarding-illustration is-${kind}`} aria-hidden="true">{labels.map((label, index) => <div key={label} className={index === 0 ? 'omvra-onboarding-illustration-title' : 'omvra-onboarding-illustration-row'}><span>{index === 0 ? '◆' : '✓'}</span>{label}</div>)}</div>;
}

export function OnboardingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement;
    setIndex(0);
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); void persistOnboardingStatus('dismissed'); onClose(); }
      if (event.key === 'ArrowRight') setIndex(value => Math.min(slides.length - 1, value + 1));
      if (event.key === 'ArrowLeft') setIndex(value => Math.max(0, value - 1));
      if (event.key === 'Tab') {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
        if (!focusable.length) return;
        const current = focusable.indexOf(document.activeElement as HTMLElement);
        const next = focusable[(current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length];
        if (current === -1 || (!event.shiftKey && current === focusable.length - 1) || (event.shiftKey && current === 0)) { event.preventDefault(); next.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocusRef.current?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  const slide = slides[index];
  const finish = () => { void persistOnboardingStatus(index === slides.length - 1 ? 'completed' : 'dismissed'); onClose(); };
  return <div className="omvra-onboarding-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) finish(); }}>
    <section ref={dialogRef} className="omvra-onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="omvra-onboarding-title" aria-describedby="omvra-onboarding-body">
      <button ref={closeButtonRef} type="button" className="omvra-onboarding-close" aria-label="Close onboarding" onClick={finish}><X size={18} /></button>
      <div className="omvra-onboarding-gradient" aria-hidden="true" />
      <div className="omvra-onboarding-content"><div className="omvra-onboarding-visual"><IllustratedPanel kind={slide.kind} /><p className="sr-only">{slide.description}</p></div><div className="omvra-onboarding-copy"><h2 id="omvra-onboarding-title">{slide.title}</h2><p id="omvra-onboarding-body">{slide.body}</p></div></div>
      <footer className="omvra-onboarding-footer"><div className="omvra-onboarding-progress" aria-label={`Slide ${index + 1} of ${slides.length}`}>{slides.map((item, itemIndex) => <span key={item.title} className={itemIndex === index ? 'is-active' : ''} />)}</div><div className="omvra-onboarding-actions"><button type="button" className="omvra-onboarding-secondary" onClick={() => setIndex(value => Math.max(0, value - 1))} disabled={index === 0}><ArrowLeft size={15} /> Back</button>{index === slides.length - 1 ? <button type="button" className="omvra-onboarding-primary" onClick={finish}><Check size={15} /> Done</button> : <button type="button" className="omvra-onboarding-primary" onClick={() => setIndex(value => value + 1)}>Next <ArrowRight size={15} /></button>}</div></footer>
    </section>
  </div>;
}
