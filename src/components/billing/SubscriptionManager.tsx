'use client';

import { useState } from 'react';
import type { Project } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createBillingPortalLink } from '@/lib/api';

type SubscriptionManagerProps = {
  clients: Project[];
  onUpdate: (
    projectId: string,
    updates: {
      subscriptionEnabled?: boolean;
      baseRetainerCents?: number | null;
      paymentMethodType?: 'card' | 'ach' | 'offline';
      autoPayEnabled?: boolean;
      achDiscountCents?: number;
    },
  ) => Promise<void>;
  updatingId?: string | null;
  onSelectClient?: (projectId: string) => void;
  selectedProjectId?: string;
  readOnly?: boolean;
};

const paymentMethodOptions: Array<{ value: 'card' | 'ach' | 'offline'; label: string }> = [
  { value: 'card', label: 'Card (includes processing fee)' },
  { value: 'ach', label: 'ACH (eligible for discount)' },
  { value: 'offline', label: 'Offline (Zelle, check, etc.)' },
];

const dollars = (value?: number | null) =>
  typeof value === 'number' ? (value / 100).toFixed(2) : '0.00';

export function SubscriptionManager({
  clients,
  onUpdate,
  updatingId,
  onSelectClient,
  selectedProjectId,
  readOnly = false,
}: SubscriptionManagerProps) {
  const [error, setError] = useState<string | null>(null);
  const [portalLoadingId, setPortalLoadingId] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>, projectId: string) => {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const subscriptionEnabled = formData.get('subscription_enabled') === 'on';
    const autoPayEnabled = formData.get('auto_pay_enabled') === 'on';
    const paymentMethodType = formData.get('payment_method_type') as 'card' | 'ach' | 'offline';
    const baseRetainerInput = Number(formData.get('base_retainer') || 0);
    const discountInput = Number(formData.get('ach_discount') || 5);

    const baseRetainerCents = Number.isFinite(baseRetainerInput)
      ? Math.round(baseRetainerInput * 100)
      : null;
    const achDiscountCents = Math.max(0, Math.round(discountInput * 100));

    try {
      await onUpdate(projectId, {
        subscriptionEnabled,
        baseRetainerCents,
        autoPayEnabled,
        paymentMethodType,
        achDiscountCents,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update subscription.');
    }
  };

  // Determine which clients to show:
  // - If a selector is provided, default to the first client to drive the dropdown.
  // - If readOnly mode is used without a selector and without an explicitly selected project,
  //   show all clients (do NOT filter to the first).
  const hasSelector = Boolean(onSelectClient);
  const selectedId = selectedProjectId ?? (hasSelector ? clients[0]?.id ?? '' : '');
  const visibleClients =
    selectedId && clients.some((c) => c.id === selectedId)
      ? clients.filter((c) => c.id === selectedId)
      : clients;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Subscription &amp; Auto-Pay</CardTitle>
          {onSelectClient && clients.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="subscription-client" className="text-sm text-muted-foreground">
                Client
              </label>
              <select
                id="subscription-client"
                value={selectedId}
                onChange={(e) => onSelectClient?.(e.target.value)}
                className="w-56 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && <p className="text-sm text-red-500">{error}</p>}
        {clients.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No client projects yet. Create a client project to configure subscriptions.
          </p>
        )}
        <div className="space-y-6">
          {visibleClients.map((client) => {
            const achDiscount = client.ach_discount_cents ?? 500;
            const preferredMethod =
              (client.payment_method_type as 'card' | 'ach' | 'offline') || 'card';
            const netAchPrice = Math.max(
              0,
              (client.base_retainer_cents ?? 0) - (client.auto_pay_enabled ? achDiscount : 0),
            );
            return (
              <form
                key={client.id}
                onSubmit={(event) => handleSubmit(event, client.id)}
                className="rounded-lg border border-border/50 p-4 space-y-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold">{client.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Current base retainer: ${dollars(client.base_retainer_cents)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`subscription-${client.id}`}
                      name="subscription_enabled"
                      defaultChecked={Boolean(client.subscription_enabled)}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      disabled={readOnly}
                    />
                    <label htmlFor={`subscription-${client.id}`} className="text-sm font-medium">
                      Subscription Enabled
                    </label>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor={`retainer-${client.id}`}
                    >
                      Base Retainer (USD)
                    </label>
                    <Input
                      id={`retainer-${client.id}`}
                      name="base_retainer"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={dollars(client.base_retainer_cents)}
                      disabled={readOnly}
                    />
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor={`payment-${client.id}`}
                    >
                      Preferred Payment Method
                    </label>
                    <select
                      id={`payment-${client.id}`}
                      name="payment_method_type"
                      defaultValue={preferredMethod}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      disabled={readOnly}
                    >
                      {paymentMethodOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`autopay-${client.id}`}
                      name="auto_pay_enabled"
                      defaultChecked={Boolean(client.auto_pay_enabled)}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      disabled={readOnly}
                      onChange={(event) => {
                        if (event.target.checked && onSelectClient) {
                          onSelectClient(client.id);
                        }
                      }}
                    />
                    <label htmlFor={`autopay-${client.id}`} className="text-sm">
                      ACH Auto-Pay Enabled
                    </label>
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor={`discount-${client.id}`}
                    >
                      ACH Discount (USD)
                    </label>
                    <Input
                      id={`discount-${client.id}`}
                      name="ach_discount"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={(achDiscount / 100).toFixed(2)}
                      disabled={readOnly}
                    />
                  </div>
                </div>

                <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-3 text-xs text-primary">
                  {preferredMethod === 'ach' ? (
                    <p>
                      ACH auto-pay total:{' '}
                      <span className="font-semibold">${(netAchPrice / 100).toFixed(2)}/month</span>{' '}
                      (saves ${(achDiscount / 100).toFixed(2)} per month)
                    </p>
                  ) : preferredMethod === 'card' ? (
                    <p>
                      Card payments show a processing fee line item. Switch to ACH auto-pay to
                      reduce fees and offer a discount.
                    </p>
                  ) : (
                    <p>Offline payments will not include processing fees.</p>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  “Manage Billing” opens Stripe’s secure customer portal where your client can add
                  or update card/ACH details and view past invoices.
                </p>

                <div className="flex items-center justify-between gap-4">
                  <Button type="submit" disabled={readOnly || updatingId === client.id}>
                    {updatingId === client.id ? 'Saving…' : 'Save Subscription'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      try {
                        setPortalLoadingId(client.id);
                        const { url } = await createBillingPortalLink(client.id);
                        if (typeof window !== 'undefined') {
                          window.location.href = url;
                        }
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Unable to open billing portal.');
                      } finally {
                        setPortalLoadingId(null);
                      }
                    }}
                    disabled={readOnly || portalLoadingId === client.id}
                  >
                    {portalLoadingId === client.id ? 'Opening…' : 'Manage Billing'}
                  </Button>
                </div>
              </form>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
