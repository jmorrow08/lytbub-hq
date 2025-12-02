'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  getBillingPeriods,
  getClient,
  getClientProjects,
  getClientPortalMembers,
  getInvoices,
  getPayments,
  removeClientPortalMember,
  updateClientPortalMemberRole,
  updateClientPortalSettings,
  updateSubscriptionSettings,
} from '@/lib/api';
import type {
  BillingPeriod,
  Client,
  ClientPortalUser,
  Invoice,
  Payment,
  Project,
} from '@/types';
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
  const [portalMembers, setPortalMembers] = useState<ClientPortalUser[]>([]);
  const [portalEnabled, setPortalEnabled] = useState(true);
  const [portalNotes, setPortalNotes] = useState('');
  const [portalSaving, setPortalSaving] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [memberRoleSavingId, setMemberRoleSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [
          clientRecord,
          projectList,
          paymentList,
          invoiceList,
          periodList,
          memberList,
        ] = await Promise.all([
          getClient(clientId),
          getClientProjects(),
          getPayments({ clientId }),
          getInvoices({ clientId }),
          getBillingPeriods({ clientId }),
          getClientPortalMembers(clientId),
        ]);
        setClient(clientRecord);
        const clientProjects = projectList.filter((project) => project.client_id === clientId);
        setProjects(clientProjects);
        setPayments(paymentList);
        setInvoices(invoiceList);
        setBillingPeriods(periodList);
        setPortalMembers(memberList);
      } catch (error) {
        console.error('Error loading client details', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [clientId]);

  useEffect(() => {
    if (!client) return;
    setPortalEnabled(client.client_portal_enabled !== false);
    setPortalNotes(client.client_portal_notes ?? '');
  }, [client]);

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

  const handlePortalSettingsSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clientId) return;
    setPortalSaving(true);
    setPortalError(null);
    try {
      const updated = await updateClientPortalSettings(clientId, {
        portalEnabled,
        notes: portalNotes.trim().length > 0 ? portalNotes : null,
      });
      setClient(updated);
    } catch (error) {
      console.error('Error updating portal settings', error);
      setPortalError(
        error instanceof Error ? error.message : 'Unable to update portal settings.',
      );
    } finally {
      setPortalSaving(false);
    }
  };

  const handleRemoveMember = async (membershipId: string) => {
    if (!clientId) return;
    setMemberActionId(membershipId);
    try {
      await removeClientPortalMember(clientId, membershipId);
      setPortalMembers((prev) => prev.filter((member) => member.id !== membershipId));
    } catch (error) {
      console.error('Error removing client member', error);
    } finally {
      setMemberActionId(null);
    }
  };

  const handleRoleChange = async (membershipId: string, role: 'viewer' | 'admin') => {
    if (!clientId) return;
    setMemberRoleSavingId(membershipId);
    try {
      const updated = await updateClientPortalMemberRole(clientId, membershipId, role);
      setPortalMembers((prev) =>
        prev.map((member) => (member.id === membershipId ? updated : member)),
      );
    } catch (error) {
      console.error('Error updating client member role', error);
    } finally {
      setMemberRoleSavingId(null);
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
          <Link href="/finance?tab=billing">Open Billing</Link>
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
                  Manage detailed billing periods and invoice generation from Finance → Billing.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Client Portal Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handlePortalSettingsSave}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold">Portal access</p>
                  <p className="text-sm text-muted-foreground">
                    Toggle the shared billing portal for this client.
                  </p>
                </div>
                <Switch checked={portalEnabled} onCheckedChange={setPortalEnabled} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="portal-notes">
                  Internal notes
                </label>
                <Textarea
                  id="portal-notes"
                  value={portalNotes}
                  onChange={(event) => setPortalNotes(event.target.value)}
                  placeholder="Visible only to your team."
                  rows={4}
                />
              </div>
              {client.client_portal_last_access && (
                <p className="text-xs text-muted-foreground">
                  Last portal visit:{' '}
                  {dateFormatter.format(new Date(client.client_portal_last_access))}
                </p>
              )}
              {portalError && <p className="text-sm text-red-500">{portalError}</p>}
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={portalSaving}>
                  {portalSaving ? 'Saving…' : 'Save Portal Settings'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Clients can enroll themselves from any invoice share link.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Client Portal Members</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {portalMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No external users yet. Share an invoice/public link so your client can sign in —
                once they do, their account will appear here.
              </p>
            ) : (
              <ul className="space-y-3">
                {portalMembers.map((member) => (
                  <li
                    key={member.id}
                    className="rounded-md border border-border/60 p-3 text-sm text-muted-foreground"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-medium text-foreground">{member.email}</p>
                        <p className="text-xs">
                          Joined {dateFormatter.format(new Date(member.created_at))}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {member.role === 'owner' ? (
                          <span className="text-xs font-semibold uppercase text-foreground">
                            Owner
                          </span>
                        ) : (
                          <select
                            value={member.role}
                            onChange={(event) =>
                              handleRoleChange(
                                member.id,
                                event.target.value === 'admin' ? 'admin' : 'viewer',
                              )
                            }
                            disabled={memberRoleSavingId === member.id}
                            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                          >
                            <option value="viewer">Viewer</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveMember(member.id)}
                          disabled={member.role === 'owner' || memberActionId === member.id}
                        >
                          {memberActionId === member.id ? 'Removing…' : 'Remove'}
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Workspace owners always have access to this portal.
            </p>
          </CardContent>
        </Card>
      </div>

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
