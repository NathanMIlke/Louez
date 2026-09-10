"use client";

import { useState } from "react";

type Result = {
  ok?: boolean;
  error?: string;
  mode?: string;
  requested?: { customers: number; products: number };
  received?: { customers: number; products: number };
  imported?: { customers: number; products: number };
  data?: {
    customers?: Array<{ source: { id: string }; louez: { firstName: string; lastName: string; email: string; customerType: string } }>;
    products?: Array<{ source: { id: string }; louez: { name: string; price: string; quantity: number; categoryName?: string } }>;
  };
  customers?: Array<{ legacyId: string; louezId: string; name: string; action: string }>;
  products?: Array<{ legacyId: string; louezId: string; name: string; action: string }>;
};

export function EstoqueNowSmokeClient() {
  const [loading, setLoading] = useState<"preview" | "import" | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function execute(method: "GET" | "POST") {
    setLoading(method === "GET" ? "preview" : "import");
    setResult(null);
    try {
      const response = await fetch("/api/migration/estoquenow/smoke", {
        method,
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const data = (await response.json()) as Result;
      setResult(data);
    } catch {
      setResult({ error: "Não foi possível comunicar com o importador." });
    } finally {
      setLoading(null);
    }
  }

  const previewCustomers = result?.data?.customers ?? [];
  const previewProducts = result?.data?.products ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => execute("GET")}
          disabled={loading !== null}
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 shadow-sm transition hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800"
        >
          {loading === "preview" ? "Extraindo..." : "Pré-visualizar 10 + 10"}
        </button>
        <button
          type="button"
          onClick={() => execute("POST")}
          disabled={loading !== null}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
        >
          {loading === "import" ? "Importando..." : "Importar teste no Louez"}
        </button>
      </div>

      {result?.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {result.error}
        </div>
      )}

      {result?.imported && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200">
          Importação concluída: <strong>{result.imported.customers} clientes</strong> e <strong>{result.imported.products} produtos</strong> recebidos pelo modelo nativo do Louez.
        </div>
      )}

      {previewCustomers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Clientes — formato recebido pelo Louez</h2>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                <tr>
                  <th className="px-4 py-3">ID EstoqueNow</th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {previewCustomers.map((item) => (
                  <tr key={item.source.id} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="px-4 py-3 font-mono text-xs">{item.source.id}</td>
                    <td className="px-4 py-3">{item.louez.firstName} {item.louez.lastName}</td>
                    <td className="px-4 py-3">{item.louez.email}</td>
                    <td className="px-4 py-3">{item.louez.customerType === "business" ? "Empresa" : "Pessoa física"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {previewProducts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Produtos — formato recebido pelo Louez</h2>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                <tr>
                  <th className="px-4 py-3">ID EstoqueNow</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Diária</th>
                  <th className="px-4 py-3">Qtd.</th>
                </tr>
              </thead>
              <tbody>
                {previewProducts.map((item) => (
                  <tr key={item.source.id} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="px-4 py-3 font-mono text-xs">{item.source.id}</td>
                    <td className="px-4 py-3">{item.louez.name}</td>
                    <td className="px-4 py-3">{item.louez.categoryName || "Sem categoria"}</td>
                    <td className="px-4 py-3">R$ {Number(item.louez.price || 0).toFixed(2).replace(".", ",")}</td>
                    <td className="px-4 py-3">{item.louez.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(result?.customers?.length || result?.products?.length) ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <h3 className="mb-3 font-semibold">Clientes gravados</h3>
            <div className="space-y-2 text-sm">
              {result?.customers?.map((item) => (
                <div key={item.louezId} className="flex justify-between gap-3">
                  <span className="truncate">{item.name}</span>
                  <span className="text-neutral-500">{item.action === "created" ? "criado" : "atualizado"}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <h3 className="mb-3 font-semibold">Produtos gravados</h3>
            <div className="space-y-2 text-sm">
              {result?.products?.map((item) => (
                <div key={item.louezId} className="flex justify-between gap-3">
                  <span className="truncate">{item.name}</span>
                  <span className="text-neutral-500">{item.action === "created" ? "criado" : "atualizado"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
