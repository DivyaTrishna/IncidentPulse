import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Send } from "lucide-react";
import type { SubmitReportInput } from "../../types/incident";
import type { SubmitFeedback } from "../../hooks/useIncidents";

interface SubmitReportProps {
  onSubmit: (input: SubmitReportInput) => Promise<SubmitFeedback>;
}

const SOURCE_OPTIONS = [
  { value: "citizen_report", label: "Citizen" },
  { value: "social_media", label: "Social Feed" },
  { value: "official", label: "Official" },
  { value: "sensor", label: "Sensor" },
  { value: "other", label: "Other" },
];

export function SubmitReport({ onSubmit }: SubmitReportProps) {
  const [text, setText] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [source, setSource] = useState("citizen_report");
  const [timestamp, setTimestamp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<SubmitFeedback | null>(null);

  const canSubmit = text.trim().length > 0 && !submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const latitude = lat.trim() === "" ? null : Number(lat);
    const longitude = lng.trim() === "" ? null : Number(lng);

    if ((lat.trim() !== "" && Number.isNaN(latitude)) || (lng.trim() !== "" && Number.isNaN(longitude))) {
      setFeedback({ ok: false, message: "Latitude and longitude must be valid numbers.", incidentId: null, action: null });
      return;
    }
    if ((lat.trim() === "") !== (lng.trim() === "")) {
      setFeedback({
        ok: false,
        message: "Provide both latitude and longitude, or leave both blank.",
        incidentId: null,
        action: null,
      });
      return;
    }
    if (latitude !== null && (latitude < -90 || latitude > 90)) {
      setFeedback({ ok: false, message: "Latitude must be between -90 and 90.", incidentId: null, action: null });
      return;
    }
    if (longitude !== null && (longitude < -180 || longitude > 180)) {
      setFeedback({ ok: false, message: "Longitude must be between -180 and 180.", incidentId: null, action: null });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const result = await onSubmit({
        text: text.trim(),
        latitude,
        longitude,
        source,
        timestamp: timestamp ? new Date(timestamp).toISOString() : null,
      });
      setFeedback(result);
      if (result.ok) {
        setText("");
        setLat("");
        setLng("");
        setTimestamp("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-ip-border bg-ip-panel p-4">
      <div className="flex items-center gap-2">
        <Send size={15} className="text-ip-accent" />
        <h2 className="text-sm font-semibold tracking-wide text-ip-text">SUBMIT REPORT</h2>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor="report-text" className="text-[11px] font-medium uppercase tracking-wide text-ip-muted">
            Report text
          </label>
          <textarea
            id="report-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            required
            placeholder='e.g. "Heavy smoke reported near Market Road"'
            className="mt-1 w-full resize-none rounded-md border border-ip-border bg-ip-bg px-2.5 py-2 text-sm text-ip-text placeholder:text-ip-muted focus:border-ip-accent focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude">
            <input
              type="text"
              inputMode="decimal"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="15.490"
              className="w-full rounded-md border border-ip-border bg-ip-bg px-2.5 py-1.5 text-sm text-ip-text placeholder:text-ip-muted focus:border-ip-accent focus:outline-none"
            />
          </Field>
          <Field label="Longitude">
            <input
              type="text"
              inputMode="decimal"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="73.830"
              className="w-full rounded-md border border-ip-border bg-ip-bg px-2.5 py-1.5 text-sm text-ip-text placeholder:text-ip-muted focus:border-ip-accent focus:outline-none"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Source">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full rounded-md border border-ip-border bg-ip-bg px-2.5 py-1.5 text-sm text-ip-text focus:border-ip-accent focus:outline-none"
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Timestamp (optional)">
            <input
              type="datetime-local"
              value={timestamp}
              onChange={(e) => setTimestamp(e.target.value)}
              className="w-full rounded-md border border-ip-border bg-ip-bg px-2.5 py-1.5 text-sm text-ip-text focus:border-ip-accent focus:outline-none"
            />
          </Field>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-ip-accent px-3 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={14} />
          {submitting ? "Submitting…" : "Submit Report"}
        </button>

        {feedback && (
          <div
            role="status"
            className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${
              feedback.ok
                ? "border-ip-green/30 bg-ip-green/10 text-ip-green"
                : "border-ip-red/30 bg-ip-red/10 text-ip-red"
            }`}
          >
            {feedback.ok ? (
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            ) : (
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
            )}
            <span>{feedback.ok ? `✓ Report submitted — ${feedback.message}` : feedback.message}</span>
          </div>
        )}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-wide text-ip-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
