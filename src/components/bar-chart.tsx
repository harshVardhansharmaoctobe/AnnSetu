/**
 * Minimal dependency-free grouped bar chart (SVG). Each series is drawn side by side per label;
 * values are also exposed as a text table for screen readers.
 */
export interface ChartSeries {
  name: string;
  color: string;
  values: number[];
}

export function BarChart({ labels, series, height = 180, title }: { labels: string[]; series: ChartSeries[]; height?: number; title: string }) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const groupWidth = 100 / Math.max(1, labels.length);
  const barWidth = (groupWidth * 0.8) / Math.max(1, series.length);
  const step = Math.max(1, Math.ceil(labels.length / 8)); // at most ~8 axis labels

  return (
    <figure className="space-y-2">
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} /> {s.name}</span>
        ))}
      </div>
      <svg viewBox={`0 0 100 ${height / 3}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label={title}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1="0" x2="100" y1={(height / 3) * (1 - f)} y2={(height / 3) * (1 - f)} stroke="currentColor" strokeOpacity="0.08" strokeWidth="0.2" />
        ))}
        {labels.map((label, i) =>
          series.map((s, j) => {
            const v = s.values[i] ?? 0;
            const h = (v / max) * (height / 3 - 1);
            return (
              <rect key={`${label}-${s.name}`} x={i * groupWidth + groupWidth * 0.1 + j * barWidth} y={height / 3 - h} width={barWidth * 0.9} height={h} fill={s.color} rx="0.4">
                <title>{`${label} · ${s.name}: ${v}`}</title>
              </rect>
            );
          })
        )}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground" aria-hidden>
        {labels.map((l, i) => <span key={l} className={i % step === 0 ? '' : 'invisible'}>{l}</span>)}
      </div>
      <figcaption className="sr-only">
        {title}: {labels.map((l, i) => `${l} – ${series.map((s) => `${s.name} ${s.values[i] ?? 0}`).join(', ')}`).join('; ')}
      </figcaption>
    </figure>
  );
}
