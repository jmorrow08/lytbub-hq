'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatementList, type StatementRecord } from '@/components/client-portal/StatementList';
import { portalFetch } from '@/lib/client-portal/fetch';
import { useClientPortalContext } from '@/components/client-portal/ClientPortalShell';
import { Button } from '@/components/ui/button';

const PAGE_SIZE = 50;

export default function ClientStatementsPage() {
  const { activeClientId } = useClientPortalContext();
  const [statements, setStatements] = useState<StatementRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchStatements = useMemo(
    () =>
      async function fetchPage(): Promise<void> {
        if (!activeClientId) {
          setStatements([]);
          return;
        }
        setLoading(true);
        setError(null);
        try {
          const limit = PAGE_SIZE * page;
          const payload = await portalFetch(
            `/api/client-portal/invoices?clientId=${activeClientId}&limit=${limit}`,
          );
          setStatements((payload.invoices ?? []) as StatementRecord[]);
        } catch (err) {
          console.error('Failed to load statements', err);
          setError(err instanceof Error ? err.message : 'Unable to load statements.');
        } finally {
          setLoading(false);
        }
      },
    [activeClientId, page],
  );

  useEffect(() => {
    setPage(1);
  }, [activeClientId]);

  useEffect(() => {
    void fetchStatements();
  }, [fetchStatements]);

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-xl font-semibold text-slate-100">Statements</CardTitle>
            <p className="text-sm text-muted-foreground">
              View your historical invoices, download PDFs, and settle outstanding balances.
            </p>
          </div>
          {statements.length >= PAGE_SIZE && (
            <Button
              variant="outline"
              size="sm"
              className="border-slate-800 bg-slate-950/60 text-xs text-slate-200"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={loading}
            >
              Load more
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <StatementList statements={statements} isLoading={loading} />
        </CardContent>
      </Card>
    </div>
  );
}



