'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  deletePayment,
  getClients,
  getClientProjects,
  getPayments,
  // Billing
  getBillingPeriods,
  getInvoices,
  createBillingPeriod,
  importUsageCsv,
  createDraftInvoice,
  finalizeInvoice,
  markInvoicePaidOffline,
  updateSubscriptionSettings,
  // Revenue
  getRevenue,
  createRevenue,
  updateRevenue,
  deleteRevenue,
} from '@/lib/api';
import type {
  BillingPeriod,
  CheckoutSessionResponse,
  Client,
  CreateRevenueData,
  Invoice,
  Payment,
  Project,
  Revenue,
  UpdateRevenueData,
} from '@/types';
import { Loader2, Copy, ExternalLink, Trash2, DollarSign, Plus, Pencil, Trash } from 'lucide-react';
import { runFinanceBackfills } from '@/lib/maintenance';
import { executeStripeCheckout } from '@/lib/payments';
import { getActiveTimezone, getMonthRangeUTC } from '@/lib/timezone';
import { supabase } from '@/lib/supabaseClient';
import { UsageImportForm } from '@/components/billing/UsageImportForm';
import { InvoiceBuilder } from '@/components/billing/InvoiceBuilder';
import { SubscriptionManager } from '@/components/billing/SubscriptionManager';
import { InvoiceList } from '@/components/billing/InvoiceList';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

type BillingStatus = {
  type: 'success' | 'error';
  message: string;
  details?: string | null;
} | null;

type TabKey = 'overview' | 'billing' | 'revenue';

