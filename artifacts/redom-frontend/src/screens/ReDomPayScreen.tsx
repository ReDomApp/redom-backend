import React from "react";
import { OrdersPaymentsScreen } from "./OrdersPaymentsScreen";

/**
 * Compatibility route for older navigation links.
 * Orders and Payments is the single canonical ReDom Pay surface.
 */
export function ReDomPayScreen() {
  return <OrdersPaymentsScreen />;
}
