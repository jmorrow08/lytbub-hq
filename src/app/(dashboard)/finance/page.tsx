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
  getPendingInvoiceItems,
  createQuickInvoice,
  updateInvoicePortal,
  // Revenue
  getRevenue,
  createRevenue,
  updateRevenue,
  deleteRevenue,
} from '@/lib/api';
import type {
  BillingPeriod,
  CreateRevenueData,
  Invoice,
  Payment,
  PendingInvoiceItem,
  Project,
  QuickInvoiceResult,
  Revenue,
  UpdateRevenueData,
} from '@/types';
import { Loader2, Trash2, DollarSign, Plus, Pencil, Trash } from 'lucide-react';
import { runFinanceBackfills } from '@/lib/maintenance';
import { getActiveTimezone, getMonthRangeUTC } from '@/lib/timezone';
import { supabase } from '@/lib/supabaseClient';
import { UsageImportForm } from '@/components/billing/UsageImportForm';
import { InvoiceBuilder } from '@/components/billing/InvoiceBuilder';
import { SubscriptionManager } from '@/components/billing/SubscriptionManager';
import { InvoiceList } from '@/components/billing/InvoiceList';
import { PendingItemsTable } from '@/components/billing/PendingItemsTable';
import { cn } from '@/lib/utils';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const formatDateTimeLocal = (value?: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
};

type BillingStatus = {
  type: 'success' | 'error';
  message: string;
  details?: string | null;
} | null;

type TabKey = 'overview' | 'billing' | 'revenue';

type OverviewEntry = {
  id: string;
  kind: 'checkout' | 'invoice';
  createdAt: string;
  clientName: string;
  projectName: string;
  description: string;
  amountCents: number;
  status: string;
  paymentDisplay: string;
  link?: string | null;
  pdfUrl?: string | null;
};

type UsageNotificationEntry = {
  projectId: string;
  projectName: string;
  clientName: string;
  pendingTotalCents: number;
  itemCount: number;
  lastPendingAt: string;
  message: string;
};

