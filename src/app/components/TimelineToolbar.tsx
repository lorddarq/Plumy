import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TodayButton } from './TodayButton';
import { UsersIcon } from './icons/UsersIcon';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface TimelineToolbarProps {
  mode: 'projects' | 'people';
  showWeekends: boolean;
  onModeChange: (mode: 'projects' | 'people') => void;
  onShowWeekendsChange: (showWeekends: boolean) => void;
  onScrollLeft: () => void;
  onScrollRight: () => void;
  onScrollToToday: () => void;
}

export function TimelineToolbar({
  mode,
  showWeekends,
  onModeChange,
  onShowWeekendsChange,
  onScrollLeft,
  onScrollRight,
  onScrollToToday,
}: TimelineToolbarProps) {
  return (
    <div className="timeline-toolbar">
      <div className="timeline-mode-toggle" role="tablist" aria-label="Timeline mode">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" onClick={() => onModeChange('projects')} className={`timeline-mode-button ${mode === 'projects' ? 'active' : 'inactive'}`} role="tab" aria-selected={mode === 'projects'} aria-label="Projects">
              <CalendarDaysIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Show projects</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" onClick={() => onModeChange('people')} className={`timeline-mode-button ${mode === 'people' ? 'active' : 'inactive'}`} role="tab" aria-selected={mode === 'people'} aria-label="People">
              <UsersIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Show people</TooltipContent>
        </Tooltip>
      </div>

      <h3 className="timeline-toolbar-title">{mode === 'people' ? 'People' : 'Projects'}</h3>

      <div className="timeline-toolbar-actions">
        <div className="timeline-toolbar-controls" aria-label="Timeline navigation">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onClick={onScrollLeft} className="timeline-icon-button timeline-icon-button-left" aria-label="Scroll timeline left">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Scroll timeline left</TooltipContent>
          </Tooltip>
          <TodayButton onClick={onScrollToToday} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onClick={onScrollRight} className="timeline-icon-button timeline-icon-button-right" aria-label="Scroll timeline right">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Scroll timeline right</TooltipContent>
          </Tooltip>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" onClick={() => onShowWeekendsChange(!showWeekends)} className={`timeline-week-toggle ${showWeekends ? 'is-seven-day' : 'is-five-day'}`} aria-pressed={!showWeekends}>
              {showWeekends ? '7 days' : '5 days'}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{showWeekends ? 'Hide weekends' : 'Show weekends'}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function CalendarDaysIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      className="h-4 w-4"
      viewBox="0 0 18 18"
      aria-hidden="true"
    >
      <title>calendar-days</title>
      <g fill="currentColor">
        <path d="M2.25 4.75C2.25 3.64543 3.14543 2.75 4.25 2.75H13.75C14.8546 2.75 15.75 3.64543 15.75 4.75V6.25H2.25V4.75Z" fill="currentColor" fillOpacity="0.3" data-stroke="none" stroke="none" />
        <path d="M5.75 2.75V0.75" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M12.25 2.75V0.75" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M13.75 2.75H4.25C3.14543 2.75 2.25 3.64543 2.25 4.75V13.25C2.25 14.3546 3.14543 15.25 4.25 15.25H13.75C14.8546 15.25 15.75 14.3546 15.75 13.25V4.75C15.75 3.64543 14.8546 2.75 13.75 2.75Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M2.25 6.25H15.75" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M9 8.25C8.449 8.25 8 8.699 8 9.25C8 9.801 8.449 10.25 9 10.25C9.551 10.25 10 9.801 10 9.25C10 8.699 9.551 8.25 9 8.25Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M12.5 10.25C13.051 10.25 13.5 9.801 13.5 9.25C13.5 8.699 13.051 8.25 12.5 8.25C11.949 8.25 11.5 8.699 11.5 9.25C11.5 9.801 11.949 10.25 12.5 10.25Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M9 11.25C8.449 11.25 8 11.699 8 12.25C8 12.801 8.449 13.25 9 13.25C9.551 13.25 10 12.801 10 12.25C10 11.699 9.551 11.25 9 11.25Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M5.5 11.25C4.949 11.25 4.5 11.699 4.5 12.25C4.5 12.801 4.949 13.25 5.5 13.25C6.051 13.25 6.5 12.801 6.5 12.25C6.5 11.699 6.051 11.25 5.5 11.25Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M12.5 11.25C11.949 11.25 11.5 11.699 11.5 12.25C11.5 12.801 11.949 13.25 12.5 13.25C13.051 13.25 13.5 12.801 13.5 12.25C13.5 11.699 13.051 11.25 12.5 11.25Z" fill="currentColor" data-stroke="none" stroke="none" />
      </g>
    </svg>
  );
}
