import { termsFor, type LoadedOffer, type Plan, type PurchasesClient } from "@/lib/web-checkout";

// The real RevenueCat browser SDK (@revenuecat/purchases-js) behind PurchasesClient. Loaded on
// demand, in the browser only. The public Web Billing key is empty until the owner sets it up
// (the Pro launch epic): empty means no SDK and the unavailable offer.
export const webBillingKey = () => process.env.NEXT_PUBLIC_REVENUECAT_WEB_BILLING_KEY || "";

const NONE: LoadedOffer = { offer: { available: false, trialEligible: false, terms: null }, plans: [] };

// The account's email, passed to checkout so RevenueCat doesn't ask for it again. Anything that
// isn't a plausible address is left out, and checkout asks as before.
export function checkoutEmail(email: string | null | undefined): string | undefined {
  const value = email?.trim();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : undefined;
}

// `userId` is the signed-in user's id from the server-rendered session: it becomes RevenueCat's
// App User ID. A tampered page could only buy Pro for a different account; it can't grant Pro.
// `email` (also from the session) fills in checkout's email field.
export function createRevenueCatClient(apiKey: string, userId: string, email?: string | null): PurchasesClient {
  const sdk = async () => {
    const { Purchases } = await import("@revenuecat/purchases-js");
    const purchases = Purchases.isConfigured() ? Purchases.getSharedInstance() : Purchases.configure({ apiKey, appUserId: userId });
    if (purchases.getAppUserId() !== userId) await purchases.changeUser(userId);
    return { Purchases, purchases };
  };

  const plansOf = async (): Promise<{ plans: Plan[]; byId: Map<string, import("@revenuecat/purchases-js").Package> }> => {
    const { purchases } = await sdk();
    const offerings = await purchases.getOfferings();
    const offering = offerings.all?.default ?? offerings.current;
    const packages = [offering?.monthly, offering?.annual].filter((p): p is NonNullable<typeof p> => Boolean(p));
    const byId = new Map(packages.map((p) => [p.identifier, p]));
    const plans = packages.map((p): Plan => {
      const period = p.product.period;
      return {
        id: p.identifier,
        name: period?.unit === "year" ? "Annual" : "Monthly",
        price: p.product.price.formattedPrice,
        period: period ? (period.number === 1 ? period.unit : `${period.number} ${period.unit}s`) : "period",
        // The SDK reports a free trial only when it applies to this customer.
        trial: p.product.freeTrialPhase != null,
      };
    });
    return { plans, byId };
  };

  return {
    async loadOffer() {
      const { plans } = await plansOf();
      if (!plans.length) return NONE;
      const best = plans.find((p) => p.name === "Annual") ?? plans[0];
      return { offer: { available: true, trialEligible: plans.some((p) => p.trial), terms: termsFor(best) }, plans };
    },
    async purchase(planId) {
      const { purchases } = await sdk();
      const { byId } = await plansOf();
      const rcPackage = byId.get(planId);
      if (!rcPackage) throw new Error("That plan isn’t available.");
      try {
        await purchases.purchase({ rcPackage, customerEmail: checkoutEmail(email) });
        return "purchased";
      } catch (error) {
        const { ErrorCode, PurchasesError } = await import("@revenuecat/purchases-js");
        if (error instanceof PurchasesError && error.errorCode === ErrorCode.UserCancelledError) return "cancelled";
        throw error;
      }
    },
    async managementURL() {
      const { purchases } = await sdk();
      return (await purchases.getCustomerInfo()).managementURL ?? null;
    },
  };
}
