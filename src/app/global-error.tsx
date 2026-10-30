'use client';

// Last-resort boundary for errors in the root layout itself.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0 }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1>FoodBridge is temporarily unavailable</h1>
          <p style={{ color: '#64748b' }}>Please try again in a moment.</p>
          <button onClick={reset} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #cbd5e1', cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
