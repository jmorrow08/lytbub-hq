'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getBillingPeriods,
  getClient,
  getClientProjects,
  getInvoices,
  getPayments,
  updateSubscriptionSettings,
} from '@/lib/api';
import type { BillingPeriod, Client, Invoice, Payment, Project } from '@/types';
import { SubscriptionManager } from '@/components/billing/SubscriptionManager';
import { ArrowLeft, ExternalLink } from 'lucide-react';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const clientId = params?.id;

  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [billingPeriods, setBillingPeriods] = useState<BillingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingSubscriptionId, setUpdatingSubscriptionId] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [clientRecord, projectList, paymentList, invoiceList, periodList] = await Promise.all(
          [
            getClient(clientId),
            getClientProjects(),
            getPayments({ clientId }),
            getInvoices({ clientId }),
            getBillingPeriods({ clientId }),
          ],
        );
        setClient(clientRecord);
        const clientProjects = projectList.filter((project) => project.client_id === clientId);
        setProjects(clientProjects);
        setPayments(paymentList);
        setInvoices(invoiceList);
        setBillingPeriods(periodList);
      } catch (error) {
        console.error('Error loading client details', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [clientId]);

  const hasData = useMemo(
    () => Boolean(projects.length || payments.length || invoices.length),
    [projects.length, payments.length, invoices.length],
  );

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
    if (!clientId) return;
    setUpdatingSubscriptionId(projectId);
    try {
      await updateSubscriptionSettings({ projectId, ...updates });
      const allProjects = await getClientProjects();
      setProjects(allProjects.filter((project) => project.client_id === clientId));
    } catch (error) {
      console.error('Error updating subscription', error);
    } finally {
      setUpdatingSubscriptionId(null);
    }
  };

  if (!clientId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Client ID missing from the URL.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading client…</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/clients" className="flex items-center gap-1">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Client not found</h1>
          </div>
        </div>
        <p className="text-muted-foreground">This client is missing or you do not have access.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/clients" className="flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{client.name}</h1>
            {client.company_name && <p className="text-muted-foreground">{client.company_name}</p>}
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href="/billing">Open Billing</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Client Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {client.contact_name && <p>Contact: {client.contact_name}</p>}
            {client.email && <p>Email: {client.email}</p>}
            {client.phone && <p>Phone: {client.phone}</p>}
            {client.notes && <p className="text-foreground">Notes: {client.notes}</p>}
            {!client.contact_name && !client.email && !client.phone && (
              <p>No contact details added yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Projects</CardTitle>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No projects linked yet. Create one in the Projects tab and select this client.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {projects.map((project) => (
                  <li key={project.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{project.name}</p>
                      {project.description && (
                        <p className="text-muted-foreground">{project.description}</p>
                      )}
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/projects/${project.id}`} className="flex items-center gap-1">
                        <ExternalLink className="h-4 w-4" />
                        Board
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Billing overview scoped to this client */}
      {projects.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SubscriptionManager
            clients={projects}
            onUpdate={handleSubscriptionUpdate}
            updatingId={updatingSubscriptionId}
            readOnly
          />

          <Card>
            <CardHeader>
              <CardTitle>Billing Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="border-b border-border/40 pb-3 last:border-0 last:pb-0"
                >
                  <p className="font-semibold">{project.name}</p>
                  <p className="text-muted-foreground">
                    Base Retainer:{' '}
                    {currencyFormatter.format((project.base_retainer_cents ?? 0) / 100)}
                  </p>
                  <p className="text-muted-foreground">
                    Payment Method:{' '}
                    {(project.payment_method_type || 'card').toString().toUpperCase()}
                  </p>
                  <p className="text-muted-foreground">
                    Auto-Pay: {project.auto_pay_enabled ? 'Enabled' : 'Manual'}
                  </p>
                </div>
              ))}

              <div className="pt-2">
                <p className="text-xs text-muted-foreground">
                  Manage detailed billing periods and invoice generation from the Billing workspace.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {hasData && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent Payments</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments yet.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Date</th>
                      <th className="py-2 text-left">Amount</th>
                      <th className="py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-border/40">
                        <td className="py-2">
                          {dateFormatter.format(new Date(payment.created_at))}
                        </td>
                        <td className="py-2">
                          {currencyFormatter.format((payment.amount_cents || 0) / 100)}
                        </td>
                        <td className="py-2">{payment.status || 'Pending'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Invoices</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No invoices yet.</p>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 text-left">Number</th>
                        <th className="py-2 text-left">Total</th>
                        <th className="py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice) => (
                        <tr key={invoice.id} className="border-b border-border/40">
                          <td className="py-2">{invoice.invoice_number || 'Draft'}</td>
                          <td className="py-2">
                            {currencyFormatter.format((invoice.total_cents || 0) / 100)}
                          </td>
                          <td className="py-2 capitalize">{invoice.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Billing Periods</CardTitle>
              </CardHeader>
              <CardContent>
                {billingPeriods.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No billing periods yet.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {billingPeriods.map((period) => (
                      <li key={period.id} className="flex items-center justify-between">
                        <span>
                          {period.period_start} → {period.period_end}
                        </span>
                        <span className="text-xs uppercase text-muted-foreground">
                          {period.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
