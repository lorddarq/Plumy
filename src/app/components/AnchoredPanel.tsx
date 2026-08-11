import type { ComponentPropsWithoutRef, ComponentType, ReactNode } from 'react';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import { cn } from './ui/utils';

const ANCHORED_PANEL_HEADER_OFFSET = 104;

export interface AnchoredPanelNavItem {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
}

export interface AnchoredPanelNavGroup {
  label: string;
  items: AnchoredPanelNavItem[];
}

interface AnchoredPanelProps {
  title: string;
  description?: string;
  navGroups: AnchoredPanelNavGroup[];
  initialAnchor?: string;
  onBack?: () => void;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  headerAction?: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function AnchoredPanel({
  title,
  description,
  navGroups,
  initialAnchor,
  onBack,
  onClose,
  children,
  footer,
  headerAction,
  className,
  contentClassName,
}: AnchoredPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const programmaticAnchorRef = useRef<string | null>(null);
  const programmaticScrollTimeoutRef = useRef<number | null>(null);
  const activeSectionRafRef = useRef<number | null>(null);
  const enabledItems = useMemo(
    () => navGroups.flatMap(group => group.items).filter(item => !item.disabled),
    [navGroups]
  );
  const firstAnchor = enabledItems[0]?.id;
  const [activeAnchor, setActiveAnchor] = useState(initialAnchor ?? firstAnchor ?? '');

  const clearProgrammaticScrollLock = () => {
    if (programmaticScrollTimeoutRef.current !== null) {
      window.clearTimeout(programmaticScrollTimeoutRef.current);
      programmaticScrollTimeoutRef.current = null;
    }

    programmaticScrollTimeoutRef.current = window.setTimeout(() => {
      programmaticAnchorRef.current = null;
      programmaticScrollTimeoutRef.current = null;
      syncActiveSection();
    }, 180);
  };

  const scrollToSection = (anchorId: string) => {
    const scrollNode = scrollRef.current;
    if (!scrollNode) return;

    const section = scrollNode.querySelector<HTMLElement>(`[data-anchored-panel-section="${anchorId}"]`);
    if (!section) return;

    const sectionTop = section.getBoundingClientRect().top - scrollNode.getBoundingClientRect().top + scrollNode.scrollTop;
    programmaticAnchorRef.current = anchorId;
    setActiveAnchor(anchorId);
    clearProgrammaticScrollLock();
    scrollNode.scrollTo({
      top: Math.max(0, sectionTop - ANCHORED_PANEL_HEADER_OFFSET),
      behavior: 'auto',
    });
  };

  useEffect(() => {
    const nextAnchor = initialAnchor ?? firstAnchor ?? '';
    setActiveAnchor(nextAnchor);
    if (!nextAnchor) return undefined;

    const frame = window.requestAnimationFrame(() => {
      scrollToSection(nextAnchor);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [firstAnchor, initialAnchor]);

  const syncActiveSectionNow = () => {
    const scrollNode = scrollRef.current;
    if (!scrollNode) return;

    if (programmaticAnchorRef.current) {
      setActiveAnchor(programmaticAnchorRef.current);
      clearProgrammaticScrollLock();
      return;
    }

    const sections = Array.from(
      scrollNode.querySelectorAll<HTMLElement>('[data-anchored-panel-section]')
    );
    const lastSection = sections[sections.length - 1];
    if (lastSection && scrollNode.scrollTop + scrollNode.clientHeight >= scrollNode.scrollHeight - 8) {
      setActiveAnchor(lastSection.dataset.anchoredPanelSection ?? '');
      return;
    }

    const nextSection = sections
      .map(section => ({
        id: section.dataset.anchoredPanelSection ?? '',
        distance: Math.abs(section.getBoundingClientRect().top - scrollNode.getBoundingClientRect().top - ANCHORED_PANEL_HEADER_OFFSET),
      }))
      .sort((a, b) => a.distance - b.distance)[0];

    if (nextSection?.id) {
      setActiveAnchor(nextSection.id);
    }
  };

  const syncActiveSection = () => {
    if (activeSectionRafRef.current !== null) return;
    activeSectionRafRef.current = window.requestAnimationFrame(() => {
      activeSectionRafRef.current = null;
      syncActiveSectionNow();
    });
  };

  useEffect(() => {
    return () => {
      if (programmaticScrollTimeoutRef.current !== null) {
        window.clearTimeout(programmaticScrollTimeoutRef.current);
      }
      if (activeSectionRafRef.current !== null) {
        window.cancelAnimationFrame(activeSectionRafRef.current);
      }
    };
  }, []);

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-gradient-to-b from-[#f0f0f0] to-[#f0f0f0]/0 p-[2px] shadow-[0_0_1px_rgba(0,0,0,0.25)]',
        'omvra-settings-panel',
        className
      )}
    >
      <div className="sr-only">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] sm:grid-cols-[187px_minmax(0,1fr)] sm:grid-rows-none">
        <AnchoredPanelNav
          groups={navGroups}
          activeAnchor={activeAnchor}
          onSelect={scrollToSection}
          onBack={onBack}
        />
        <div className="omvra-settings-content relative h-full min-h-0 overflow-hidden rounded-[14px] bg-white shadow-[0_0_1px_rgba(0,0,0,0.20)]">
          <div className="pointer-events-none absolute -left-px -right-px -top-px z-10 flex h-[82px] items-start gap-4 bg-gradient-to-b from-white via-white to-white/0 px-8 pt-[17px]">
            <div className="min-w-0 flex-1 truncate text-sm font-semibold leading-[22px] text-[#71717a]">
              {title}
            </div>
            {headerAction && <div className="pointer-events-auto">{headerAction}</div>}
          </div>
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close panel"
              className="omvra-settings-close absolute right-2 top-2 z-10 size-8 rounded-full border-black/10 bg-white text-gray-900 shadow-none hover:bg-white"
            >
              <XMarkIcon className="size-4" />
            </Button>
          )}
          <AnchoredPanelScrollView
            ref={scrollRef}
            onScroll={syncActiveSection}
            contentClassName={contentClassName}
            className={footer ? 'pb-28' : undefined}
          >
            {children}
          </AnchoredPanelScrollView>
          {footer && (
            <div className="pointer-events-none absolute -bottom-px -left-px -right-px z-10 flex min-h-[82px] items-end bg-gradient-to-t from-white via-white to-white/0 px-8 py-3">
              <div className="pointer-events-auto w-full">
                {footer}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface AnchoredPanelNavProps {
  groups: AnchoredPanelNavGroup[];
  activeAnchor: string;
  onSelect: (anchorId: string) => void;
  onBack?: () => void;
}

export function AnchoredPanelNav({ groups, activeAnchor, onSelect, onBack }: AnchoredPanelNavProps) {
  return (
    <nav className="omvra-settings-nav min-h-0 overflow-x-auto overflow-y-hidden px-2 pb-2 pt-7" aria-label="Panel sections">
      <div className="flex min-w-max gap-4 sm:min-w-0 sm:block">
        {onBack && (
          <Button type="button" variant="ghost" onClick={onBack} className="justify-start px-3">
            Back
          </Button>
        )}
        {groups.map((group, groupIndex) => (
          <div
            key={group.label}
            className={cn(
              'min-w-36 space-y-3 sm:min-w-0',
              'omvra-settings-nav-group',
              groupIndex > 0 && 'mt-3 border-t border-zinc-500/10 pt-3'
            )}
          >
            <p className="px-2 text-[10px] font-semibold uppercase tracking-normal text-[#a5a5ac]">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map(item => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={item.disabled}
                    aria-current={activeAnchor === item.id ? 'true' : undefined}
                    onClick={() => onSelect(item.id)}
                    className={cn(
                      'flex h-8 w-full items-center gap-2 rounded-xl px-2 text-left text-xs font-medium outline-none transition-colors',
                      'omvra-settings-nav-item',
                      'focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2',
                      activeAnchor === item.id
                        ? 'active bg-zinc-500/15 text-[#71717a]'
                        : 'text-[#71717a] hover:bg-zinc-500/10',
                      item.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent'
                    )}
                  >
                    {Icon && <Icon className="size-4 shrink-0" />}
                    <span className="min-w-0 truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}

interface AnchoredPanelScrollViewProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode;
  contentClassName?: string;
}

export const AnchoredPanelScrollView = forwardRef<HTMLDivElement, AnchoredPanelScrollViewProps>(
  ({ children, className, contentClassName, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'feathered-scrollbar h-full min-h-0 overflow-y-auto px-8 pb-8 pt-[104px]',
        'omvra-settings-scroll',
        className
      )}
      {...props}
    >
      <div className={cn('mx-auto w-full max-w-[566px] space-y-32', contentClassName)}>
        {children}
      </div>
    </div>
  )
);
AnchoredPanelScrollView.displayName = 'AnchoredPanelScrollView';

interface AnchoredPanelSectionProps extends ComponentPropsWithoutRef<'section'> {
  id: string;
  title: string;
  icon?: ComponentType<{ className?: string }>;
  description?: string;
  headerAction?: ReactNode;
  children: ReactNode;
}

export function AnchoredPanelSection({
  id,
  title,
  icon: Icon,
  description,
  headerAction,
  children,
  className,
  ...props
}: AnchoredPanelSectionProps) {
  const titleId = `${id}-title`;

  return (
    <section
      id={id}
      data-anchored-panel-section={id}
      aria-labelledby={titleId}
      className={cn('scroll-mt-8 space-y-4', className)}
      {...props}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h3 id={titleId} className="flex items-center gap-2 text-[18px] font-normal leading-6 text-[#a5a5ac]">
            {Icon && <Icon className="size-[18px] shrink-0" />}
            {title}
          </h3>
          {description && <p className="text-xs leading-5 text-[#8a8a92]">{description}</p>}
        </div>
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </div>
      {children}
    </section>
  );
}

function XMarkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path
        fillRule="evenodd"
        d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
