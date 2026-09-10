"use client";

import { useEffect } from "react";

type EstoqueNowPaymentMethod = {
  id: string;
  name: string;
  type: string | null;
  application: string | null;
};

type LouezPaymentMethod = "stripe" | "cash" | "card" | "transfer" | "check" | "other";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function toLouezMethod(method: EstoqueNowPaymentMethod): LouezPaymentMethod {
  const name = normalize(method.name);

  if (name.includes("dinheiro")) return "cash";
  if (name.includes("cheque")) return "check";
  if (name.includes("stripe")) return "stripe";

  if (
    ["pix", "transfer", "ted", "deposito bancario", "deposito em conta"].some((term) =>
      name.includes(term),
    )
  ) {
    return "transfer";
  }

  if (
    [
      "cartao",
      "credito",
      "debito",
      "maquininha",
      "visa",
      "master",
      "elo",
      "amex",
      "sipag",
      "cielo",
      "rede",
      "stone",
      "getnet",
      "pagseguro",
    ].some((term) => name.includes(term))
  ) {
    return "card";
  }

  return "other";
}

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
        const methods = Array.isArray(data.methods) ? data.methods : [];
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
          option.value = toLouezMethod(method);
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
        // Mantém as opções nativas do Louez como fallback se o EstoqueNow estiver indisponível.
      }
    }

    void syncPaymentMethods();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
