import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Ellipsis } from 'lucide-react';
import { Button } from '@/app/components/ui/button';

interface OverflowActionMenuItem {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  title?: string;
  onSelect?: () => void;
}

interface OverflowActionMenuProps {
  menuLabel: string;
  items: OverflowActionMenuItem[];
  buttonClassName?: string;
  menuClassName?: string;
  onOpenChange?: (open: boolean) => void;
}

export function OverflowActionMenu({
  menuLabel,
  items,
  buttonClassName = 'h-8 w-9 rounded-xl border-black/10 bg-white text-[#71717a] shadow-none hover:bg-[#71717a]/5',
  menuClassName = 'absolute right-0 top-[34px] z-[100] w-[168px] overflow-hidden rounded-xl border border-black/10 bg-white p-1 text-sm shadow-[0_8px_24px_rgba(15,23,42,0.12),0_1px_2px_rgba(0,0,0,0.06)]',
  onOpenChange,
}: OverflowActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        onOpenChange?.(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        onOpenChange?.(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const runAction = (item: OverflowActionMenuItem) => {
    if (item.disabled) return;
    item.onSelect?.();
    setIsOpen(false);
    onOpenChange?.(false);
  };

  return (
    <div ref={menuRef} className="relative shrink-0">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={buttonClassName}
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={menuLabel}
        onClick={() => {
          const nextOpen = !isOpen;
          setIsOpen(nextOpen);
          onOpenChange?.(nextOpen);
        }}
      >
        <Ellipsis className="size-4" />
      </Button>

      {isOpen ? (
        <div role="menu" className={menuClassName}>
          {items.map(item => {
            const Icon = item.icon;
            const isDanger = item.tone === 'danger';

            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                title={item.title}
                className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-medium outline-none disabled:cursor-not-allowed disabled:text-[#a5a5ac] disabled:hover:bg-transparent disabled:focus-visible:bg-transparent ${
                  isDanger
                    ? 'text-[#cd0000] hover:bg-[#c40000]/10 focus-visible:bg-[#c40000]/10'
                    : 'text-[#67676f] hover:bg-[#71717a]/10 focus-visible:bg-[#71717a]/10'
                }`}
                onClick={() => runAction(item)}
              >
                {Icon ? <Icon className="size-4 shrink-0" /> : null}
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
