import type { ReactNode } from "react";

import { PaymentMethodsSync } from "./payment-methods-sync";

export default function FinanceiroLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <PaymentMethodsSync />
    </>
  );
}
