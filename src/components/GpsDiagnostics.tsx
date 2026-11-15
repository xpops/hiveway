import type { GpsLogEntry } from '../location/useStartLocation';

const clock = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3,
});

function formatTime(ms: number) {
  return Number.isFinite(ms) ? clock.format(ms) : 'Invalid timestamp';
}

export function GpsDiagnostics({ entries }: { entries: readonly GpsLogEntry[] }) {
  return (
    <details className="panel gps-diagnostics" open>
      <summary>GPS diagnostics</summary>
      {entries.length === 0 ? <p>Select Navigate and choose a floor to see location readings.</p> : (
        <ol className="gps-log" aria-label="Recent GPS events">
          {entries.map(entry => (
            <li className="gps-event" key={entry.id}>
              <div className="gps-event-header">
                <strong>{entry.result}</strong>
                <span>{formatTime(entry.receivedAt)} · Level {entry.floor}</span>
              </div>
              <p>{entry.detail}</p>
              {entry.reading && (
                <dl>
                  <dt>Raw lat/lon</dt>
                  <dd>{entry.reading.latitude.toFixed(7)}, {entry.reading.longitude.toFixed(7)}</dd>
                  <dt>Accuracy</dt>
                  <dd>±{entry.reading.accuracy.toFixed(1)} m</dd>
                  <dt>Measured</dt>
                  <dd>{formatTime(entry.reading.timestamp)}</dd>
                  <dt>Map x/y</dt>
                  <dd>{entry.reading.x.toFixed(1)}, {entry.reading.y.toFixed(1)}</dd>
                </dl>
              )}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
