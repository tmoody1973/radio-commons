"use client";

import Script from "next/script";
import type { ButtonConfig } from "@/lib/give/amazonPay";

declare global { interface Window { amazon?: { Pay: { renderButton(selector: string, config: ButtonConfig): unknown } } } }

const CHECKOUT_JS = "https://static-na.payments-amazon.com/checkout.js";

/** Amazon's own button, from a config the server built and signed; the browser only passes it along. */
export function AmazonPayButton({ config }: { config: ButtonConfig }) {
  return (
    <>
      <div id="AmazonPayButton" style={{ minHeight: 48, maxWidth: 320 }} />
      <Script src={CHECKOUT_JS} onReady={() => { window.amazon?.Pay.renderButton("#AmazonPayButton", config); }} />
    </>
  );
}
