import { sql } from "drizzle-orm";

import { pgDb } from "@louez/db/postgres";

export const dynamic = "force-dynamic";

async function getOverview() {
  const [row] = await pgDb.execute<{
    products: number;
    customers: number;
    reservations: number;
    active_reservations: number;
    payments: number;
  }>(sql`
    select
      (select count(*)::int from public.products where status = 'active') as products,
      (select count(*)::int from public.customers) as customers,
      (select count(*)::int from public.reservations) as reservations,
      (select count(*)::int from public.reservations where status in ('pending','confirmed','ongoing')) as active_reservations,
      (select count(*)::int from public.payments where status = 'completed') as payments
  `);

  return {
    products: Number(row?.products ?? 0),
    customers: Number(row?.customers ?? 0),
    reservations: Number(row?.reservations ?? 0),
    activeReservations: Number(row?.active_reservations ?? 0),
    payments: Number(row?.payments ?? 0),
  };
}

export default async function LocaCameraTestDashboard() {
  const overview = await getOverview();

  const cards = [
    ["Equipamentos", overview.products],
    ["Clientes", overview.customers],
    ["Locações", overview.reservations],
    ["Em andamento", overview.activeReservations],
    ["Pagamentos", overview.payments],
  ] as const;

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-[#07182B]">
      <header className="border-b border-black/5 bg-[#07182B] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#EEB500]">
              LocaCamera
            </p>
            <h1 className="mt-1 text-xl font-semibold">Gestão — ambiente de teste</h1>
          </div>
          <div className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80">
            Supabase São Paulo
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Visão geral</h2>
            <p className="mt-1 text-sm text-slate-500">
              Núcleo operacional conectado ao novo banco da LocaCamera.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Banco conectado
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {cards.map(([label, value]) => (
            <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
            </article>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-[#07182B]/10 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-5">
            <div>
              <h3 className="font-semibold">Estrutura ativa</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Produtos, unidades individuais, indisponibilidades, clientes, reservas, pagamentos e histórico operacional já estão separados no PostgreSQL.
              </p>
            </div>
            <span className="rounded-lg bg-[#EEB500]/15 px-3 py-1.5 text-xs font-semibold text-[#806200]">
              TESTE
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
