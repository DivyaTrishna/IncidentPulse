import { Bell, X } from "lucide-react";
import type { NotificationItem } from "../../types/incident";

interface NotificationsProps {
  items: NotificationItem[];
  onDismiss: (id: string) => void;
  onOpen: (incidentId: string) => void;
}

export function Notifications({ items, onDismiss, onOpen }: NotificationsProps) {
  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[300px] flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="pointer-events-auto animate-slide-in rounded-lg border border-ip-accent/30 bg-ip-panel p-3 shadow-panel"
        >
          <div className="flex items-start gap-2">
            <Bell size={14} className="mt-0.5 shrink-0 text-ip-accent" />
            <button
              type="button"
              onClick={() => onOpen(item.incidentId)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="text-xs font-semibold text-ip-text">{item.title}</p>
              <p className="mt-0.5 truncate text-xs text-ip-muted">{item.detail}</p>
            </button>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              aria-label="Dismiss notification"
              className="shrink-0 text-ip-muted hover:text-ip-text"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
