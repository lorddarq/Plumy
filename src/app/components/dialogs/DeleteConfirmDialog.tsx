import { Dialog } from '../ui/dialog';
import { Button } from '../ui/button';
import { DialogSurface, DialogSurfaceFooter, DialogSurfaceHeader } from './DialogSurface';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  onOpenChange,
  onCancel,
  onConfirm,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogSurface
          showClose={false}
          overlayClassName="omvra-settings-overlay"
          className="max-w-[430px] rounded-[28px] border border-black/5 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
        >
          <DialogSurfaceHeader
            title={title}
            description={description}
            className="border-b-0"
          />
        <DialogSurfaceFooter className="border-t-0 bg-white pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            className="h-8 rounded-[12px] border border-[#f0c8c8] bg-[#fbeaea] px-4 text-[14px] font-normal text-[#ff0000] shadow-none hover:bg-[#f7dddd] hover:text-[#ff0000]"
          >
            {confirmLabel}
          </Button>
        </DialogSurfaceFooter>
      </DialogSurface>
    </Dialog>
  );
}
