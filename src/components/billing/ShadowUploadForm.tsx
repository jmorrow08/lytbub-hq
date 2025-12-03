import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { uploadShadowBreakdown } from '@/lib/api';

export function ShadowUploadForm(props: {
  invoiceId: string | null;
  onMerge: (payload: Record<string, unknown>) => void;
}) {
  const { invoiceId, onMerge } = props;
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);
    if (!invoiceId) {
      setError('Select an invoice first.');
      return;
    }
    if (!file) {
      setError('Choose a CSV or PDF file.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await uploadShadowBreakdown({ invoiceId, file });
      if (result.portalPayload) {
        onMerge(result.portalPayload);
      } else {
        // Merge conservatively
        onMerge({ shadowItems: result.shadowItems, shadowSummary: result.shadowSummary });
      }
      setStatus(
        `Parsed ${result.shadowItems?.length ?? 0} items${
          result.warnings?.length ? ` (${result.warnings.join('; ')})` : ''
        }. Review and save below.`,
      );
      setFile(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to parse upload.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload fee breakdown (CSV or PDF)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground text-xs">
          Upload a CSV or PDF with your fee breakdown. We’ll extract line-item details and retainer
          context into the invoice’s Value breakdown section. CSV gives best results.
        </p>
        <form className="flex flex-wrap items-center gap-3" onSubmit={handleSubmit}>
          <input
            type="file"
            accept=".csv,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-xs"
          />
          <Button type="submit" disabled={!invoiceId || !file || submitting}>
            {submitting ? 'Uploading…' : 'Parse file'}
          </Button>
        </form>
        {error && <div className="text-xs text-red-500">{error}</div>}
        {status && <div className="text-xs text-emerald-600">{status}</div>}
      </CardContent>
    </Card>
  );
}
