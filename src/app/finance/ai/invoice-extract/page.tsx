import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { SortableTable } from "@/components/SortableTable";
import { extractInvoiceFromText } from "@/lib/finance-ai";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function InvoiceExtractPage({ searchParams }: { searchParams: Promise<{ text?: string }> }) {
  const sp = await searchParams;
  const text = sp.text ?? "";
  const result = text ? await extractInvoiceFromText(text) : null;

  return (
    <AppLayout eyebrow="Finance AI" title="Invoice extractor" description="Paste invoice text (PDF text dump or forwarded email). AI extracts structured fields and suggests cost coding.">
      <form method="get" className="card p-6 grid gap-3">
        <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Invoice text</label>
        <textarea name="text" defaultValue={text} rows={10} placeholder="Paste invoice PDF text or forwarded email body here…" className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
        <div className="flex gap-3">
          <button type="submit" className="btn-primary">Extract</button>
          <Link href="/finance/ai" className="btn-outline text-xs">← back to Finance AI</Link>
        </div>
      </form>
      {result ? (
        <section className="card p-6 mt-6">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Extracted · confidence {result.confidence}%</div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Field label="Vendor">{result.vendorName}</Field>
            <Field label="Invoice #">{result.invoiceNumber}</Field>
            <Field label="Invoice date">{formatDate(result.invoiceDate)}</Field>
            <Field label="Due date">{formatDate(result.dueDate)}</Field>
            <Field label="PO">{result.poNumber ?? "—"}</Field>
            <Field label="Total">{formatCurrency(result.total)}</Field>
          </div>
          <div className="mt-5 text-xs uppercase tracking-[0.18em] text-slate-400">Line items</div>
          <SortableTable
            className="min-w-full divide-y divide-white/10 text-sm mt-2"
            emptyMessage="No line items."
            columns={[
              { header: "Description" },
              { header: "Cost code" },
              { header: "Amount" },
            ]}
            rows={result.lineItems.map((l, i) => ({
              key: String(i),
              cells: [
                { sort: l.description, node: l.description },
                { sort: l.costCode ?? "", node: l.costCode ?? "—", tdClassName: "font-mono text-xs" },
                { sort: Number(l.amount), node: formatCurrency(l.amount) },
              ],
            }))}
          />
        </section>
      ) : null}
    </AppLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div><div className="mt-1 text-sm text-white font-semibold">{children}</div></div>;
}
