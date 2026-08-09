import { DialogFooter } from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';

interface TaskFooterActionsProps {
  canMoveToReview?: boolean;
  onMoveToReview?: () => void;
  onClose: () => void;
}

export function TaskFooterActions({
  canMoveToReview = false,
  onMoveToReview,
  onClose,
}: TaskFooterActionsProps) {
  return (
    <DialogFooter className="omvra-action-bar min-w-0 flex-wrap">
      {canMoveToReview && onMoveToReview && (
        <Button
          variant="outline"
          className="mr-auto"
          onClick={onMoveToReview}
        >
          Move to In Review
        </Button>
      )}
      <Button variant="outline" onClick={onClose}>Close</Button>
    </DialogFooter>
  );
}
