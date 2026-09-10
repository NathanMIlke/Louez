"use client";

import { useEffect } from "react";

type EstoqueNowPaymentMethod = {
  id: string;
  localId: string | null;
  name: string;
  type: string | null;
  application: string | null;
};

export function PaymentMethodsSync() {
  useEffect(() => {
    let cancelled = false;

    async function syncPaymentMethods() {
      try {
        const response = await fetch("/api/migration/estoquenow/payment-methods", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;

        const data = (await response.json()) as { methods?: EstoqueNowPaymentMethod[] };
        const methods = Array.isArray(data.methods)
          ? data.methods.filter((method) => Boolean(method.localId))
          : [];
        if (cancelled || methods.length === 0) return;

        const select = document.querySelector<HTMLSelectElement>('select[name="method"]');
        if (!select) return;

        const selectedMethod = new URLSearchParams(window.location.search).get("method") || "all";
        const options: HTMLOptionElement[] = [];

        const allOption = document.createElement("option");
        allOption.value = "all";
        allOption.textContent = "Todas";
        options.push(allOption);

        for (const method of methods) {
          const option = document.createElement("option");
          option.value = `exact:${method.localId}`;
          option.textContent = method.name;
          option.dataset.estoquenowId = method.id;
          if (method.type) option.dataset.estoquenowType = method.type;
          if (method.application) option.dataset.estoquenowApplication = method.application;
          options.push(option);
        }

        select.replaceChildren(...options);
        select.dataset.source = "estoquenow";
        select.title = "Formas de pagamento sincronizadas com o EstoqueNow";

        if (Array.from(select.options).some((option) => option.value === selectedMethod)) {
          select.value = selectedMethod;
        } else {
          select.value = "all";
        }
      } catch {
        // Mantém as opções já persistidas no Louez se o EstoqueNow estiver indisponível.
      }
    }

    void syncPaymentMethods();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
