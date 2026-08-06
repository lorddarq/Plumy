import { FilesCopyIcon } from '../icons/FilesCopyIcon';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface McpCommandSettingsSectionProps {
  testCommand: string;
  writeCommand: string;
  tunnelCommand: string;
  retryGuidance: string;
  copiedTestCommand: boolean;
  copiedWriteCommand: boolean;
  copiedTunnelCommand: boolean;
  onCopyTestCommand: () => void;
  onCopyWriteCommand: () => void;
  onCopyTunnelCommand: () => void;
}

const LABEL_CLASS = 'text-sm font-semibold leading-5 text-[#71717a]';
const DESCRIPTION_CLASS = 'text-xs leading-4 text-[#6a7282] text-pretty';
const FIELD_CLASS =
  'h-8 rounded-xl border-[#e5e7eb] bg-white px-2 text-sm font-medium text-[#71717a] shadow-[0_1px_2px_rgba(0,0,0,0.04)] placeholder:text-[#b5b5ba] focus-visible:ring-gray-200';

export function McpCommandSettingsSection({
  testCommand,
  writeCommand,
  tunnelCommand,
  retryGuidance,
  copiedTestCommand,
  copiedWriteCommand,
  copiedTunnelCommand,
  onCopyTestCommand,
  onCopyWriteCommand,
  onCopyTunnelCommand,
}: McpCommandSettingsSectionProps) {
  return (
    <div className="space-y-8">
      <CommandField
        id="mcp-test-command"
        title="Read-only connection check"
        description="Generated from the current connection host, port, and token settings."
        command={testCommand}
        copied={copiedTestCommand}
        onCopy={onCopyTestCommand}
      />

      <CommandField
        id="mcp-write-command"
        title="Workspace update check"
        description="Replace `<task-id>` and `<revision>` with values from the workspace snapshot."
        command={writeCommand}
        copied={copiedWriteCommand}
        onCopy={onCopyWriteCommand}
        footer={retryGuidance}
      />

      <CommandField
        id="mcp-tunnel-command"
        title="Local Tunnel Command"
        description="Run this in Terminal to expose your local connection endpoint publicly."
        command={tunnelCommand}
        copied={copiedTunnelCommand}
        onCopy={onCopyTunnelCommand}
        footer="To close localtunnel: press `Ctrl + C` in that terminal window. If it was started in background: `pkill -f localtunnel`."
      />
    </div>
  );
}

function CommandField({
  id,
  title,
  description,
  command,
  copied,
  onCopy,
  footer,
}: {
  id: string;
  title: string;
  description: string;
  command: string;
  copied: boolean;
  onCopy: () => void;
  footer?: string;
}) {
  return (
    <div className="space-y-3">
      <Label htmlFor={id} className={LABEL_CLASS}>
        {title}
      </Label>
      <p className={DESCRIPTION_CLASS}>{description}</p>
      <div className="relative">
        <Input id={id} value={command.replace(/\s+/g, ' ')} readOnly className={`${FIELD_CLASS} pr-10`} />
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? 'Copied' : `Copy ${title}`}
          title={copied ? 'Copied' : `Copy ${title}`}
          className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-[#71717a] outline-none transition-[background-color,color] hover:bg-zinc-500/10 hover:text-[#4b4b54] focus-visible:ring-2 focus-visible:ring-gray-300"
        >
          <FilesCopyIcon className="size-4" />
        </button>
      </div>
      {footer && <p className={DESCRIPTION_CLASS}>{footer}</p>}
    </div>
  );
}
