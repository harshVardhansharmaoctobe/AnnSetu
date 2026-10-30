'use client';

import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/states';
import { uploadImage, type ApiClientError } from '@/lib/client';

const ACCEPT = 'image/jpeg,image/png,image/webp';

/** Uploads an image to /api/uploads and reports the stored URL. */
export function ImageUpload({
  value,
  onChange,
  label = 'Add photo',
  required,
  id = 'image-upload',
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  required?: boolean;
  id?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError('Images must be 5 MB or smaller.');
      return;
    }
    setBusy(true);
    try {
      onChange(await uploadImage(file));
    } catch (e) {
      setError((e as ApiClientError).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Uploaded" className="h-40 w-auto max-w-full rounded-lg border object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 rounded-full bg-white/90 p-1 shadow hover:bg-white"
            aria-label="Remove photo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Spinner className="mr-2" /> : <ImagePlus className="mr-2 h-4 w-4" />}
          {busy ? 'Uploading…' : label}
          {required && <span className="ml-1 text-destructive">*</span>}
        </Button>
      )}
      <input
        ref={input}
        id={id}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => pick(e.target.files?.[0])}
        data-testid={id}
      />
      <p className="text-xs text-muted-foreground">JPEG, PNG or WebP, up to 5 MB.</p>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}
