import { EstoqueNowSmokeClient } from "./estoquenow-smoke-client";

export const dynamic = "force-dynamic";

export default function EstoqueNowMigrationPage() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Migração EstoqueNow → Louez</h1>
        <p className="max-w-3xl text-sm text-neutral-600 sm:text-base dark:text-neutral-400">
          Teste controlado com exatamente 10 clientes e 10 produtos. A API do EstoqueNow é lida diretamente, os campos são convertidos para o modelo nativo do Louez e só então gravados.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Clientes</p>
          <p className="mt-1 text-2xl font-bold">10</p>
          <p className="mt-2 text-xs text-neutral-500">Nome, contato, endereço, tipo e identificação de origem.</p>
        </div>
        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Produtos</p>
          <p className="mt-1 text-2xl font-bold">10</p>
          <p className="mt-2 text-xs text-neutral-500">Nome, categoria, diária, quantidade e status.</p>
        </div>
        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Regra do teste</p>
          <p className="mt-1 text-lg font-bold">Sem duplicação</p>
          <p className="mt-2 text-xs text-neutral-500">O ID do Louez é determinístico a partir do ID original do EstoqueNow.</p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Neste primeiro teste as imagens externas não são copiadas para o storage. As URLs originais aparecem na prévia e serão migradas para o storage do Louez na etapa definitiva.
      </div>

      <EstoqueNowSmokeClient />
    </div>
  );
}
