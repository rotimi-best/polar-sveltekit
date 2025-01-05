import { Polar } from "@polar-sh/sdk";
import {
  WebhookVerificationError,
  validateEvent,
} from "@polar-sh/sdk/webhooks";
import type { RequestEvent } from "@sveltejs/kit";

export interface CheckoutConfig {
  accessToken?: string;
  successUrl?: string;
  includeCheckoutId?: boolean;
  server?: "sandbox" | "production";
}

export interface WebhooksConfig {
  webhookSecret: string;
  onPayload: (payload: any) => Promise<void>;
}

export type CheckoutHandler = (event: RequestEvent) => Promise<Response>;
export type WebhookHandler = (event: RequestEvent) => Promise<Response>;

export const Checkout = ({
  accessToken,
  successUrl,
  server,
  includeCheckoutId = true,
}: CheckoutConfig): CheckoutHandler => {
  const polar = new Polar({ accessToken, server });

  return async (event) => {
    const url = new URL(event.request.url);
    const productId = url.searchParams.get("productId");

    if (!productId) {
      return new Response(
        JSON.stringify({ error: "Missing productId in query params" }),
        { status: 400 }
      );
    }

    const success = successUrl ? new URL(successUrl, event.url) : undefined;

    if (success && includeCheckoutId) {
      success.searchParams.set("checkoutId", "{CHECKOUT_ID}");
    }

    console.log("success", success?.toString());

    try {
      const result = await polar.checkouts.custom.create({
        productId,
        successUrl: success?.toString(),
        customerId: url.searchParams.get("customerId") ?? undefined,
        customerEmail: url.searchParams.get("customerEmail") ?? undefined,
        customerName: url.searchParams.get("customerName") ?? undefined,
        customerBillingAddress: url.searchParams.has("customerBillingAddress")
          ? JSON.parse(url.searchParams.get("customerBillingAddress") ?? "{}")
          : undefined,
        customerTaxId: url.searchParams.get("customerTaxId") ?? undefined,
        customerIpAddress:
          url.searchParams.get("customerIpAddress") ?? undefined,
        customerMetadata: url.searchParams.has("customerMetadata")
          ? JSON.parse(url.searchParams.get("customerMetadata") ?? "{}")
          : undefined,
        allowDiscountCodes: url.searchParams.has("allowDiscountCodes")
          ? url.searchParams.get("allowDiscountCodes") === "true"
          : undefined,
        discountId: url.searchParams.get("discountId") ?? undefined,
        metadata: url.searchParams.has("metadata")
          ? JSON.parse(url.searchParams.get("metadata") ?? "{}")
          : undefined,
      });

      return new Response(null, {
        status: 302,
        headers: { Location: result.url },
      });
    } catch (error) {
      console.error("Catch checkout error", error);
      return new Response(null, { status: 500 });
    }
  };
};

export const Webhooks = ({
  webhookSecret,
  onPayload,
}: WebhooksConfig): WebhookHandler => {
  return async (event: RequestEvent) => {
    const requestBody = await event.request.text();
    const webhookHeaders = {
      "webhook-id": event.request.headers.get("webhook-id") ?? "",
      "webhook-timestamp": event.request.headers.get("webhook-timestamp") ?? "",
      "webhook-signature": event.request.headers.get("webhook-signature") ?? "",
    };

    let webhookPayload: any;

    try {
      webhookPayload = validateEvent(
        requestBody,
        webhookHeaders,
        webhookSecret
      );
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        return new Response(JSON.stringify({ received: false }), {
          status: 403,
        });
      }
      throw error;
    }

    await onPayload(webhookPayload);
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  };
};
