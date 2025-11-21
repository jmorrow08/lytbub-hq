'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  getClientProjects,
  getBillingPeriods,
  getInvoices,
  createBillingPeriod,
  importUsageCsv,
  createDraftInvoice,
  finalizeInvoice,
  markInvoicePaidOffline,
  updateSubscriptionSettings,
} from '@/lib/api';
import type { BillingPeriod, Invoice, Project } from '@/types';
import { UsageImportForm } from '@/components/billing/UsageImportForm';
import { InvoiceBuilder } from '@/components/billing/InvoiceBuilder';
import { SubscriptionManager } from '@/components/billing/SubscriptionManager';
import { InvoiceList } from '@/components/billing/InvoiceList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function BillingPage() {
  const [clients, setClients] = useState<Project[]>([]);
  const [billingPeriods, setBillingPeriods] = useState<BillingPeriod[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [draftInvoice, setDraftInvoice] = useState<Invoice | null>(null);

  const [selectedClientId, setSelectedClientId] = useState('');

  const [loading, setLoading] = useState(true);
  const [usageUploading, setUsageUploading] = useState(false);
  const [invoiceGenerating, setInvoiceGenerating] = useState(false);
  const [finalizingId, setFinalizingId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [updatingSubscriptionId, setUpdatingSubscriptionId] = useState<string | null>(null);

  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [periodForm, setPeriodForm] = useState({
    projectId: '',
    periodStart: '',
    periodEnd: '',
    notes: '',
  });
  const [creatingPeriod, setCreatingPeriod] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [clientList, periods, invoiceList] = await Promise.all([
        getClientProjects(),
        getBillingPeriods(),
        getInvoices(),
      ]);
      setClients(clientList);
      setBillingPeriods(periods);
      setInvoices(invoiceList);
      setSelectedClientId((prev) => prev || (clientList[0]?.id ?? ''));
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to load billing data.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleImportUsage = async (params: {
    projectId: string;
    billingPeriodId: string;
    file: File;
  }) => {
    setUsageUploading(true);
    try {
      const result = await importUsageCsv(params);
      setStatus({
        type: 'success',
        message: `Imported ${result.imported} usage rows.`,
      });
      await loadBillingPeriods();
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to import usage data.';
      setStatus({ type: 'error', message });
      throw error;
    } finally {
      setUsageUploading(false);
    }
  };

  const loadBillingPeriods = async () => {
    const periods = await getBillingPeriods();
    setBillingPeriods(periods);
  };

  const handleGenerateInvoice = async (params: {
    billingPeriodId: string;
    includeProcessingFee: boolean;
    memo?: string;
  }) => {
    setInvoiceGenerating(true);
    try {
      const invoice = await createDraftInvoice(params);
      setDraftInvoice(invoice);
      setStatus({ type: 'success', message: 'Draft invoice created.' });
      await loadInvoices();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to create draft invoice.';
      setStatus({ type: 'error', message });
      throw error;
    } finally {
      setInvoiceGenerating(false);
    }
  };

  const loadInvoices = async () => {
    const invoiceList = await getInvoices();
    setInvoices(invoiceList);
  };

  const handleFinalizeInvoice = async (invoiceId: string) => {
    setFinalizingId(invoiceId);
    try {
      await finalizeInvoice(invoiceId);
      setStatus({ type: 'success', message: 'Invoice finalized.' });
      await loadInvoices();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to finalize invoice.';
      setStatus({ type: 'error', message });
    } finally {
      setFinalizingId(null);
    }
  };

  const handleMarkOffline = async (invoiceId: string) => {
    setMarkingId(invoiceId);
    try {
      await markInvoicePaidOffline(invoiceId);
      setStatus({ type: 'success', message: 'Invoice marked as paid.' });
      await loadInvoices();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to update invoice.';
      setStatus({ type: 'error', message });
    } finally {
      setMarkingId(null);
    }
  };

  const handleCreatePeriod = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!periodForm.projectId || !periodForm.periodStart || !periodForm.periodEnd) {
      setStatus({ type: 'error', message: 'Complete the billing period form.' });
      return;
    }
    setCreatingPeriod(true);
    try {
      const project = clients.find((client) => client.id === periodForm.projectId);
      const period = await createBillingPeriod({
        projectId: periodForm.projectId,
        clientId: project?.client_id ?? undefined,
        periodStart: periodForm.periodStart,
        periodEnd: periodForm.periodEnd,
        notes: periodForm.notes || undefined,
      });
      setStatus({
        type: 'success',
        message: `Billing period ${period.period_start} → ${period.period_end} created.`,
      });
      setPeriodForm({ projectId: '', periodStart: '', periodEnd: '', notes: '' });
      await loadBillingPeriods();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to create billing period.';
      setStatus({ type: 'error', message });
    } finally {
      setCreatingPeriod(false);
    }
  };

  const handleSubscriptionUpdate = async (
    projectId: string,
    updates: {
      subscriptionEnabled?: boolean;
      baseRetainerCents?: number | null;
      paymentMethodType?: 'card' | 'ach' | 'offline';
      autoPayEnabled?: boolean;
      achDiscountCents?: number;
    }
  ) => {
    setUpdatingSubscriptionId(projectId);
    try {
      await updateSubscriptionSettings({ projectId, ...updates });
      setStatus({ type: 'success', message: 'Subscription updated.' });
      const refreshedClients = await getClientProjects();
      setClients(refreshedClients);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to update subscription.';
      setStatus({ type: 'error', message });
      throw error;
    } finally {
      setUpdatingSubscriptionId(null);
    }
  };

  const filteredPeriods = billingPeriods.filter(
    (period) => !selectedClientId || period.project_id === selectedClientId
  );

  const activeClient = clients.find((client) => client.id === selectedClientId) || null;
  const clientLookup = useMemo(() => {
    const map: Record<string, string> = {};
    clients.forEach((client) => {
      map[client.id] = client.name;
    });
    return map;
  }, [clients]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Billing</h1>
          <p className="text-muted-foreground">
            Manage retainers, usage billing, and automated invoices.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/finance">Back to Finance</Link>
        </Button>
      </div>

      {status && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            status.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
              : 'border-red-500/40 bg-red-500/10 text-red-600'
          }`}
        >
          {status.message}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
          Loading billing data…
        </div>
      ) : (
        <div className="space-y-6">
          <SubscriptionManager
            clients={clients}
            onUpdate={handleSubscriptionUpdate}
            updatingId={updatingSubscriptionId}
            onSelectClient={setSelectedClientId}
          />

          <Card>
            <CardHeader>
              <CardTitle>Create Billing Period</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreatePeriod}>
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="period-client">
                    Client
                  </label>
                  <select
                    id="period-client"
                    value={periodForm.projectId}
                    onChange={(event) =>
                      setPeriodForm((prev) => ({ ...prev, projectId: event.target.value }))
                    }
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
                  <label className="block text-sm font-medium mb-1" htmlFor="period-notes">
                    Notes
                  </label>
                  <Input
                    id="period-notes"
                    placeholder="Optional notes"
                    value={periodForm.notes}
                    onChange={(event) =>
                      setPeriodForm((prev) => ({ ...prev, notes: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="period-start">
                    Period Start
                  </label>
                  <Input
                    id="period-start"
                    type="date"
                    value={periodForm.periodStart}
                    onChange={(event) =>
                      setPeriodForm((prev) => ({ ...prev, periodStart: event.target.value }))
                    }
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="period-end">
                    Period End
                  </label>
                  <Input
                    id="period-end"
                    type="date"
                    value={periodForm.periodEnd}
                    onChange={(event) =>
                      setPeriodForm((prev) => ({ ...prev, periodEnd: event.target.value }))
                    }
                    required
                  />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button type="submit" disabled={creatingPeriod}>
                    {creatingPeriod ? 'Creating…' : 'Create Billing Period'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <UsageImportForm
              clients={clients}
              billingPeriods={billingPeriods}
              selectedProjectId={selectedClientId}
              onSelectProject={setSelectedClientId}
              onImport={handleImportUsage}
              submitting={usageUploading}
            />

            <InvoiceBuilder
              billingPeriods={filteredPeriods}
              onGenerate={handleGenerateInvoice}
              generating={invoiceGenerating}
              draftInvoice={draftInvoice}
            />
          </div>

          {activeClient && (
            <Card>
              <CardHeader>
                <CardTitle>Client Snapshot</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Base Retainer</p>
                  <p className="text-xl font-semibold">
                    {currency.format((activeClient.base_retainer_cents ?? 0) / 100)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Payment Method</p>
                  <p className="text-xl font-semibold capitalize">
                    {activeClient.payment_method_type || 'card'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Auto-Pay</p>
                  <p className="text-xl font-semibold">
                    {activeClient.auto_pay_enabled ? 'Enabled' : 'Manual'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <InvoiceList
            invoices={invoices}
            onFinalize={handleFinalizeInvoice}
            onMarkOffline={handleMarkOffline}
            finalizingId={finalizingId}
            markingId={markingId}
            clientLookup={clientLookup}
          />
        </div>
      )}
    </div>
  );
}