export default function FinancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabKey) || 'overview';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // Overview (Payments) state
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Quick invoice state
  const [quickInvoiceProjectId, setQuickInvoiceProjectId] = useState('');
  const [quickIncludeRetainer, setQuickIncludeRetainer] = useState(false);
  const [quickCollectionMethod, setQuickCollectionMethod] = useState<
    'auto' | 'charge_automatically' | 'send_invoice'
  >('auto');
  const [quickDueDate, setQuickDueDate] = useState('');
  const [quickMemo, setQuickMemo] = useState('');
  const [quickInvoiceLoading, setQuickInvoiceLoading] = useState(false);
  const [quickInvoiceError, setQuickInvoiceError] = useState<string | null>(null);
  const [quickInvoiceResult, setQuickInvoiceResult] = useState<QuickInvoiceResult | null>(null);
  const lastQuickProjectIdRef = useRef<string | null>(null);
  const [copiedUsageProjectId, setCopiedUsageProjectId] = useState<string | null>(null);

  // Billing state
  const [billingClients, setBillingClients] = useState<Project[]>([]);
  const [billingPeriods, setBillingPeriods] = useState<BillingPeriod[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [draftInvoice, setDraftInvoice] = useState<Invoice | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
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
  const [pendingItems, setPendingItems] = useState<PendingInvoiceItem[]>([]);
  const [loadingPendingItems, setLoadingPendingItems] = useState(true);
  const [selectedPendingItemIds, setSelectedPendingItemIds] = useState<string[]>([]);

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

  // Portal microsite editor state
  const [portalInvoiceId, setPortalInvoiceId] = useState<string>('');
  const [portalPayloadText, setPortalPayloadText] = useState<string>('{}');
  const [portalExpiresAt, setPortalExpiresAt] = useState<string>('');
  const [portalStatus, setPortalStatus] = useState<string | null>(null);
  const [portalSaving, setPortalSaving] = useState(false);
  const [portalExpanded, setPortalExpanded] = useState(false);
  const [showPeriodForm, setShowPeriodForm] = useState(false);

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
      const paymentsData = await getPayments();
      setPayments(paymentsData);
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
      setSelectedClientId((prev) => {
        if (prev) return prev;
        const firstClientId = clientList.find((project) => project.client_id)?.client_id;
        return firstClientId ?? '';
      });
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

  const refreshPendingItems = useCallback(async () => {
    setLoadingPendingItems(true);
    try {
      const pending = await getPendingInvoiceItems();
      setPendingItems(pending);
      setSelectedPendingItemIds((prev) =>
        prev.filter((id) => pending.some((item) => item.id === id)),
      );
    } catch (error) {
      console.error('[finance] Unable to load pending invoice items', error);
    } finally {
      setLoadingPendingItems(false);
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
    refreshPendingItems();
  }, [loadBillingData, refreshPendingItems]);

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

  useEffect(() => {
    if (quickInvoiceProjectId) return;
    if (pendingItems.length > 0) {
      setQuickInvoiceProjectId(pendingItems[0].project_id);
      return;
    }
    if (billingClients.length > 0) {
      setQuickInvoiceProjectId(billingClients[0].id);
    }
  }, [billingClients, pendingItems, quickInvoiceProjectId]);

  useEffect(() => {
    if (!quickInvoiceProjectId) {
      setQuickIncludeRetainer(false);
      setSelectedPendingItemIds([]);
      lastQuickProjectIdRef.current = null;
      return;
    }
    const project = billingClients.find((client) => client.id === quickInvoiceProjectId);
    if (lastQuickProjectIdRef.current !== quickInvoiceProjectId) {
      setQuickIncludeRetainer(
        Boolean(project?.base_retainer_cents && project.base_retainer_cents > 0),
      );
      lastQuickProjectIdRef.current = quickInvoiceProjectId;
    }
    setSelectedPendingItemIds((prev) =>
      prev.filter((id) =>
        pendingItems.some((item) => item.id === id && item.project_id === quickInvoiceProjectId),
      ),
    );
    setQuickInvoiceError(null);
    setQuickInvoiceResult(null);
  }, [quickInvoiceProjectId, billingClients, pendingItems]);

  useEffect(() => {
    if (!portalInvoiceId && invoices.length > 0) {
      setPortalInvoiceId(invoices[0].id);
    }
  }, [invoices, portalInvoiceId]);

  // Portal microsite helpers
  const portalSelectedInvoice = useMemo(
    () => invoices.find((inv) => inv.id === portalInvoiceId) ?? null,
    [invoices, portalInvoiceId],
  );

  useEffect(() => {
    if (!portalSelectedInvoice) return;
    setPortalPayloadText(JSON.stringify(portalSelectedInvoice.portal_payload ?? {}, null, 2));
    setPortalExpiresAt(formatDateTimeLocal(portalSelectedInvoice.public_share_expires_at));
    setPortalStatus(null);
  }, [portalSelectedInvoice]);

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
  const formatMethodDisplay = (
    method?: string | null,
    brand?: string | null,
    last4?: string | null,
  ) => {
    if (!method && !brand && !last4) return '—';
    const label = brand || method || '—';
    return last4 ? `${label} ••••${last4}` : label;
  };

  const quickInvoiceProject = useMemo(() => {
    if (!quickInvoiceProjectId) return null;
    return billingClients.find((project) => project.id === quickInvoiceProjectId) ?? null;
  }, [billingClients, quickInvoiceProjectId]);

  const quickInvoicePendingItems = useMemo(() => {
    if (!quickInvoiceProjectId) return [];
    return pendingItems
      .filter((item) => item.project_id === quickInvoiceProjectId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [pendingItems, quickInvoiceProjectId]);

  const selectedPendingItems = useMemo(
    () => pendingItems.filter((item) => selectedPendingItemIds.includes(item.id)),
    [pendingItems, selectedPendingItemIds],
  );

  const quickPendingTotalCents = selectedPendingItems.reduce((sum, item) => {
    const quantity = Number(item.quantity ?? 1) || 1;
    const unitPrice = item.unit_price_cents ?? 0;
    const amount = item.amount_cents ?? Math.round(quantity * unitPrice);
    return sum + amount;
  }, 0);

  const quickRetainerCents =
    quickIncludeRetainer && quickInvoiceProject?.base_retainer_cents
      ? quickInvoiceProject.base_retainer_cents
      : 0;

  const quickTotalCents = quickPendingTotalCents + quickRetainerCents;
  const quickRequiresDueDate = quickCollectionMethod === 'send_invoice';

  const toggleQuickPendingItem = (itemId: string) => {
    setQuickInvoiceError(null);
    setSelectedPendingItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId],
    );
  };

  const toggleSelectAllQuickItems = () => {
    if (!quickInvoiceProjectId) {
      setSelectedPendingItemIds([]);
      return;
    }
    setQuickInvoiceError(null);
    const projectItemIds = quickInvoicePendingItems.map((item) => item.id);
    const allSelected =
      projectItemIds.length > 0 &&
      projectItemIds.every((id) => selectedPendingItemIds.includes(id));
    if (allSelected) {
      setSelectedPendingItemIds((prev) => prev.filter((id) => !projectItemIds.includes(id)));
    } else {
      setSelectedPendingItemIds(projectItemIds);
    }
  };

  const handleQuickInvoiceSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quickInvoiceProjectId) {
      setQuickInvoiceError('Select a project.');
      return;
    }
    const project = billingClients.find((client) => client.id === quickInvoiceProjectId);
    if (!project) {
      setQuickInvoiceError('Selected project could not be found.');
      return;
    }
    const hasSelection = selectedPendingItemIds.length > 0;
    if (!hasSelection && (!quickIncludeRetainer || !project.base_retainer_cents)) {
      setQuickInvoiceError('Select at least one pending item or include the retainer.');
      return;
    }
    if (quickRequiresDueDate && !quickDueDate) {
      setQuickInvoiceError('Set a due date for invoices that will be sent to the client.');
      return;
    }

    setQuickInvoiceLoading(true);
    setQuickInvoiceResult(null);
    setQuickInvoiceError(null);
    try {
      const result = await createQuickInvoice({
        projectId: quickInvoiceProjectId,
        pendingItemIds: selectedPendingItemIds,
        includeRetainer: quickIncludeRetainer,
        collectionMethod: quickCollectionMethod,
        dueDate: quickRequiresDueDate ? quickDueDate : undefined,
        memo: quickMemo.trim() || undefined,
      });
      setQuickInvoiceResult(result);
      triggerToast('success', 'Quick invoice created.');
      setQuickMemo('');
      setQuickDueDate('');
      setSelectedPendingItemIds([]);
      await Promise.all([refreshPendingItems(), loadInvoicesOnly()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create quick invoice.';
      setQuickInvoiceError(message);
      triggerToast('error', message);
    } finally {
      setQuickInvoiceLoading(false);
    }
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
      await refreshPendingItems();
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
    pendingItemIds?: string[];
  }) => {
    setInvoiceGenerating(true);
    try {
      const invoice = await createDraftInvoice(params);
      setDraftInvoice(invoice);
      setBillingStatus({ type: 'success', message: 'Draft invoice created.' });
      await loadInvoicesOnly();
      await refreshPendingItems();
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

  const handlePortalRegenerate = async () => {
    if (!portalSelectedInvoice) return;
    setPortalSaving(true);
    setPortalStatus(null);
    try {
      const updated = await updateInvoicePortal(portalSelectedInvoice.id, {
        regenerateShareId: true,
        // Clear any old expiry when generating a new link
        expiresAt: null,
      });
      setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)));
      setPortalInvoiceId(updated.id);
      setPortalStatus('Share link regenerated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to regenerate share link.';
      setPortalStatus(message);
    } finally {
      setPortalSaving(false);
    }
  };

  const handlePortalSave = async () => {
    if (!portalSelectedInvoice) return;
    let parsedPayload: Record<string, unknown>;
    try {
      parsedPayload = portalPayloadText.trim() ? JSON.parse(portalPayloadText) : {};
    } catch {
      setPortalStatus('Portal payload must be valid JSON.');
      return;
    }

    setPortalSaving(true);
    setPortalStatus(null);
    try {
      const updated = await updateInvoicePortal(portalSelectedInvoice.id, {
        portalPayload: parsedPayload,
        expiresAt: portalExpiresAt || null,
      });
      setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)));
      setPortalStatus('Portal content saved.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save portal content.';
      setPortalStatus(message);
    } finally {
      setPortalSaving(false);
    }
  };

  const handlePortalCopyLink = async () => {
    if (!portalShareLink) return;
    try {
      await navigator.clipboard.writeText(portalShareLink);
      setPortalStatus('Share link copied.');
    } catch {
      setPortalStatus('Unable to copy link. Please copy manually.');
    }
  };

  const handleClientScopeChange = (clientId: string) => {
    setSelectedClientId(clientId);
  };

  const handleProjectScopeChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    if (!projectId) return;
    const owningProject = billingClients.find((project) => project.id === projectId);
    if (owningProject?.client_id) {
      setSelectedClientId(owningProject.client_id);
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

  const clientOptions = useMemo(() => {
    const deduped = new Map<string, string>();
    billingClients.forEach((project) => {
      if (!project.client_id) return;
      const label =
        project.client?.name ||
        project.client?.company_name ||
        project.client_id ||
        project.name ||
        'Client';
      deduped.set(project.client_id, label);
    });
    return Array.from(deduped.entries()).map(([id, label]) => ({ id, label }));
  }, [billingClients]);

  const projectOptions = useMemo(() => {
    if (!selectedClientId) return billingClients;
    return billingClients.filter((project) => project.client_id === selectedClientId);
  }, [billingClients, selectedClientId]);

  const scopedProjects = projectOptions.length > 0 ? projectOptions : billingClients;

  useEffect(() => {
    if (projectOptions.length === 0) {
      const fallback = billingClients[0]?.id;
      if (!selectedProjectId && fallback) {
        setSelectedProjectId(fallback);
      }
      return;
    }
    if (!selectedProjectId || !projectOptions.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projectOptions[0].id);
    }
  }, [billingClients, projectOptions, selectedProjectId]);

  const filteredPeriods = billingPeriods.filter(
    (period) => !selectedProjectId || period.project_id === selectedProjectId,
  );

  const activeProject =
    billingClients.find((c) => c.id === selectedProjectId) ||
    projectOptions[0] ||
    billingClients[0] ||
    null;

  const projectLookup = useMemo(() => {
    const map: Record<string, { clientName: string; projectName: string }> = {};
    billingClients.forEach((project) => {
      const clientName =
        project.client?.name || project.client?.company_name || project.client_id || 'Client';
      map[project.id] = {
        clientName,
        projectName: project.name || 'Project',
      };
    });
    return map;
  }, [billingClients]);

  const overviewEntries = useMemo<OverviewEntry[]>(() => {
    const entries: OverviewEntry[] = payments.map((payment) => ({
      id: payment.id,
      kind: 'checkout',
      createdAt: payment.created_at,
      clientName: payment.client?.name || '—',
      projectName: payment.project?.name || '—',
      description: payment.description || 'Checkout payment',
      amountCents: payment.amount_cents,
      status: payment.status || 'Pending',
      paymentDisplay: formatMethodDisplay(
        payment.payment_method_used,
        payment.payment_brand,
        payment.payment_last4,
      ),
      link: payment.url,
      pdfUrl: null,
    }));

    for (const invoice of invoices) {
      if (invoice.status !== 'paid') continue;
      const metadata = (invoice.metadata ?? {}) as Record<string, unknown>;
      const paidAtMeta = typeof metadata.paid_at === 'string' ? metadata.paid_at : null;
      const createdAt = paidAtMeta || invoice.updated_at || invoice.created_at;
      const projectMeta = projectLookup[invoice.project_id];
      entries.push({
        id: invoice.id,
        kind: 'invoice',
        createdAt,
        clientName: invoice.client?.name || projectMeta?.clientName || '—',
        projectName: projectMeta?.projectName || invoice.project_id,
        description: `Invoice ${invoice.invoice_number}`,
        amountCents: invoice.total_cents,
        status: invoice.status,
        paymentDisplay: formatMethodDisplay(
          invoice.payment_method_used,
          invoice.payment_brand,
          invoice.payment_last4,
        ),
        link: invoice.stripe_hosted_url ?? invoice.stripe_pdf_url ?? null,
        pdfUrl: invoice.stripe_pdf_url ?? null,
      });
    }

    return entries
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);
  }, [payments, invoices, projectLookup]);

  const portalBaseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '').replace(/\/$/, '');

  const portalShareLink = useMemo(() => {
    if (!portalSelectedInvoice?.public_share_id) return '';
    const base = portalBaseUrl || '';
    return `${base}/invoice/${portalSelectedInvoice.public_share_id}`;
  }, [portalBaseUrl, portalSelectedInvoice]);

  const usageNotificationEntries = useMemo<UsageNotificationEntry[]>(() => {
    return billingClients
      .filter((project) => project.notify_usage_events)
      .map((project) => {
        const projectPending = pendingItems
          .filter((item) => item.project_id === project.id)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        if (projectPending.length === 0) return null;
        const totalCents = projectPending.reduce((sum, item) => {
          const quantity = Number(item.quantity ?? 1) || 1;
          const unitPrice = item.unit_price_cents ?? 0;
          const amount = item.amount_cents ?? Math.round(quantity * unitPrice);
          return sum + amount;
        }, 0);
        const latest = projectPending[0];
        const clientName = project.client?.name || project.client?.company_name || 'Client';
        const projectName = project.name || 'Project';
        const message = `Usage update for ${projectName}: ${projectPending.length} pending item${
          projectPending.length === 1 ? '' : 's'
        } totaling ${currencyFormatter.format(totalCents / 100)}. Latest entry ${
          latest.description ? `"${latest.description}"` : 'added'
        } on ${new Date(latest.created_at).toLocaleDateString()}.`;
        return {
          projectId: project.id,
          projectName,
          clientName,
          pendingTotalCents: totalCents,
          itemCount: projectPending.length,
          lastPendingAt: latest.created_at,
          message,
        };
      })
      .filter((entry): entry is UsageNotificationEntry => Boolean(entry))
      .sort((a, b) => new Date(b.lastPendingAt).getTime() - new Date(a.lastPendingAt).getTime());
  }, [billingClients, pendingItems]);

  const handleCopyUsageSummary = async (entry: UsageNotificationEntry) => {
    try {
      await navigator.clipboard.writeText(entry.message);
      triggerToast('success', 'Usage summary copied to clipboard.');
      setCopiedUsageProjectId(entry.projectId);
      setTimeout(() => setCopiedUsageProjectId(null), 2000);
    } catch (error) {
      console.error('Clipboard error', error);
      triggerToast('error', 'Unable to copy summary. Please copy manually.');
    }
  };

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
          {usageNotificationEntries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Usage Notifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Projects with usage notifications enabled. Copy a summary to keep clients in the
                  loop.
                </p>
                <div className="space-y-3">
                  {usageNotificationEntries.map((entry) => (
                    <div
                      key={entry.projectId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 px-4 py-3"
                    >
                      <div>
                        <p className="font-semibold">{entry.projectName}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.clientName} • {entry.itemCount} pending item
                          {entry.itemCount === 1 ? '' : 's'} totaling{' '}
                          {currencyFormatter.format(entry.pendingTotalCents / 100)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={copiedUsageProjectId === entry.projectId ? 'secondary' : 'outline'}
                        onClick={() => handleCopyUsageSummary(entry)}
                      >
                        {copiedUsageProjectId === entry.projectId ? 'Copied!' : 'Copy summary'}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Quick Invoice</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <form className="space-y-4" onSubmit={handleQuickInvoiceSubmit}>
                <div>
                  <label htmlFor="quick-project" className="block text-sm font-medium mb-1">
                    Project
                  </label>
                  <select
                    id="quick-project"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={quickInvoiceProjectId}
                    onChange={(event) => setQuickInvoiceProjectId(event.target.value)}
                    required
                  >
                    <option value="">Select project</option>
                    {billingClients.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Pending Items</label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={toggleSelectAllQuickItems}
                      disabled={quickInvoicePendingItems.length === 0}
                    >
                      {quickInvoicePendingItems.length > 0 &&
                      quickInvoicePendingItems.every((item) =>
                        selectedPendingItemIds.includes(item.id),
                      )
                        ? 'Clear selection'
                        : 'Select all'}
                    </Button>
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-md border border-dashed px-3 py-2">
                    {quickInvoiceProjectId ? (
                      quickInvoicePendingItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No pending items for this project.
                        </p>
                      ) : (
                        quickInvoicePendingItems.map((item) => {
                          const amount =
                            (item.amount_cents ??
                              Math.round(
                                (Number(item.quantity ?? 1) || 1) * (item.unit_price_cents ?? 0),
                              )) / 100;
                          const isSelected = selectedPendingItemIds.includes(item.id);
                          return (
                            <label
                              key={item.id}
                              className={cn(
                                'flex items-start justify-between gap-3 rounded-md px-2 py-2 text-sm transition-colors',
                                isSelected ? 'bg-accent/30' : 'hover:bg-muted/50',
                              )}
                            >
                              <span className="flex-1 space-y-1">
                                <span className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                                    checked={isSelected}
                                    onChange={() => toggleQuickPendingItem(item.id)}
                                  />
                                  <span className="font-medium">{item.description}</span>
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  Created {new Date(item.created_at).toLocaleDateString()}
                                </span>
                              </span>
                              <span className="whitespace-nowrap font-semibold">
                                {currencyFormatter.format(amount)}
                              </span>
                            </label>
                          );
                        })
                      )
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Select a project to view pending items.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="quick-include-retainer"
                    type="checkbox"
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                    checked={quickIncludeRetainer && quickRetainerCents > 0}
                    onChange={(event) => setQuickIncludeRetainer(event.target.checked)}
                    disabled={!quickInvoiceProject || !quickInvoiceProject.base_retainer_cents}
                  />
                  <label htmlFor="quick-include-retainer" className="text-sm text-muted-foreground">
                    Include retainer{' '}
                    {quickInvoiceProject?.base_retainer_cents
                      ? `(${currencyFormatter.format(
                          (quickInvoiceProject.base_retainer_cents || 0) / 100,
                        )})`
                      : '(no retainer configured)'}
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="quick-collection" className="block text-sm font-medium mb-1">
                      Collection Method
                    </label>
                    <select
                      id="quick-collection"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={quickCollectionMethod}
                      onChange={(event) =>
                        setQuickCollectionMethod(
                          event.target.value as 'auto' | 'charge_automatically' | 'send_invoice',
                        )
                      }
                    >
                      <option value="auto">Auto (choose based on billing settings)</option>
                      <option value="charge_automatically">Charge saved payment method</option>
                      <option value="send_invoice">Send invoice (client pays manually)</option>
                    </select>
                  </div>
                  {quickRequiresDueDate && (
                    <div>
                      <label htmlFor="quick-due-date" className="block text-sm font-medium mb-1">
                        Due Date
                      </label>
                      <Input
                        id="quick-due-date"
                        type="date"
                        value={quickDueDate}
                        onChange={(event) => setQuickDueDate(event.target.value)}
                        required={quickRequiresDueDate}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="quick-memo" className="block text-sm font-medium mb-1">
                    Memo (optional)
                  </label>
                  <Input
                    id="quick-memo"
                    placeholder="Add internal notes for this invoice"
                    value={quickMemo}
                    onChange={(event) => setQuickMemo(event.target.value)}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border/60 bg-muted/40 px-4 py-3 text-sm">
                  <div>
                    <p>
                      Pending total:{' '}
                      <span className="font-semibold">
                        {currencyFormatter.format(quickPendingTotalCents / 100)}
                      </span>
                    </p>
                    {quickIncludeRetainer && quickRetainerCents > 0 && (
                      <p>
                        Retainer:{' '}
                        <span className="font-semibold">
                          {currencyFormatter.format(quickRetainerCents / 100)}
                        </span>
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Invoice total{' '}
                      <span className="font-semibold text-foreground">
                        {currencyFormatter.format(quickTotalCents / 100)}
                      </span>
                    </p>
                  </div>
                  <Button
                    type="submit"
                    disabled={
                      quickInvoiceLoading ||
                      !quickInvoiceProjectId ||
                      quickTotalCents <= 0 ||
                      (quickRequiresDueDate && !quickDueDate)
                    }
                  >
                    {quickInvoiceLoading ? 'Creating…' : 'Create Quick Invoice'}
                  </Button>
                </div>
              </form>

              {quickInvoiceError && <p className="text-sm text-red-500">{quickInvoiceError}</p>}

              {quickInvoiceResult && (
                <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-400">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      Invoice {quickInvoiceResult.invoice.invoice_number} created.
                    </p>
                    {quickInvoiceResult.invoice.stripe_hosted_url && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={quickInvoiceResult.invoice.stripe_hosted_url} target="_blank">
                          View invoice
                        </Link>
                      </Button>
                    )}
                  </div>
                  {quickInvoiceResult.needsPaymentMethod && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      This customer needs a saved payment method. Send them the billing portal link
                      from the Billing tab.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Payments</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {overviewEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent payments or invoices yet.</p>
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
                    {overviewEntries.map((entry) => (
                      <tr key={entry.id} className="border-b border-border/40">
                        <td className="py-3">{dateFormatter.format(new Date(entry.createdAt))}</td>
                        <td className="py-3">{entry.clientName}</td>
                        <td className="py-3">{entry.projectName}</td>
                        <td className="py-3">{entry.description}</td>
                        <td className="py-3">{entry.paymentDisplay}</td>
                        <td className="py-3 font-medium">
                          {currencyFormatter.format(entry.amountCents / 100)}
                        </td>
                        <td className="py-3 capitalize">
                          {entry.kind === 'invoice' ? 'Invoice' : 'Checkout'}
                        </td>
                        <td className="py-3 capitalize">{entry.status}</td>
                        <td className="py-3">
                          <div className="flex items-center justify-end gap-2">
                            {entry.kind === 'checkout' ? (
                              <>
                                {entry.link && (
                                  <Button asChild size="sm" variant="outline">
                                    <Link href={entry.link} target="_blank">
                                      Open
                                    </Link>
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDeletePayment(entry.id)}
                                  disabled={deletingPaymentId === entry.id}
                                >
                                  {deletingPaymentId === entry.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <Trash2 className="h-4 w-4" />
                                      <span>Delete</span>
                                    </>
                                  )}
                                </Button>
                              </>
                            ) : (
                              <>
                                {entry.link && (
                                  <Button asChild size="sm" variant="outline">
                                    <Link href={entry.link} target="_blank">
                                      View
                                    </Link>
                                  </Button>
                                )}
                                {entry.pdfUrl && (
                                  <Button asChild size="sm" variant="ghost">
                                    <Link href={entry.pdfUrl} target="_blank">
                                      PDF
                                    </Link>
                                  </Button>
                                )}
                              </>
                            )}
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
              <Card>
                <CardHeader>
                  <CardTitle>Billing scope</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Focus the workspace by selecting a client and project.
                  </p>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium mb-1">Client</label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={selectedClientId}
                      onChange={(event) => handleClientScopeChange(event.target.value)}
                    >
                      <option value="">All clients</option>
                      {clientOptions.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Project</label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={selectedProjectId}
                      onChange={(event) => handleProjectScopeChange(event.target.value)}
                      disabled={scopedProjects.length === 0}
                    >
                      {scopedProjects.length === 0 ? (
                        <option value="">No projects linked</option>
                      ) : (
                        scopedProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6 xl:grid-cols-[1.7fr,1fr]">
                <div className="space-y-6">
                  <SubscriptionManager
                    clients={scopedProjects}
                    onUpdate={handleSubscriptionUpdate}
                    updatingId={updatingSubscriptionId}
                    onSelectClient={
                      scopedProjects.length > 1 ? handleProjectScopeChange : undefined
                    }
                    selectedProjectId={selectedProjectId}
                  />

                  <PendingItemsTable
                    items={pendingItems}
                    projects={scopedProjects}
                    loading={loadingPendingItems}
                    onRefresh={refreshPendingItems}
                    onSelectionChange={setSelectedPendingItemIds}
                  />
                  {selectedPendingItemIds.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {selectedPendingItemIds.length}{' '}
                      {selectedPendingItemIds.length === 1 ? 'item is' : 'items are'} queued for a
                      quick invoice.
                    </p>
                  )}
                </div>

                <div className="space-y-6">
                  {activeProject && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Client snapshot</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">Account</p>
                          <p className="text-lg font-semibold">
                            {activeProject.client?.name ||
                              activeProject.client?.company_name ||
                              'Client'}
                          </p>
                          <p className="text-xs text-muted-foreground">{activeProject.name}</p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-3">
                          <div>
                            <p className="text-muted-foreground text-xs uppercase">Base Retainer</p>
                            <p className="text-lg font-semibold">
                              {currencyFormatter.format(
                                (activeProject.base_retainer_cents ?? 0) / 100,
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs uppercase">
                              Payment Method
                            </p>
                            <p className="text-lg font-semibold capitalize">
                              {activeProject.payment_method_type || 'card'}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs uppercase">Auto-Pay</p>
                            <p className="text-lg font-semibold">
                              {activeProject.auto_pay_enabled ? 'Enabled' : 'Manual'}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader className="flex items-center justify-between gap-4">
                      <div>
                        <CardTitle>Create billing period</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Track the time frame that invoices roll up into.
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowPeriodForm((prev) => !prev)}
                      >
                        {showPeriodForm ? 'Hide' : 'New period'}
                      </Button>
                    </CardHeader>
                    {showPeriodForm && (
                      <CardContent>
                        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreatePeriod}>
                          <div>
                            <label
                              className="block text-sm font-medium mb-1"
                              htmlFor="period-client"
                            >
                              Project
                            </label>
                            <select
                              id="period-client"
                              value={periodForm.projectId}
                              onChange={(event) =>
                                setPeriodForm((prev) => ({
                                  ...prev,
                                  projectId: event.target.value,
                                }))
                              }
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              required
                            >
                              <option value="">Select project</option>
                              {scopedProjects.map((project) => (
                                <option key={project.id} value={project.id}>
                                  {project.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label
                              className="block text-sm font-medium mb-1"
                              htmlFor="period-notes"
                            >
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
                            <label
                              className="block text-sm font-medium mb-1"
                              htmlFor="period-start"
                            >
                              Period Start
                            </label>
                            <Input
                              id="period-start"
                              type="date"
                              value={periodForm.periodStart}
                              onChange={(event) =>
                                setPeriodForm((prev) => ({
                                  ...prev,
                                  periodStart: event.target.value,
                                }))
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
                                setPeriodForm((prev) => ({
                                  ...prev,
                                  periodEnd: event.target.value,
                                }))
                              }
                              required
                            />
                          </div>
                          <div className="md:col-span-2 flex justify-end">
                            <Button type="submit" disabled={creatingPeriod}>
                              {creatingPeriod ? 'Creating…' : 'Create billing period'}
                            </Button>
                          </div>
                        </form>
                      </CardContent>
                    )}
                  </Card>

                  <UsageImportForm
                    clients={scopedProjects}
                    billingPeriods={billingPeriods}
                    selectedProjectId={selectedProjectId}
                    onSelectProject={handleProjectScopeChange}
                    onImport={handleImportUsage}
                    submitting={usageUploading}
                  />

                  <InvoiceBuilder
                    billingPeriods={filteredPeriods}
                    projects={scopedProjects}
                    pendingItems={pendingItems}
                    onRefreshPendingItems={refreshPendingItems}
                    onGenerate={handleGenerateInvoice}
                    generating={invoiceGenerating}
                    draftInvoice={draftInvoice}
                  />
                </div>
              </div>

              <InvoiceList
                invoices={invoices}
                onFinalize={handleFinalizeInvoice}
                onMarkOffline={handleMarkOffline}
                finalizingId={finalizingId}
                markingId={markingId}
                projectLookup={projectLookup}
                onPortalSelect={(invoice) => {
                  setPortalInvoiceId(invoice.id);
                  if (typeof window !== 'undefined') {
                    const el = document.getElementById('invoice-portal-editor');
                    if (el && 'scrollIntoView' in el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }
                }}
              />

              <Card id="invoice-portal-editor">
                <CardHeader className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Invoice portal link &amp; payload</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Create a public share link and set the metadata shown on the client-facing
                      microsite.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPortalExpanded((prev) => !prev)}
                  >
                    {portalExpanded ? 'Hide' : 'Edit'}
                  </Button>
                </CardHeader>
                {portalExpanded && (
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium mb-1">Invoice</label>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={portalInvoiceId}
                          onChange={(event) => setPortalInvoiceId(event.target.value)}
                        >
                          {invoices.map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.invoice_number || inv.id} • {inv.status}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Share link</label>
                        <div className="flex items-center gap-2">
                          <Input
                            readOnly
                            value={portalShareLink || 'Generate a link first'}
                            onFocus={(e) => e.target.select()}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            disabled={!portalShareLink}
                            onClick={handlePortalCopyLink}
                          >
                            Copy
                          </Button>
                          <Button
                            type="button"
                            onClick={handlePortalRegenerate}
                            disabled={portalSaving}
                          >
                            {portalSaving ? 'Working…' : 'Generate'}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Share expiration (optional)
                        </label>
                        <Input
                          type="datetime-local"
                          value={portalExpiresAt}
                          onChange={(event) => setPortalExpiresAt(event.target.value)}
                          placeholder="Leave blank for no expiry"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Portal payload (JSON)
                        </label>
                        <textarea
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[220px] font-mono"
                          value={portalPayloadText}
                          onChange={(event) => setPortalPayloadText(event.target.value)}
                          spellCheck={false}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        Keys to consider: usageDetails, shadowItems, shadowSummary, aiNotes,
                        roadmapUpdates, voiceScript.
                      </div>
                      <Button
                        type="button"
                        onClick={handlePortalSave}
                        disabled={portalSaving || !portalSelectedInvoice}
                      >
                        {portalSaving ? 'Saving…' : 'Save Portal Content'}
                      </Button>
                    </div>

                    {portalStatus && (
                      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                        {portalStatus}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
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
