import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Button } from './ui/button';

interface TodayButtonProps {
  onClick: () => void;
  label?: string;
  tooltip?: string;
}

export function TodayButton({ onClick, label = 'Today', tooltip = 'Scroll to today' }: TodayButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          onClick={onClick}
          className="timeline-toolbar-button-secondary"
        >
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
