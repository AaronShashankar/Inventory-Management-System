import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useAuth, useScope } from "../../app/Auth";
import { all, api, send } from "../../lib/api";
import {
  Badge,
  Empty,
  ErrorMessage,
  Loading,
  Modal,
  PageHeader,
  Pagination,
} from "../../components/UI";
import type {
  Named,
  Order,
  OrderLine,
  Page,
  Product,
  Receipt,
} from "../../types";
export function Purchasing() {
  const scope = useScope();
  const { membership } = useAuth();
  const manager = ["ADMIN", "MANAGER"].includes(membership?.role || "");
  const operator = membership?.role !== "VIEWER";
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Order | null | undefined>();
  const [receiving, setReceiving] = useState<Order>();
  const [action, setAction] = useState<{
    id: string;
    name: string;
    label: string;
    receipt?: boolean;
  }>();
  const [key, setKey] = useState("");
  const orders = useQuery({
    queryKey: [scope, "orders", page],
    queryFn: () => api<Page<Order>>(`purchase-orders/?page=${page}`),
  });
  const receipts = useQuery({
    queryKey: [scope, "receipts"],
    queryFn: () => all<Receipt>("goods-receipts/"),
  });
  const refresh = () => {
    setEditing(undefined);
    setReceiving(undefined);
    setAction(undefined);
    void client.invalidateQueries({ queryKey: [scope] });
  };
  const mutation = useMutation({
    mutationFn: () =>
      send(
        `${action?.receipt ? "goods-receipts" : "purchase-orders"}/${action?.id}/${action?.name}/`,
        {},
        "POST",
        key,
      ),
    onSuccess: refresh,
  });
  const ask = (id: string, name: string, label: string, receipt = false) => {
    setAction({ id, name, label, receipt });
    setKey(crypto.randomUUID());
  };
  return (
    <>
      <PageHeader
        eyebrow="PURCHASING"
        title="From order to shelf"
        description="Track commitments, receive in parts, and stay ahead of replenishment."
        action={
          manager && (
            <button className="button primary" onClick={() => setEditing(null)}>
              <Plus size={17} /> Create purchase order
            </button>
          )
        }
      />
      <ErrorMessage error={orders.error || receipts.error} />
      <section className="panel">
        {orders.isPending ? (
          <Loading />
        ) : !orders.data?.results.length ? (
          <Empty
            title="Your next delivery starts here"
            text="Create a purchase order for a supplier, then receive it in full or in parts."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Purchase order</th>
                  <th>Supplier</th>
                  <th>Order total</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.data.results.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong className="mono">{o.po_number}</strong>
                      <small>
                        {o.lines
                          .map(
                            (l) =>
                              `${l.received_qty}/${l.ordered_qty} received`,
                          )
                          .join(" | ")}
                      </small>
                    </td>
                    <td>{o.supplier_name}</td>
                    <td>
                      {membership?.currency} {o.total}
                    </td>
                    <td>
                      <Badge>{o.status}</Badge>
                    </td>
                    <td>
                      <div className="inline-actions">
                        {o.status === "DRAFT" && manager && (
                          <>
                            <button
                              className="button secondary"
                              onClick={() => setEditing(o)}
                            >
                              Edit
                            </button>
                            <button
                              className="button primary"
                              onClick={() =>
                                ask(o.id, "submit", `Submit ${o.po_number}`)
                              }
                            >
                              Submit
                            </button>
                          </>
                        )}
                        {["ORDERED", "PARTIALLY_RECEIVED"].includes(o.status) &&
                          operator && (
                            <button
                              className="button primary"
                              onClick={() => setReceiving(o)}
                            >
                              Receive goods
                            </button>
                          )}
                        {manager &&
                          [
                            "ORDERED",
                            "PARTIALLY_RECEIVED",
                            "RECEIVED",
                          ].includes(o.status) && (
                            <button
                              className="button quiet"
                              onClick={() =>
                                ask(
                                  o.id,
                                  "close",
                                  `Close remaining quantities on ${o.po_number}`,
                                )
                              }
                            >
                              Close
                            </button>
                          )}
                        {manager && ["DRAFT", "ORDERED"].includes(o.status) && (
                          <button
                            className="button quiet"
                            onClick={() =>
                              ask(o.id, "cancel", `Cancel ${o.po_number}`)
                            }
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          count={orders.data?.count || 0}
          onChange={setPage}
        />
      </section>
      <section className="panel section-gap">
        <div className="panel-heading">
          <div>
            <h2>Goods receipts</h2>
            <p>Review draft receipts, then post them to update inventory.</p>
          </div>
        </div>
        {!receipts.data?.length ? (
          <Empty
            title="No receipts yet"
            text="Receive goods against an ordered purchase order."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Purchase order</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {receipts.data.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.receipt_number}</td>
                    <td>{r.po_number}</td>
                    <td>
                      <Badge>{r.status}</Badge>
                    </td>
                    <td>
                      {r.status === "DRAFT" && operator && (
                        <button
                          className="button primary"
                          onClick={() =>
                            ask(
                              r.id,
                              "post",
                              `Post goods receipt ${r.receipt_number}`,
                              true,
                            )
                          }
                        >
                          Review & post
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="form-note">
        Purchase totals are quantity x agreed unit price, in{" "}
        {membership?.currency}. Taxes, payments, and accounting valuation are
        outside this MVP.
      </p>
      {editing !== undefined && (
        <OrderForm
          initial={editing}
          onClose={() => setEditing(undefined)}
          onSaved={refresh}
        />
      )}
      {receiving && (
        <ReceiptForm
          order={receiving}
          onClose={() => setReceiving(undefined)}
          onSaved={refresh}
        />
      )}
      {action && (
        <Modal
          title={action.label + "?"}
          onClose={() => {
            if (!mutation.isPending) setAction(undefined);
          }}
        >
          <p>
            {action.receipt
              ? "This posts the receipt to inventory and updates the order remainder. Posted stock cannot be edited."
              : "This changes the purchase order lifecycle. Closing or cancelling prevents further receipts."}
          </p>
          {action.receipt && (
            <div className="review-lines">
              {receipts.data
                ?.find((r) => r.id === action.id)
                ?.lines.map((line, index) => (
                  <div key={index}>
                    <strong>{line.product_name}</strong>
                    <span>{line.quantity} units</span>
                  </div>
                ))}
            </div>
          )}
          <ErrorMessage error={mutation.error} />
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={mutation.isPending}
              onClick={() => setAction(undefined)}
            >
              Back
            </button>
            <button
              className="button primary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Working..." : "Confirm"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function OrderForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Order | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const scope = useScope();
  const [lines, setLines] = useState<OrderLine[]>(
    initial?.lines || [{ product: "", ordered_qty: 1, unit_price: "0.00" }],
  );
  const lookups = useQuery({
    queryKey: [scope, "purchase-lookups"],
    queryFn: async () => ({
      products: await all<Product>("products/?is_active=true"),
      suppliers: await all<Named>("suppliers/"),
    }),
  });
  const mutation = useMutation({
    mutationFn: (data: unknown) =>
      send(
        `purchase-orders/${initial ? initial.id + "/" : ""}`,
        data,
        initial ? "PATCH" : "POST",
      ),
    onSuccess: onSaved,
  });
  const update = (index: number, data: Partial<OrderLine>) =>
    setLines(lines.map((l, i) => (i === index ? { ...l, ...data } : l)));
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    mutation.mutate({
      ...data,
      expected_date: data.expected_date || null,
      lines: lines.map(({ product, ordered_qty, unit_price }) => ({
        product,
        ordered_qty,
        unit_price,
      })),
    });
  }
  return (
    <Modal
      title={initial ? "Edit purchase order" : "New purchase order"}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <label>
            Supplier
            <select
              name="supplier"
              aria-label="Supplier"
              defaultValue={initial?.supplier || ""}
              required
            >
              <option value="">Choose supplier</option>
              {lookups.data?.suppliers
                .filter((s) => s.is_active)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Expected delivery
            <input
              type="date"
              name="expected_date"
              defaultValue={initial?.expected_date || ""}
            />
          </label>
        </div>
        <div className="section-label">ORDER LINES</div>
        {lines.map((line, i) => (
          <div className="line-editor" key={i}>
            <label>
              Product
              <select
                required
                value={line.product}
                aria-label="Product"
                onChange={(e) =>
                  update(i, {
                    product: e.target.value,
                    unit_price:
                      lookups.data?.products.find(
                        (p) => p.id === e.target.value,
                      )?.default_purchase_price || "0.00",
                  })
                }
              >
                <option value="">Choose product</option>
                {lookups.data?.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} / {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity
              <input
                type="number"
                min="1"
                step="1"
                required
                value={line.ordered_qty}
                onChange={(e) =>
                  update(i, { ordered_qty: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Unit price
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={line.unit_price}
                onChange={(e) => update(i, { unit_price: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove line ${i + 1}`}
              disabled={lines.length === 1}
              onClick={() => setLines(lines.filter((_, index) => index !== i))}
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
        <button
          className="button quiet"
          type="button"
          onClick={() =>
            setLines([
              ...lines,
              { product: "", ordered_qty: 1, unit_price: "0.00" },
            ])
          }
        >
          <Plus size={16} /> Add line
        </button>
        <ErrorMessage error={lookups.error || mutation.error} />
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={mutation.isPending || lookups.isPending}
          >
            Save draft
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ReceiptForm({
  order,
  onClose,
  onSaved,
}: {
  order: Order;
  onClose: () => void;
  onSaved: () => void;
}) {
  const scope = useScope();
  const locations = useQuery({
    queryKey: [scope, "locations-all"],
    queryFn: () => all<Named>("locations/?is_active=true"),
  });
  const mutation = useMutation({
    mutationFn: (data: unknown) => send("goods-receipts/", data),
    onSuccess: onSaved,
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    mutation.mutate({
      purchase_order: order.id,
      location: form.get("location"),
      lines: order.lines
        .map((l) => ({
          purchase_order_line: l.id,
          received_qty: Number(form.get(String(l.id))),
        }))
        .filter((l) => l.received_qty > 0),
    });
  }
  return (
    <Modal title={`Receive ${order.po_number}`} onClose={onClose}>
      <form onSubmit={submit}>
        <label>
          Receiving location
          <select name="location" aria-label="Receiving location" required>
            <option value="">Choose bin</option>
            {locations.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.warehouse_name} / {l.code}
              </option>
            ))}
          </select>
        </label>
        {order.lines.map((l) => {
          const remaining = l.ordered_qty - (l.received_qty || 0);
          return (
            <label key={l.id}>
              {l.product_name} / {remaining} outstanding
              <input
                type="number"
                name={String(l.id)}
                min="0"
                max={remaining}
                step="1"
                defaultValue={0}
              />
            </label>
          );
        })}
        <p className="form-note">
          Enter only quantities physically received. Leave other lines at zero.
        </p>
        <ErrorMessage error={locations.error || mutation.error} />
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={mutation.isPending}>
            Save receipt draft
          </button>
        </div>
      </form>
    </Modal>
  );
}
