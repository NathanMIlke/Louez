"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="border-border bg-background hover:bg-muted inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors print:hidden"
    >
      Imprimir
    </button>
  );
}