export default function FinancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabKey) || 'overview';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // Overview (Payments) state
  const [clients, setClients] = useState<Client[]>([]);
  const [clientProjects, setClientProjects] = useState<Project[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkResult, setLinkResult] = useState<CheckoutSessionResponse | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    clientId: '',
    projectId: '',
  });

  // Billing state
  const [billingClients, setBillingClients] = useState<Project[]>([]);
  const [billingPeriods, setBillingPeriods] = useState<BillingPeriod[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [draftInvoice, setDraftInvoice] = useState<Invoice | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [loadingBilling, setLoadingBilling] = useState(true);
  const [usageUploading, setUsageUploading] = useState(false);
  const [invoiceGenerating, setInvoiceGenerating] = useState(false);
  const [finalizingId, setFinalizingId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [updatingSubscriptionId, setUpdatingSubscriptionId] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus>(null);
  const [showBillingDetails, setShowBillingDetails] = useState(false);
  const [periodForm, setPeriodForm] = useState({
    projectId: '',
    periodStart: '',
    periodEnd: '',
    notes: '',
  });
  const [creatingPeriod, setCreatingPeriod] = useState(false);

  // Revenue state
  const [revenue, setRevenue] = useState<Revenue[]>([]);
  const [loadingRevenue, setLoadingRevenue] = useState(true);
  const [showRevenueForm, setShowRevenueForm] = useState(false);
  const [revenueForm, setRevenueForm] = useState({ source: '', amount: '', description: '' });
  const [revenueSubmitting, setRevenueSubmitting] = useState(false);
  const [isEditingRevenue, setIsEditingRevenue] = useState(false);
  const [editingRevenueEntry, setEditingRevenueEntry] = useState<Revenue | null>(null);
  const [deletingRevenueId, setDeletingRevenueId] = useState<string | null>(null);
  const [activeTimezone, setActiveTimezone] = useState('America/New_York');

  const hasClients = useMemo(() => clients.length > 0, [clients]);

  // Tab routing sync
  useEffect(() => {
    const current = searchParams.get('tab') as TabKey | null;
    if (current && current !== activeTab) {
      setActiveTab(current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setTab = (tab: TabKey) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`?${params.toString()}`);
  };

  // Overview loaders
  const loadFinanceData = async () => {
    setLoadingOverview(true);
    setError(null);
    try {
      const [paymentsData, clientData, clientList] = await Promise.all([
        getPayments(),
        getClientProjects(),
        getClients(),
      ]);
      setPayments(paymentsData);
      setClientProjects(clientData);
      setClients(clientList);
      setFormData((prev) => ({
        ...prev,
        clientId: prev.clientId || clientList[0]?.id || '',
      }));
    } catch (err) {
      console.error(err);
      setError('Unable to load finance data. Please ensure you are signed in.');
    } finally {
      setLoadingOverview(false);
    }
  };

  // Billing loaders
  const loadBillingData = useCallback(async () => {
    setLoadingBilling(true);
    try {
      const [clientList, periods, invoiceList] = await Promise.all([
        getClientProjects(),
        getBillingPeriods(),
        getInvoices(),
      ]);
      setBillingClients(clientList);
      setBillingPeriods(periods);
      setInvoices(invoiceList);
      setSelectedProjectId((prev) => prev || (clientList[0]?.id ?? ''));
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to load billing data.';
      setBillingStatus({
        type: 'error',
        message: 'Unable to load billing data.',
        details: detail,
      });
    } finally {
      setLoadingBilling(false);
    }
  }, []);

  // Revenue loaders
  const fetchRevenue = async () => {
    try {
      const data = await getRevenue();
      setRevenue(data);
    } catch (error) {
      console.error('Error fetching revenue:', error);
    } finally {
      setLoadingRevenue(false);
    }
  };

  useEffect(() => {
    runFinanceBackfills().finally(loadFinanceData);
    // Load all tabs upfront so switching is instant
    loadBillingData();
    fetchRevenue();
  }, [loadBillingData]);

  useEffect(() => {
    const resolveTimezone = async () => {
      const tz = await getActiveTimezone(supabase);
      setActiveTimezone(tz);
    };
    resolveTimezone();
  }, []);

  useEffect(() => {
    setShowBillingDetails(false);
  }, [billingStatus]);

  const triggerToast = (type: 'success' | 'error', message: string) => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    setToast({ type, message });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  // Overview handlers
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const amountValue = parseFloat(formData.amount);

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError('Enter a positive payment amount.');
      return;
    }
    if (!formData.clientId) {
      setError('Select a client.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setLinkResult(null);

    try {
      const projectSelection = selectedProject ?? null;
      const checkout = await executeStripeCheckout(
        amountValue,
        formData.description,
        selectedClient ? { id: selectedClient.id, name: selectedClient.name } : null,
        projectSelection ? { id: projectSelection.id, name: projectSelection.name } : null,
      );

      setLinkResult(checkout);
      setFormData((prev) => ({
        amount: '',
        description: '',
        clientId: prev.clientId,
        projectId: '',
      }));
      loadFinanceData();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to create payment link');
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      triggerToast('success', 'Checkout link copied to clipboard.');
    } catch (err) {
      console.error('Clipboard error', err);
      triggerToast('error', 'Unable to copy link. Please copy manually.');
    }
  };

  const selectedClient = useMemo(() => {
    if (!formData.clientId) return null;
    return clients.find((client) => client.id === formData.clientId) ?? null;
  }, [clients, formData.clientId]);

  const clientProjectOptions = useMemo(() => {
    if (!formData.clientId) return clientProjects;
    return clientProjects.filter((project) => project.client_id === formData.clientId);
  }, [clientProjects, formData.clientId]);

  const selectedProject = useMemo(() => {
    if (!formData.projectId) return null;
    return clientProjectOptions.find((project) => project.id === formData.projectId) ?? null;
  }, [clientProjectOptions, formData.projectId]);

  const formatMethodDisplay = (
    method?: string | null,
    brand?: string | null,
    last4?: string | null,
  ) => {
    if (!method && !brand && !last4) return '—';
    const label = brand || method || '—';
    return last4 ? `${label} ••••${last4}` : label;
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('Delete this payment entry? This action cannot be undone.');
      if (!confirmed) return;
    }

    setDeletingPaymentId(paymentId);
    try {
      await deletePayment(paymentId);
      setPayments((prev) => prev.filter((payment) => payment.id !== paymentId));
      triggerToast('success', 'Payment entry deleted.');
    } catch (err) {
      console.error(err);
      triggerToast('error', err instanceof Error ? err.message : 'Failed to delete payment.');
    } finally {
      setDeletingPaymentId(null);
    }
  };

  // Billing handlers
  const handleImportUsage = async (params: {
    projectId: string;
    billingPeriodId: string;
    file: File;
  }) => {
    setUsageUploading(true);
    try {
      const result = await importUsageCsv(params);
      setBillingStatus({
        type: 'success',
        message: `Imported ${result.imported} usage rows.`,
      });
      await loadBillingPeriodsOnly();
      return result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Failed to import usage data.';
      setBillingStatus({
        type: 'error',
        message: 'Failed to import usage data.',
        details: detail,
      });
      throw error;
    } finally {
      setUsageUploading(false);
    }
  };

  const loadBillingPeriodsOnly = async () => {
    const periods = await getBillingPeriods();
    setBillingPeriods(periods);
  };

  const handleGenerateInvoice = async (params: {
    billingPeriodId: string;
    includeProcessingFee: boolean;
    includeRetainer?: boolean;
    memo?: string;
    manualLines?: Array<{ description: string; quantity?: number; unitPriceCents: number }>;
    collectionMethod?: 'charge_automatically' | 'send_invoice';
    dueDate?: string;
  }) => {
    setInvoiceGenerating(true);
    try {
      const invoice = await createDraftInvoice(params);
      setDraftInvoice(invoice);
      setBillingStatus({ type: 'success', message: 'Draft invoice created.' });
      await loadInvoicesOnly();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to create draft invoice.';
      setBillingStatus({
        type: 'error',
        message: 'Unable to create draft invoice.',
        details: detail,
      });
      throw error;
    } finally {
      setInvoiceGenerating(false);
    }
  };

  const loadInvoicesOnly = async () => {
    const invoiceList = await getInvoices();
    setInvoices(invoiceList);
  };

  const handleFinalizeInvoice = async (invoiceId: string) => {
    setFinalizingId(invoiceId);
    try {
      await finalizeInvoice(invoiceId);
      setBillingStatus({ type: 'success', message: 'Invoice finalized.' });
      await loadInvoicesOnly();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to finalize invoice.';
      setBillingStatus({
        type: 'error',
        message: 'Unable to finalize invoice.',
        details: message,
      });
    } finally {
      setFinalizingId(null);
    }
  };

  const handleMarkOffline = async (invoiceId: string) => {
    setMarkingId(invoiceId);
    try {
      await markInvoicePaidOffline(invoiceId);
      setBillingStatus({ type: 'success', message: 'Invoice marked as paid.' });
      await loadInvoicesOnly();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update invoice.';
      setBillingStatus({
        type: 'error',
        message: 'Unable to update invoice.',
        details: message,
      });
    } finally {
      setMarkingId(null);
    }
  };

  const handleCreatePeriod = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!periodForm.projectId || !periodForm.periodStart || !periodForm.periodEnd) {
      setBillingStatus({
        type: 'error',
        message: 'Complete the billing period form.',
        details: 'Project, period start, and period end are required.',
      });
      return;
    }
    setCreatingPeriod(true);
    try {
      const project = billingClients.find((client) => client.id === periodForm.projectId);
      const period = await createBillingPeriod({
        projectId: periodForm.projectId,
        clientId: project?.client_id ?? undefined,
        periodStart: periodForm.periodStart,
        periodEnd: periodForm.periodEnd,
        notes: periodForm.notes || undefined,
      });
      setBillingStatus({
        type: 'success',
        message: `Billing period ${period.period_start} → ${period.period_end} created.`,
      });
      setPeriodForm({ projectId: '', periodStart: '', periodEnd: '', notes: '' });
      await loadBillingPeriodsOnly();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create billing period.';
      setBillingStatus({
        type: 'error',
        message: 'Unable to create billing period.',
        details: message,
      });
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
    },
  ) => {
    setUpdatingSubscriptionId(projectId);
    try {
      await updateSubscriptionSettings({ projectId, ...updates });
      setBillingStatus({ type: 'success', message: 'Subscription updated.' });
      const refreshedClients = await getClientProjects();
      setBillingClients(refreshedClients);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update subscription.';
      setBillingStatus({
        type: 'error',
        message: 'Unable to update subscription.',
        details: message,
      });
      throw error;
    } finally {
      setUpdatingSubscriptionId(null);
    }
  };

  const filteredPeriods = billingPeriods.filter(
    (period) => !selectedProjectId || period.project_id === selectedProjectId,
  );

  const activeProject = billingClients.find((c) => c.id === selectedProjectId) || null;
  const clientLookup = useMemo(() => {
    const map: Record<string, string> = {};
    billingClients.forEach((client) => {
      map[client.id] = client.name;
    });
    return map;
  }, [billingClients]);

  // Revenue handlers
  const startEditingRevenue = (entry: Revenue) => {
    setIsEditingRevenue(true);
    setEditingRevenueEntry(entry);
    setShowRevenueForm(true);
    setRevenueForm({
      source: entry.source,
      amount: entry.amount.toString(),
      description: entry.description || '',
    });
  };

  const resetRevenueForm = () => {
    setShowRevenueForm(false);
    setRevenueForm({ source: '', amount: '', description: '' });
    setIsEditingRevenue(false);
    setEditingRevenueEntry(null);
  };

  const handleRevenueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revenueForm.source.trim() || !revenueForm.amount) return;

    setRevenueSubmitting(true);
    try {
      const amountValue = parseFloat(revenueForm.amount);
      const baseDescription = revenueForm.description.trim();

      if (editingRevenueEntry) {
        const payload: UpdateRevenueData = {
          source: revenueForm.source.trim(),
          amount: amountValue,
          description: baseDescription || undefined,
        };
        await updateRevenue(editingRevenueEntry.id, payload);
      } else {
        await createRevenue({
          source: revenueForm.source.trim(),
          amount: amountValue,
          description: baseDescription || undefined,
        } as CreateRevenueData);
      }

      resetRevenueForm();
      fetchRevenue();
    } catch (error) {
      console.error('Error creating revenue:', error);
    } finally {
      setRevenueSubmitting(false);
    }
  };

  const handleDeleteRevenue = async (entry: Revenue) => {
    const confirmed = window.confirm(
      `Delete revenue entry "${entry.source}" for $${entry.amount.toFixed(2)}?`,
    );
    if (!confirmed) return;

    try {
      setDeletingRevenueId(entry.id);
      await deleteRevenue(entry.id);
      if (editingRevenueEntry?.id === entry.id) {
        resetRevenueForm();
      }
      fetchRevenue();
    } catch (error) {
      console.error('Error deleting revenue entry:', error);
    } finally {
      setDeletingRevenueId(null);
    }
  };

  const totalRevenue = revenue.reduce((sum, item) => sum + item.amount, 0);
  const thisMonthRevenue = useMemo(() => {
    if (revenue.length === 0) return 0;
    const { startUtc, endUtc } = getMonthRangeUTC(new Date(), activeTimezone);
    return revenue
      .filter((item) => {
        const createdAt = new Date(item.created_at);
        return createdAt >= startUtc && createdAt < endUtc;
      })
      .reduce((sum, item) => sum + item.amount, 0);
  }, [revenue, activeTimezone]);

  const TabButton = ({ tab, label }: { tab: TabKey; label: string }) => (
    <button
      type="button"
      onClick={() => setTab(tab)}
      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        activeTab === tab
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
      }`}
    >
      {label}
    </button>
  );

  if (loadingOverview) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading finance data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-md border px-4 py-3 text-sm shadow-lg ${
            toast.type === 'success'
              ? 'bg-green-500/10 border-green-500/40 text-green-600 dark:text-green-400'
              : 'bg-red-500/10 border-red-500/40 text-red-600 dark:text-red-400'
          }`}
          role="status"
        >
          {toast.message}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Finance</h1>
          <p className="text-muted-foreground">
            Payments ledger, subscriptions, invoices, and revenue — in one place.
          </p>
        </div>
        <div className="text-xs text-muted-foreground text-right">
          <p className="font-medium uppercase tracking-wide">Stripe Test Mode</p>
          <p>Use card 4242 4242 4242 4242 for mock payments.</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TabButton tab="overview" label="Overview" />
        <TabButton tab="billing" label="Billing" />
        <TabButton tab="revenue" label="Revenue" />
      </div>

      {error && activeTab === 'overview' && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="py-4 text-sm text-red-600 dark:text-red-400">{error}</CardContent>
        </Card>
      )}

      {activeTab === 'overview' && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Create Payment Link</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div>
                    <label htmlFor="amount" className="block text-sm font-medium mb-1">
                      Amount (USD) *
                    </label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="150.00"
                      value={formData.amount}
                      onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="description" className="block text-sm font-medium mb-1">
                      Description
                    </label>
                    <Input
                      id="description"
                      placeholder="Maintenance retainer, Cleveland Clean, etc."
                      value={formData.description}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, description: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="clientId" className="block text-sm font-medium mb-1">
                      Client *
                    </label>
                    <select
                      id="clientId"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={formData.clientId}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          clientId: e.target.value,
                          projectId: '',
                        }))
                      }
                      required
                    >
                      <option value="">Select client</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                    {!hasClients && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        No clients yet.{' '}
                        <Link className="underline" href="/clients">
                          Create a client
                        </Link>{' '}
                        to start billing.
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="projectId" className="block text-sm font-medium mb-1">
                      Client Project (optional)
                    </label>
                    <select
                      id="projectId"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={formData.projectId}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, projectId: e.target.value }))
                      }
                      disabled={!formData.clientId || clientProjectOptions.length === 0}
                    >
                      <option value="">No project</option>
                      {clientProjectOptions.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    {formData.clientId && clientProjectOptions.length === 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        No projects linked to this client yet. Add one from the Projects tab.
                      </p>
                    )}
                    {selectedClient && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Billing for:{' '}
                        <span className="font-medium text-foreground">{selectedClient.name}</span>
                      </p>
                    )}
                  </div>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Creating...' : 'Generate Stripe Link'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {linkResult && (
              <Card>
                <CardHeader>
                  <CardTitle>Latest Checkout Session</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Share this link with the client or open it in a new tab to test the Stripe flow.
                  </p>
                  <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span className="truncate">{linkResult.url}</span>
                    <div className="flex items-center space-x-2 pl-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(linkResult.url)}
                        title="Copy link"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" size="icon" asChild>
                        <Link href={linkResult.url} target="_blank">
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Payment ID: {linkResult.paymentId}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Payments</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No payments logged yet. Generate a checkout link to see it here.
                </p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Created</th>
                      <th className="py-2 text-left">Client</th>
                      <th className="py-2 text-left">Project</th>
                      <th className="py-2 text-left">Description</th>
                      <th className="py-2 text-left">Paid With</th>
                      <th className="py-2 text-left">Amount</th>
                      <th className="py-2 text-left">Type</th>
                      <th className="py-2 text-left">Status</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-border/40">
                        <td className="py-3">
                          {dateFormatter.format(new Date(payment.created_at))}
                        </td>
                        <td className="py-3">{payment.client?.name || '—'}</td>
                        <td className="py-3">{payment.project?.name || '—'}</td>
                        <td className="py-3">{payment.description || '—'}</td>
                        <td className="py-3">
                          {formatMethodDisplay(
                            payment.payment_method_used,
                            payment.payment_brand,
                            payment.payment_last4,
                          )}
                        </td>
                        <td className="py-3 font-medium">
                          {currencyFormatter.format(payment.amount_cents / 100)}
                        </td>
                        <td className="py-3 capitalize">{payment.link_type.replace('_', ' ')}</td>
                        <td className="py-3">{payment.status || 'Pending'}</td>
                        <td className="py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button asChild size="sm" variant="outline">
                              <Link href={payment.url} target="_blank">
                                Open
                              </Link>
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeletePayment(payment.id)}
                              disabled={deletingPaymentId === payment.id}
                            >
                              {deletingPaymentId === payment.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Trash2 className="h-4 w-4" />
                                  <span>Delete</span>
                                </>
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === 'billing' && (
        <>
          {billingStatus && (
            <div
              className={`rounded-md border px-4 py-3 text-sm ${
                billingStatus.type === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
                  : 'border-red-500/40 bg-red-500/10 text-red-600'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span>{billingStatus.message}</span>
                {billingStatus.type === 'error' && billingStatus.details && (
                  <button
                    type="button"
                    className="text-xs font-semibold underline decoration-dotted"
                    onClick={() => setShowBillingDetails((prev) => !prev)}
                  >
                    {showBillingDetails ? 'Hide details' : 'View details'}
                  </button>
                )}
              </div>
              {showBillingDetails && billingStatus.type === 'error' && billingStatus.details && (
                <pre className="mt-2 whitespace-pre-wrap rounded bg-background/60 p-2 text-xs text-foreground/80">
                  {billingStatus.details}
                </pre>
              )}
            </div>
          )}

          {loadingBilling ? (
            <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
              Loading billing data…
            </div>
          ) : (
            <div className="space-y-6">
              <SubscriptionManager
                clients={billingClients}
                onUpdate={handleSubscriptionUpdate}
                updatingId={updatingSubscriptionId}
                onSelectClient={setSelectedProjectId}
                selectedProjectId={selectedProjectId}
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
                        {billingClients.map((client) => (
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
                  clients={billingClients}
                  billingPeriods={billingPeriods}
                  selectedProjectId={selectedProjectId}
                  onSelectProject={setSelectedProjectId}
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

              {activeProject && (
                <Card>
                  <CardHeader>
                    <CardTitle>Client Snapshot</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Base Retainer</p>
                      <p className="text-xl font-semibold">
                        {currencyFormatter.format((activeProject.base_retainer_cents ?? 0) / 100)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Payment Method</p>
                      <p className="text-xl font-semibold capitalize">
                        {activeProject.payment_method_type || 'card'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Auto-Pay</p>
                      <p className="text-xl font-semibold">
                        {activeProject.auto_pay_enabled ? 'Enabled' : 'Manual'}
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
        </>
      )}

      {activeTab === 'revenue' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Revenue</h2>
              <p className="text-muted-foreground">Track your income sources and earnings</p>
            </div>
            <Button
              onClick={() => {
                resetRevenueForm();
                setShowRevenueForm(true);
              }}
              className="flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Add Revenue</span>
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${totalRevenue.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">All time earnings</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">This Month</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${thisMonthRevenue.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">Current month earnings</p>
              </CardContent>
            </Card>
          </div>

          {showRevenueForm && (
            <Card>
              <CardHeader>
                <CardTitle>{isEditingRevenue ? 'Edit Revenue' : 'Add New Revenue'}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRevenueSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="source" className="block text-sm font-medium mb-1">
                      Source *
                    </label>
                    <Input
                      id="source"
                      value={revenueForm.source}
                      onChange={(e) =>
                        setRevenueForm((prev) => ({ ...prev, source: e.target.value }))
                      }
                      placeholder="e.g., YouTube, Freelance, Course Sales"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="amount" className="block text-sm font-medium mb-1">
                      Amount ($) *
                    </label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={revenueForm.amount}
                      onChange={(e) =>
                        setRevenueForm((prev) => ({ ...prev, amount: e.target.value }))
                      }
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="description" className="block text-sm font-medium mb-1">
                      Description
                    </label>
                    <textarea
                      id="description"
                      value={revenueForm.description}
                      onChange={(e) =>
                        setRevenueForm((prev) => ({ ...prev, description: e.target.value }))
                      }
                      placeholder="Additional details (optional)"
                      className="w-full px-3 py-2 border border-input bg-background rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                      rows={3}
                    />
                  </div>
                  <div className="flex space-x-2">
                    <Button type="submit" disabled={revenueSubmitting}>
                      {revenueSubmitting
                        ? 'Saving...'
                        : isEditingRevenue
                        ? 'Save Changes'
                        : 'Add Revenue'}
                    </Button>
                    <Button type="button" variant="outline" onClick={resetRevenueForm}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Revenue History</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingRevenue ? (
                <p className="text-muted-foreground text-sm">Loading revenue…</p>
              ) : revenue.length === 0 ? (
                <p className="text-muted-foreground text-sm">No revenue logged yet</p>
              ) : (
                <div className="space-y-4">
                  {revenue.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <div>
                            <h4 className="font-medium">{item.source}</h4>
                            {item.description && (
                              <p className="text-sm text-muted-foreground">{item.description}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {new Date(item.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="text-lg font-semibold text-green-600 mr-2">
                          ${item.amount.toFixed(2)}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditingRevenue(item)}
                          className="flex items-center space-x-1"
                        >
                          <Pencil className="h-4 w-4" />
                          <span>Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteRevenue(item)}
                          disabled={deletingRevenueId === item.id}
                          className="flex items-center space-x-1 text-red-500"
                        >
                          <Trash className="h-4 w-4" />
                          <span>{deletingRevenueId === item.id ? 'Deleting...' : 'Delete'}</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
