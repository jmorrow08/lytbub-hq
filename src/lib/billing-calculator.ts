export type PaymentMethodType = 'card' | 'ach' | 'offline';

export type DraftLine = {
  lineType: 'base_subscription' | 'usage' | 'project' | 'processing_fee';
  description: string;
  quantity: number;
  unitPriceCents: number;
  metadata?: Record<string, unknown>;
};

export type CalculatedLine = DraftLine & { amountCents: number };

export type PricingAdjustments = {
  showProcessingFeeLine?: boolean;
  achDiscountCents?: number;
  paymentMethodType: PaymentMethodType;
  autoPayEnabled?: boolean;
  processingFeeRate?: number;
  processingFeeFixedCents?: number;
};

export const PRICING_RULES = {
  ach_auto_pay_discount_cents: 500,
  card_processing_fee_rate: 0.029,
  card_processing_fee_fixed_cents: 30,
  show_explicit_processing_fee: true,
} as const;

export function calculateLineAmount(line: DraftLine): CalculatedLine {
  const amountCents = Math.round(line.quantity * line.unitPriceCents);
  return { ...line, amountCents };
}

export function calculateSubtotal(lines: DraftLine[]): number {
  return lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPriceCents), 0);
}

export function getAchDiscount(
  autoPayEnabled: boolean,
  discountCents: number = PRICING_RULES.ach_auto_pay_discount_cents
): number {
  if (!autoPayEnabled) return 0;
  return Math.max(0, discountCents);
}

export function calculateProcessingFee(
  subtotalCents: number,
  paymentMethod: PaymentMethodType,
  rate: number = PRICING_RULES.card_processing_fee_rate,
  fixedCents: number = PRICING_RULES.card_processing_fee_fixed_cents
): number {
  if (paymentMethod !== 'card') return 0;
  if (subtotalCents <= 0) return 0;
  return Math.round(subtotalCents * rate) + fixedCents;
}

export function applyPaymentMethodAdjustments(
  lines: DraftLine[],
  options: PricingAdjustments
): { lines: CalculatedLine[]; subtotalCents: number; totalCents: number } {
  const calculated = lines.map(calculateLineAmount);
  const baseSubtotal = calculated.reduce((sum, line) => sum + line.amountCents, 0);

  const achDiscount =
    options.paymentMethodType === 'ach'
      ? getAchDiscount(
          Boolean(options.autoPayEnabled),
          options.achDiscountCents ?? PRICING_RULES.ach_auto_pay_discount_cents
        )
      : 0;

  if (achDiscount > 0) {
    const discountLine: CalculatedLine = {
      lineType: 'processing_fee',
      description: 'ACH Auto-Pay Discount',
      quantity: 1,
      unitPriceCents: -achDiscount,
      amountCents: -achDiscount,
    };
    calculated.push(discountLine);
  }

  const processingFee = calculateProcessingFee(
    baseSubtotal,
    options.paymentMethodType,
    options.processingFeeRate,
    options.processingFeeFixedCents
  );

  const includeFeeInline =
    processingFee > 0 &&
    !(options.showProcessingFeeLine ?? PRICING_RULES.show_explicit_processing_fee);

  if (processingFee > 0 && !includeFeeInline) {
    calculated.push({
      lineType: 'processing_fee',
      description: 'Card Processing Fee',
      quantity: 1,
      unitPriceCents: processingFee,
      amountCents: processingFee,
    });
  }

  const totalCents =
    calculated.reduce((sum, line) => sum + line.amountCents, 0) +
    (includeFeeInline ? processingFee : 0);
  return { lines: calculated, subtotalCents: baseSubtotal, totalCents };
}

