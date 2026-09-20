interface StatusIndicatorProps {
  color: string; // hex color for the dot
  label: string;
  pulse?: boolean;
  className?: string;
}

/** A small colored dot + label, used for connection status, incident
 * status, and severity badges throughout the dashboard. */
export function StatusIndicator({ color, label, pulse = false, className = "" }: StatusIndicatorProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${className}`}>
      <span
        className={`inline-block h-2 w-2 rounded-full ${pulse ? "animate-pulse-dot" : ""}`}
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
