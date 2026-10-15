import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import { useAuth, useScope } from "../../app/Auth";
import { all, api, send } from "../../lib/api";
import {
  Badge,
  date,
  Empty,
  ErrorMessage,
  Loading,
  Modal,
  PageHeader,
  Pagination,
} from "../../components/UI";
import type { Balance, Named, Page, Product, StockDocument } from "../../types";
const schema = z.object({
  type: z.enum(["RECEIVE", "ISSUE", "TRANSFER", "ADJUST"]),
  source_location: z.string(),
  destination_location: z.string(),
  reason: z.string().trim().min(1, "A reason is required").max(500),
  reference: z.string().max(120),
  lines: z
    .array(
      z.object({
        product: z.string().min(1, "Select a product"),
        quantity: z.number().int().min(1),
        adjustment_direction: z.string(),
      }),
    )
    .min(1)
    .max(100),
});
type Values = z.infer<typeof schema>;
export function Operations() {
  const scope = useScope();
  const { membership } = useAuth();
  const [params] = useSearchParams();
  const [editing, setEditing] = useState<StockDocument | null | undefined>(
    params.has("type") ? null : undefined,
  );
  const [confirm, setConfirm] = useState<StockDocument>();
  const [page, setPage] = useState(1);
  const [key, setKey] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: [scope, "documents", page],
    queryFn: () => api<Page<StockDocument>>(`stock-documents/?page=${page}`),
  });
  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      send(`stock-documents/${id}/${action}/`, {}, "POST", key),
    onSuccess: () => {
      setConfirm(undefined);
      void client.invalidateQueries({ queryKey: [scope] });
    },
  });
  const canOperate = membership?.role !== "VIEWER";
  return (
    <>
      <PageHeader
        eyebrow="STOCK OPERATIONS"
        title="Keep stock moving"
        description="Prepare a draft, review the details, then post to your ledger."
        action={
          canOperate && (
            <button className="button primary" onClick={() => setEditing(null)}>
              <Plus size={17} /> New operation
            </button>
          )
        }
      />
      <ErrorMessage error={query.error || mutation.error} />
      <section className="panel">
        {query.isPending ? (
          <Loading />
        ) : !query.data?.results.length ? (
          <Empty
            title="Ready for your first operation?"
            text="Receive, issue, transfer, or adjust stock with a complete audit trail."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Type</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {query.data.results.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">
                      {d.document_no}
                      <small>{d.lines.length} product lines</small>
                    </td>
                    <td>
                      <Badge>{d.type}</Badge>
                    </td>
                    <td>{d.reason}</td>
                    <td>
                      <Badge>{d.status}</Badge>
                    </td>
                    <td>{date(d.created_at)}</td>
                    <td>
                      {d.receipt_id && (
                        <a className="text-link" href="/app/purchasing">
                          Manage receipt
                        </a>
                      )}
                      {d.status === "DRAFT" &&
                        canOperate &&
                        !d.receipt_id &&
                        (d.type !== "ADJUST" ||
                          ["ADMIN", "MANAGER"].includes(
                            membership?.role || "",
                          )) && (
                          <div className="inline-actions">
                            <button
                              className="button secondary"
                              onClick={() => setEditing(d)}
                            >
                              Edit
                            </button>
                            <button
                              className="button primary"
                              onClick={() => {
                                setConfirm(d);
                                setKey(crypto.randomUUID());
                              }}
                            >
                              Review & post
                            </button>
                            <button
                              className="button quiet"
                              disabled={mutation.isPending}
                              onClick={() =>
                                mutation.mutate({
                                  id: d.id,
                                  action: "void-draft",
                                })
                              }
                            >
                              Void
                            </button>
                          </div>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          count={query.data?.count || 0}
          onChange={setPage}
        />
      </section>
      {editing !== undefined && (
        <OperationForm
          initial={editing}
          initialType={params.get("type") || "RECEIVE"}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void client.invalidateQueries({ queryKey: [scope] });
          }}
        />
      )}
      {confirm && (
        <Modal
          title={`Post ${confirm.document_no}?`}
          onClose={() => {
            if (!mutation.isPending) setConfirm(undefined);
          }}
        >
          <p>
            This will change stock immediately. Posted documents are immutable;
            corrections require a new adjustment.
          </p>
          <div className="review-lines">
            {confirm.lines.map((l, i) => (
              <div key={i}>
                <strong>{l.product_name}</strong>
                <span>
                  {l.quantity} units {l.adjustment_direction}
                </span>
              </div>
            ))}
          </div>
          <p>
            <strong>Reason:</strong> {confirm.reason}
          </p>
          <ErrorMessage error={mutation.error} />
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={mutation.isPending}
              onClick={() => setConfirm(undefined)}
            >
              Keep draft
            </button>
            <button
              className="button primary"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({ id: confirm.id, action: "post" })
              }
            >
              {mutation.isPending ? "Posting..." : "Confirm posting"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function OperationForm({
  initial,
  initialType,
  onClose,
  onSaved,
}: {
  initial: StockDocument | null;
  initialType: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const scope = useScope();
  const { membership } = useAuth();
  const manager = ["ADMIN", "MANAGER"].includes(membership?.role || "");
  const lookups = useQuery({
    queryKey: [scope, "operation-lookups"],
    queryFn: async () => ({
      products: await all<Product>("products/?is_active=true"),
      locations: await all<Named>("locations/?is_active=true"),
      balances: await all<Balance>("inventory/balances/"),
    }),
  });
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: (initial?.type || initialType) as Values["type"],
      source_location: initial?.source_location || "",
      destination_location: initial?.destination_location || "",
      reason: initial?.reason || "",
      reference: initial?.reference || "",
      lines: initial?.lines.map((l) => ({
        product: l.product,
        quantity: l.quantity,
        adjustment_direction: l.adjustment_direction || "IN",
      })) || [{ product: "", quantity: 1, adjustment_direction: "IN" }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const type = watch("type");
  const selectedLocation = watch(
    type === "ISSUE" || type === "TRANSFER"
      ? "source_location"
      : "destination_location",
  );
  const selectedLines = watch("lines");
  const mutation = useMutation({
    mutationFn: (data: Values) =>
      send(
        `stock-documents/${initial ? initial.id + "/" : ""}`,
        {
          ...data,
          source_location: ["ISSUE", "TRANSFER"].includes(data.type)
            ? data.source_location
            : null,
          destination_location:
            data.type !== "ISSUE" ? data.destination_location : null,
          lines: data.lines.map((l) => ({
            ...l,
            adjustment_direction:
              data.type === "ADJUST" ? l.adjustment_direction : "",
          })),
        },
        initial ? "PATCH" : "POST",
      ),
    onSuccess: onSaved,
  });
  const close = () => {
    if (
      !mutation.isPending &&
      (!isDirty || window.confirm("Discard unsaved draft changes?"))
    )
      onClose();
  };
  return (
    <Modal
      title={initial ? "Edit stock draft" : "New stock operation"}
      onClose={close}
    >
      <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
        <div className="form-grid">
          <label>
            Operation
            <select aria-label="Operation" {...register("type")}>
              <option>RECEIVE</option>
              <option>ISSUE</option>
              <option>TRANSFER</option>
              {manager && <option>ADJUST</option>}
            </select>
          </label>
          <label>
            Reference
            <input
              {...register("reference")}
              placeholder="Order or external reference"
            />
          </label>
          {["ISSUE", "TRANSFER"].includes(type) && (
            <label>
              From location
              <select
                aria-label="From location"
                {...register("source_location")}
                required
              >
                <option value="">Choose a bin</option>
                {lookups.data?.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.warehouse_name} / {l.code}
                  </option>
                ))}
              </select>
            </label>
          )}
          {type !== "ISSUE" && (
            <label>
              {type === "ADJUST" ? "Adjustment location" : "To location"}
              <select
                aria-label={
                  type === "ADJUST" ? "Adjustment location" : "To location"
                }
                {...register("destination_location")}
                required
              >
                <option value="">Choose a bin</option>
                {lookups.data?.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.warehouse_name} / {l.code}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="section-label">PRODUCT LINES</div>
        {fields.map((field, index) => (
          <div className="line-editor" key={field.id}>
            <label>
              Product
              <select
                aria-label="Product"
                {...register(`lines.${index}.product`)}
              >
                <option value="">Select product</option>
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
                {...register(`lines.${index}.quantity`, {
                  valueAsNumber: true,
                })}
              />
            </label>
            {type === "ADJUST" && (
              <label>
                Direction
                <select {...register(`lines.${index}.adjustment_direction`)}>
                  <option>IN</option>
                  <option>OUT</option>
                </select>
              </label>
            )}
            <button
              type="button"
              className="icon-button"
              disabled={fields.length === 1}
              aria-label={`Remove line ${index + 1}`}
              onClick={() => remove(index)}
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
        {selectedLocation && (
          <p className="form-note">
            Available in selected bin:{" "}
            {selectedLines
              .filter((line) => line.product)
              .map((line) => {
                const product = lookups.data?.products.find(
                  (p) => p.id === line.product,
                );
                const balance = lookups.data?.balances.find(
                  (b) =>
                    b.product === line.product &&
                    b.location === selectedLocation,
                );
                return `${product?.sku}: ${balance?.on_hand || 0} ${product?.unit_code || "units"}`;
              })
              .join(" / ") || "Select a product to see availability."}
          </p>
        )}
        <button
          type="button"
          className="button quiet"
          onClick={() =>
            append({ product: "", quantity: 1, adjustment_direction: "IN" })
          }
        >
          <Plus size={16} /> Add product line
        </button>
        <label>
          Reason
          <textarea
            {...register("reason")}
            placeholder="Why is this stock moving?"
            rows={2}
          />
        </label>
        {Object.keys(errors).length > 0 && (
          <ErrorMessage error="Check all product selections, positive whole quantities, and the reason." />
        )}
        <ErrorMessage error={lookups.error || mutation.error} />
        <p className="form-note">
          Saving a draft does not affect stock. Availability is checked again
          when posting.
        </p>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={mutation.isPending || lookups.isPending}
          >
            {mutation.isPending ? "Saving..." : "Save draft"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
