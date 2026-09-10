import { desc, eq, sql } from "drizzle-orm";

import { customers, db, payments, reservations } from "@louez/db";

import { getCurrentStore } from "@/lib/store-context";

import { PrintButton } from "./print-button";

export const instant = false;

type PaymentType =
  | "rental"
  | "deposit"
  | "deposit_hold"
  | "deposit_capture"
  | "deposit_return"
  | "damage"
  | "adjustment";

type PaymentStatus = "pending" | "authorized" | "completed" | "failed" | "cancelled" | "refunded";
type PaymentMethod = "stripe" | "cash" | "card" | "transfer" | "check" | "other";
type CashDirection = "income" | "expense";
type FinanceCategory = "rentals" | "deposits" | "damage" | "adjustments" | "refunds";

interface FinancePageProps {
  searchParams: Promise<{
    display?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    transactionType?: string;
    status?: string;
    method?: string;
    bankAccount?: string;
    category?: string;
    minValue?: string;
    maxValue?: string;
  }>;
}

const TYPE_LABELS: Record<PaymentType, string> = {
  rental: "Locação",
  deposit: "Caução",
  deposit_hold: "Caução (retenção)",
  deposit_capture: "Caução capturada",
  deposit_return: "Devolução de caução",
  damage: "Danos",
  adjustment: "Ajuste",
};

const STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pendente",
  authorized: "Autorizada",
  completed: "Concluída",
  failed: "Falhou",
  cancelled: "Cancelada",
  refunded: "Estornada",
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  stripe: "Stripe",
  cash: "Dinheiro",
  card: "Cartão",
  transfer: "Transferência / Pix",
  check: "Cheque",
  other: "Outro",
};

const CATEGORY_LABELS: Record<FinanceCategory, string> = {
  rentals: "Locações",
  deposits: "Cauções",
  damage: "Danos",
  adjustments: "Ajustes",
  refunds: "Estornos",
};

const PAYMENT_TYPES = Object.keys(TYPE_LABELS) as PaymentType[];
const PAYMENT_STATUSES = Object.keys(STATUS_LABELS) as PaymentStatus[];
const PAYMENT_METHODS = Object.keys(METHOD_LABELS) as PaymentMethod[];
const FINANCE_CATEGORIES = Object.keys(CATEGORY_LABELS) as FinanceCategory[];

function parseMoneyFilter(value: string | undefined) {
  if (!value?.trim()) return null;
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function datePartsInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day") };
}

