'use client';

import { useMemo, useState } from 'react';
import type { BillingPeriod, Project } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type UsageImportFormProps = {
  clients: Project[];
  billingPeriods: BillingPeriod[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  onImport: (params: {
    projectId: string;
    billingPeriodId: string;
    file: File;
  }) => Promise<{ warnings?: string[] }>;
  submitting: boolean;
};

export function UsageImportForm({
  clients,
  billingPeriods,
  selectedProjectId,
  onSelectProject,
  onImport,
  submitting,
}: UsageImportFormProps) {
  const [billingPeriodId, setBillingPeriodId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const filteredPeriods = useMemo(
    () => billingPeriods.filter((period) => period.project_id === selectedProjectId),
    [billingPeriods, selectedProjectId],
  );

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    } else {
      setFile(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setWarnings([]);

    if (!selectedProjectId) {
      setError('Select a client project.');
      return;
    }

    if (!billingPeriodId) {
      setError('Select a billing period.');
      return;
    }

    if (!file) {
      setError('Attach a CSV file to import.');
      return;
    }

    try {
      const result = await onImport({ projectId: selectedProjectId, billingPeriodId, file });
      if (Array.isArray(result?.warnings) && result.warnings.length > 0) {
        setWarnings(result.warnings);
      }
      setFile(null);
      (event.target as HTMLFormElement).reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import usage data.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage Imports</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="usage-client" className="block text-sm font-medium mb-1">
              Client
            </label>
            <select
              id="usage-client"
              value={selectedProjectId}
              onChange={(event) => {
                onSelectProject(event.target.value);
                setBillingPeriodId('');
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            >
              <option value="">Select client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="usage-period" className="block text-sm font-medium mb-1">
              Billing Period
            </label>
            <select
              id="usage-period"
              value={billingPeriodId}
              onChange={(event) => setBillingPeriodId(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
              disabled={!selectedProjectId}
            >
              <option value="">Select billing period</option>
              {filteredPeriods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.period_start} → {period.period_end} ({period.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="usage-file" className="block text-sm font-medium mb-1">
              Usage CSV
            </label>
            <Input id="usage-file" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
            <p className="text-xs text-muted-foreground mt-1">
              Flexible CSV: requires <span className="font-medium">date</span> and either{' '}
              <span className="font-medium">unit_price</span> or{' '}
              <span className="font-medium">total</span>. Optional: client_name, metric_type,
              quantity, description. Common header synonyms are supported (qty, price, amount,
              details, etc.).
            </p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {warnings.length > 0 && (
            <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-xs text-yellow-800 dark:text-yellow-300 space-y-1">
              <p className="font-medium">Import completed with warnings:</p>
              <ul className="list-disc pl-4 space-y-1">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Uploading…' : 'Import Usage'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
