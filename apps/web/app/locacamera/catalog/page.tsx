import { and, asc, eq } from "drizzle-orm";

import { categories, pgDb, products, stores } from "@louez/db/postgres";

export const dynamic = "force-dynamic";

async function getCatalog() {
  const [store] = await pgDb
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.slug, "locacamera"))
    .limit(1);

  if (!store) return [];

  return pgDb
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      quantity: products.quantity,
      trackUnits: products.trackUnits,
      visible: products.isVisible,
      featured: products.isFeatured,
      category: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.storeId, store.id), eq(products.status, "active")))
    .orderBy(asc(categories.name), asc(products.name));
}

export default async function LocaCameraCatalogPage() {
  const rows = await getCatalog();

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-[#07182B]">
      <header className="border-b border-black/5 bg-[#07182B] text-white">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#EEB500]">LocaCamera</p>
          <h1 className="mt-1 text-xl font-semibold">Equipamentos</h1>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Catálogo operacional</h2>
            <p className="mt-1 text-sm text-slate-500">{rows.length} equipamentos cadastrados no novo banco.</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Equipamento</th>
                  <th className="px-5 py-3.5">Categoria</th>
                  <th className="px-5 py-3.5">Diária</th>
                  <th className="px-5 py-3.5">Estoque</th>
                  <th className="px-5 py-3.5">Site</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4 font-medium">{row.name}</td>
                    <td className="px-5 py-4 text-slate-500">{row.category || "—"}</td>
                    <td className="px-5 py-4 font-medium">
                      {Number(row.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {row.trackUnits ? "Por unidade" : row.quantity}
                    </td>
                    <td className="px-5 py-4">
                      <span className={row.visible ? "font-medium text-emerald-700" : "text-slate-400"}>
                        {row.visible ? "Visível" : "Oculto"}
                      </span>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                      Catálogo ainda não importado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