function currentPeriod(timezone: string) {
  const now = datePartsInTimezone(new Date(), timezone);
  const year = Number(now.year);
  const month = Number(now.month);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    today: `${now.year}-${now.month}-${now.day}`,
    firstDay: `${now.year}-${now.month}-01`,
    lastDay: `${now.year}-${now.month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function rowDate(date: Date | null, fallback: Date, timezone: string) {
  const parts = datePartsInTimezone(date ?? fallback, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function directionFor(row: {
  type: PaymentType;
  status: PaymentStatus;
  refundOfPaymentId: string | null;
}): CashDirection {
  if (row.refundOfPaymentId || row.type === "deposit_return" || row.status === "refunded") return "expense";
  return "income";
}

function categoryFor(row: {
  type: PaymentType;
  status: PaymentStatus;
  refundOfPaymentId: string | null;
}): FinanceCategory {
  if (directionFor(row) === "expense") return "refunds";
  if (["deposit", "deposit_hold", "deposit_capture"].includes(row.type)) return "deposits";
  if (row.type === "damage") return "damage";
  if (row.type === "adjustment") return "adjustments";
  return "rentals";
}

function statusClasses(status: PaymentStatus) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "pending" || status === "authorized") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (status === "failed" || status === "cancelled") return "bg-red-50 text-red-700 ring-red-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export default async function FinanceiroPage({ searchParams }: FinancePageProps) {
  const store = await getCurrentStore();
  if (!store) return null;

  const params = await searchParams;
  const timezone = store.settings?.timezone || "America/Sao_Paulo";
  const currency = store.settings?.currency || "BRL";
  const period = currentPeriod(timezone);

  const display = ["period", "today", "month", "all"].includes(params.display ?? "")
    ? (params.display as "period" | "today" | "month" | "all")
    : "period";

  let startDate = params.startDate || period.firstDay;
  let endDate = params.endDate || period.lastDay;
  if (display === "today") startDate = endDate = period.today;
  if (display === "month") {
    startDate = period.firstDay;
    endDate = period.lastDay;
  }

  const search = params.search?.trim().toLocaleLowerCase("pt-BR") ?? "";
  const transactionType = params.transactionType ?? "all";
  const status = PAYMENT_STATUSES.includes(params.status as PaymentStatus) ? (params.status as PaymentStatus) : "all";
  const method = PAYMENT_METHODS.includes(params.method as PaymentMethod) ? (params.method as PaymentMethod) : "all";
  const bankAccount = params.bankAccount === "unassigned" ? "unassigned" : "all";
  const category = FINANCE_CATEGORIES.includes(params.category as FinanceCategory)
    ? (params.category as FinanceCategory)
    : "all";
  const minValue = parseMoneyFilter(params.minValue);
  const maxValue = parseMoneyFilter(params.maxValue);

  const rows = await db
    .select({
      id: payments.id,
      reservationId: payments.reservationId,
      reservationNumber: reservations.number,
      amount: payments.amount,
      type: payments.type,
      method: payments.method,
      status: payments.status,
      notes: payments.notes,
      paidAt: payments.paidAt,
      createdAt: payments.createdAt,
      refundOfPaymentId: payments.refundOfPaymentId,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      companyName: customers.companyName,
    })
    .from(payments)
    .innerJoin(reservations, eq(payments.reservationId, reservations.id))
    .innerJoin(customers, eq(reservations.customerId, customers.id))
    .where(eq(reservations.storeId, store.id))
    .orderBy(desc(sql`COALESCE(${payments.paidAt}, ${payments.createdAt})`));

  const normalizedRows = rows.map((row) => {
    const type = row.type as PaymentType;
    const paymentStatus = row.status as PaymentStatus;
    const paymentMethod = row.method as PaymentMethod;
    const direction = directionFor({ type, status: paymentStatus, refundOfPaymentId: row.refundOfPaymentId });
    const categoryKey = categoryFor({ type, status: paymentStatus, refundOfPaymentId: row.refundOfPaymentId });
    const customerName =
      row.companyName?.trim() || `${row.customerFirstName} ${row.customerLastName}`.trim() || "Cliente não informado";
    const amount = Number(row.amount);
    const transactionDate = rowDate(row.paidAt, row.createdAt, timezone);
    const description = row.notes?.trim() || `${TYPE_LABELS[type]} do pedido #${row.reservationNumber}`;

    return {
      ...row,
      type,
      status: paymentStatus,
      method: paymentMethod,
      amount,
      transactionDate,
      direction,
      categoryKey,
      customerName,
      description,
      bankAccount: "Não informada",
    };
  });

  const filteredRows = normalizedRows.filter((row) => {
    if (display !== "all" && (row.transactionDate < startDate || row.transactionDate > endDate)) return false;

    if (search) {
      const searchable = [row.description, row.customerName, row.reservationNumber, row.amount.toFixed(2)]
        .join(" ")
        .toLocaleLowerCase("pt-BR");
      if (!searchable.includes(search)) return false;
    }

    if (transactionType === "income" && row.direction !== "income") return false;
    if (transactionType === "expense" && row.direction !== "expense") return false;
    if (PAYMENT_TYPES.includes(transactionType as PaymentType) && row.type !== transactionType) return false;
    if (status !== "all" && row.status !== status) return false;
    if (method !== "all" && row.method !== method) return false;
    if (bankAccount === "unassigned" && row.bankAccount !== "Não informada") return false;
    if (category !== "all" && row.categoryKey !== category) return false;
    if (minValue !== null && row.amount < minValue) return false;
    if (maxValue !== null && row.amount > maxValue) return false;

    return true;
  });

  const settledRows = filteredRows.filter((row) =>
    row.direction === "income" ? row.status === "completed" : row.status === "completed" || row.status === "refunded",
  );
  const totalIncome = settledRows
    .filter((row) => row.direction === "income")
    .reduce((total, row) => total + row.amount, 0);
  const totalExpense = settledRows
    .filter((row) => row.direction === "expense")
    .reduce((total, row) => total + row.amount, 0);
  const pending = filteredRows
    .filter((row) => row.direction === "income" && (row.status === "pending" || row.status === "authorized"))
    .reduce((total, row) => total + row.amount, 0);
  const balance = totalIncome - totalExpense;

  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency });
  const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const visibleRows = filteredRows.slice(0, 250);
  const fieldClass =
    "border-input bg-background focus:border-ring focus:ring-ring/20 h-11 w-full rounded-md border px-3 text-sm outline-none transition focus:ring-2";

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between print:block">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Financeiro</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Fluxo de caixa das locações, preparado para receber os pagamentos importados do EstoqueNow.
          </p>
        </div>
        <div className="print:hidden">
          <PrintButton />
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Entradas</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-700">{money.format(totalIncome)}</p>
          <p className="text-muted-foreground mt-1 text-xs">Recebimentos concluídos</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Saídas</p>
          <p className="mt-2 text-2xl font-semibold text-red-700">{money.format(totalExpense)}</p>
          <p className="text-muted-foreground mt-1 text-xs">Estornos e devoluções</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Saldo do período</p>
          <p className={`mt-2 text-2xl font-semibold ${balance < 0 ? "text-red-700" : "text-foreground"}`}>
            {money.format(balance)}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">Entradas menos saídas</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">A receber</p>
          <p className="mt-2 text-2xl font-semibold text-amber-700">{money.format(pending)}</p>
          <p className="text-muted-foreground mt-1 text-xs">Pendentes ou autorizadas</p>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-5 print:hidden">
        <form action="/dashboard/financeiro" method="get" className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
            <label className="space-y-1.5 xl:col-span-2">
              <span className="text-sm font-medium">Exibir transações</span>
              <select name="display" defaultValue={display} className={fieldClass}>
                <option value="period">Período</option>
                <option value="today">Hoje</option>
                <option value="month">Mês atual</option>
                <option value="all">Todas</option>
              </select>
            </label>

            <div className="space-y-1.5 xl:col-span-4">
              <span className="text-sm font-medium">Período</span>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                <input type="date" name="startDate" defaultValue={startDate} className={`${fieldClass} rounded-r-none`} />
                <span className="border-input bg-muted flex h-11 items-center border-y px-3 text-sm text-muted-foreground">até</span>
                <input type="date" name="endDate" defaultValue={endDate} className={`${fieldClass} rounded-l-none`} />
              </div>
            </div>

            <label className="space-y-1.5 xl:col-span-6">
              <span className="text-sm font-medium">Digite os dados da sua busca</span>
              <input
                type="search"
                name="search"
                defaultValue={params.search ?? ""}
                placeholder="pesquise por descrição, cliente, pedido ou valor"
                className={fieldClass}
              />
            </label>

            <label className="space-y-1.5 xl:col-span-2">
              <span className="text-sm font-medium">Tipo de transação</span>
              <select name="transactionType" defaultValue={transactionType} className={fieldClass}>
                <option value="all">Todos</option>
                <option value="income">Receitas</option>
                <option value="expense">Saídas</option>
                {PAYMENT_TYPES.map((type) => (
                  <option key={type} value={type}>{TYPE_LABELS[type]}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5 xl:col-span-2">
              <span className="text-sm font-medium">Situação da transação</span>
              <select name="status" defaultValue={status} className={fieldClass}>
                <option value="all">Todas</option>
                {PAYMENT_STATUSES.map((item) => (
                  <option key={item} value={item}>{STATUS_LABELS[item]}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5 xl:col-span-2">
              <span className="text-sm font-medium">Formas de pagamento</span>
              <select name="method" defaultValue={method} className={fieldClass}>
                <option value="all">Todas</option>
                {PAYMENT_METHODS.map((item) => (
                  <option key={item} value={item}>{METHOD_LABELS[item]}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5 xl:col-span-3">
              <span className="text-sm font-medium">Conta bancária</span>
              <select name="bankAccount" defaultValue={bankAccount} className={fieldClass}>
                <option value="all">Todas as contas</option>
                <option value="unassigned">Não informada</option>
              </select>
            </label>

            <label className="space-y-1.5 xl:col-span-3">
              <span className="text-sm font-medium">Categoria</span>
              <select name="category" defaultValue={category} className={fieldClass}>
                <option value="all">Todas</option>
                {FINANCE_CATEGORIES.map((item) => (
                  <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>
                ))}
              </select>
            </label>

            <div className="space-y-1.5 md:col-span-2 xl:col-span-4">
              <span className="text-sm font-medium">Faixa de valor</span>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                <input
                  inputMode="decimal"
                  name="minValue"
                  defaultValue={params.minValue ?? ""}
                  placeholder="0,00"
                  className={`${fieldClass} rounded-r-none text-right`}
                />
                <span className="border-input bg-muted flex h-11 items-center border-y px-3 text-sm text-muted-foreground">até</span>
                <input
                  inputMode="decimal"
                  name="maxValue"
                  defaultValue={params.maxValue ?? ""}
                  placeholder="0,00"
                  className={`${fieldClass} rounded-l-none text-right`}
                />
              </div>
            </div>
          </div>

          <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-muted-foreground text-xs">
              Os filtros de conta bancária e categoria já estão preparados para o mapeamento dos dados do EstoqueNow.
            </p>
            <div className="flex gap-2">
              <a
                href="/dashboard/financeiro"
                className="border-input bg-background hover:bg-muted inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors"
              >
                Limpar
              </a>
              <button
                type="submit"
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-5 text-sm font-medium transition-colors"
              >
                Buscar
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-1 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="font-semibold">Fluxo de caixa</h2>
            <p className="text-muted-foreground text-sm">
              {filteredRows.length} {filteredRows.length === 1 ? "transação encontrada" : "transações encontradas"}
            </p>
          </div>
          {filteredRows.length > visibleRows.length && (
            <p className="text-muted-foreground text-xs print:hidden">Exibindo as 250 transações mais recentes do filtro.</p>
          )}
        </div>

        {visibleRows.length === 0 ? (
          <div className="px-4 py-14 text-center sm:px-5">
            <p className="font-medium">Nenhuma transação encontrada</p>
            <p className="text-muted-foreground mt-1 text-sm">Ajuste os filtros ou aguarde a importação dos pagamentos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="px-4 py-3 font-medium sm:pl-5">Data</th>
                  <th className="px-4 py-3 font-medium">Descrição / Cliente</th>
                  <th className="px-4 py-3 font-medium">Pedido</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Situação</th>
                  <th className="px-4 py-3 font-medium">Forma</th>
                  <th className="px-4 py-3 font-medium">Conta</th>
                  <th className="px-4 py-3 font-medium">Categoria</th>
                  <th className="px-4 py-3 text-right font-medium sm:pr-5">Valor</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3 sm:pl-5">
                      {dateFormatter.format(row.paidAt ?? row.createdAt)}
                    </td>
                    <td className="max-w-[320px] px-4 py-3">
                      <p className="truncate font-medium">{row.description}</p>
                      <p className="text-muted-foreground truncate text-xs">{row.customerName}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">#{row.reservationNumber}</td>
                    <td className="whitespace-nowrap px-4 py-3">{TYPE_LABELS[row.type]}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${statusClasses(row.status)}`}>
                        {STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{METHOD_LABELS[row.method]}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{row.bankAccount}</td>
                    <td className="whitespace-nowrap px-4 py-3">{CATEGORY_LABELS[row.categoryKey]}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums sm:pr-5 ${row.direction === "expense" ? "text-red-700" : "text-emerald-700"}`}>
                      {row.direction === "expense" ? "−" : "+"} {money.format(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
