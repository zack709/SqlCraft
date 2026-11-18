import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export interface ContextMenuItem {
  id: string;
  label?: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  onClick?: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Keep menu inside viewport
  const left = Math.min(x, Math.max(8, window.innerWidth - 220));
  const top = Math.min(y, Math.max(8, window.innerHeight - items.length * 28 - 16));

  return (
    <div
      ref={menuRef}
      style={{ left, top }}
      className="fixed z-50 min-w-[196px] rounded border border-[#cbd5e1] bg-white py-1 shadow-lg text-[11px] text-[#1f2329]"
    >
      {items.map((item) => {
        if (item.divider) {
          return <div key={item.id} className="my-1 border-t border-[#e5e7eb]" />;
        }
        return (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onClick?.();
              onClose();
            }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition ${
              item.disabled
                ? "cursor-not-allowed text-[#9ca3af]"
                : item.danger
                ? "text-[#dc2626] hover:bg-[#fef2f2]"
                : "hover:bg-[#eff6ff] hover:text-[#1d4ed8]"
            }`}
          >
            <span className="flex h-3.5 w-3.5 items-center justify-center flex-shrink-0">
              {item.icon}
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
