import { Check, TriangleAlert } from 'lucide-react';
import { OverflowActionMenu } from './OverflowActionMenu';
import { PenWritingIcon } from './icons/PenWritingIcon';
import { FilesCopyIcon } from './icons/FilesCopyIcon';
import { DesktopArrowDownIcon } from './icons/DesktopArrowDownIcon';
import { Play } from 'lucide-react';

type CopyState = 'idle' | 'copied' | 'failed';

interface TaskDetailsActionMenuProps {
  copyState: CopyState;
  canEdit: boolean;
  canExportPdf?: boolean;
  menuLabel?: string;
  copyLabel?: string;
  exportLabel?: string;
  onEdit?: () => void;
  onCopy: () => void;
  onExportPdf?: () => void;
  onStartWork?: () => void;
}

export function TaskDetailsActionMenu({
  copyState,
  canEdit,
  canExportPdf = false,
  menuLabel = 'Task actions',
  copyLabel = 'Copy Task Info',
  exportLabel = 'Export PDF',
  onEdit,
  onCopy,
  onExportPdf,
  onStartWork,
}: TaskDetailsActionMenuProps) {
  const CopyIcon = copyState === 'copied' ? Check : copyState === 'failed' ? TriangleAlert : FilesCopyIcon;

  return (
    <OverflowActionMenu
      menuLabel={menuLabel}
      items={[
        ...(canEdit ? [{ label: 'Edit', icon: PenWritingIcon, onSelect: onEdit }] : []),
        ...(onStartWork ? [{ label: 'Start work', icon: Play, onSelect: onStartWork }] : []),
        {
          label: copyLabel,
          icon: CopyIcon,
          onSelect: onCopy,
          title: copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : undefined,
        },
        {
          label: exportLabel,
          icon: DesktopArrowDownIcon,
          disabled: !canExportPdf,
          onSelect: canExportPdf ? onExportPdf : undefined,
        },
      ]}
    />
  );
}
