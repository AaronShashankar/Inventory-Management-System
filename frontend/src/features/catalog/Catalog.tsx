import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil } from "lucide-react";
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
import type { Named, Page, Product } from "../../types";
const settings = {
  products: {
    title: "Products",
    description:
      "Your catalog, organized. Stock changes are recorded through operations.",
    singular: "product",
    fields: [
      "sku",
      "name",
      "description",
      "barcode",
      "category",
      "unit",
      "reorder_level",
      "default_purchase_price",
    ],
  },
  suppliers: {
    title: "Suppliers",
    description: "The people and partners keeping your shelves stocked.",
    singular: "supplier",
    fields: ["name", "email", "phone", "address"],
  },
  warehouses: {
    title: "Warehouses",
    description:
      "A home for every item. Each warehouse starts with a MAIN bin.",
    singular: "warehouse",
    fields: ["code", "name", "address"],
  },
  locations: {
    title: "Storage locations",
    description: "Organize stock into distinct bins within each warehouse.",
    singular: "location",
    fields: ["warehouse", "code", "name"],
  },
  categories: {
    title: "Categories",
    description: "Keep your products easy to browse and organize.",
    singular: "category",
    fields: ["name"],
  },
  units: {
    title: "Stock units",
    description: "Each product uses one whole-number base stock unit.",
    singular: "unit",
    fields: ["code", "name"],
  },
};
type Resource = keyof typeof settings;
type RecordRow = Named & Partial<Product>;
export function Catalog({ resource }: { resource: Resource }) {
  const config = settings[resource];
  const scope = useScope();
  const { membership } = useAuth();
  const canEdit = ["ADMIN", "MANAGER"].includes(membership?.role || "");
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<RecordRow | null | undefined>();
  const query = useQuery({
    queryKey: [scope, resource, search, page],
    queryFn: () =>
      api<Page<RecordRow>>(
        `${resource}/?search=${encodeURIComponent(search)}&page=${page}`,
      ),
  });
  return (
    <>
      <PageHeader
        eyebrow="MASTER DATA"
        title={config.title}
        description={config.description}
        action={
          canEdit && (
            <button className="button primary" onClick={() => setEditing(null)}>
              <Plus size={17} /> Add {config.singular}
            </button>
          )
        }
      />
      {resource === "products" && (
        <div className="tabs">
          <a href="/app/categories">Categories</a>
          <a href="/app/units">Stock units</a>
        </div>
      )}
      {resource === "warehouses" && (
        <div className="tabs">
          <a href="/app/locations">Manage storage locations</a>
        </div>
      )}
      <section className="panel">
        <div className="toolbar">
          <div className="search">
            <Search size={17} />
            <input
              aria-label={`Search ${config.title.toLowerCase()}`}
              placeholder={`Search ${config.title.toLowerCase()}...`}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <span className="subtle-label">{query.data?.count || 0} records</span>
        </div>
        <ErrorMessage error={query.error} />
        {query.isPending ? (
          <Loading />
        ) : !query.data?.results.length ? (
          <Empty
            title={`No ${config.title.toLowerCase()} found`}
            text={`Add a ${config.singular} or adjust your search.`}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{resource === "products" ? "Product" : "Name"}</th>
                  <th>
                    {resource === "products" ? "Category / unit" : "Details"}
                  </th>
                  {resource === "products" && (
                    <>
                      <th>Reorder level</th>
                      <th>Reference price</th>
                    </>
                  )}
                  <th>Status</th>
                  {canEdit && (
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {query.data.results.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                      <small className="mono">
                        {row.sku || row.code || row.email || "-"}
                      </small>
                    </td>
                    <td>
                      {row.category_name ||
                        row.warehouse_name ||
                        row.address ||
                        row.phone ||
                        "-"}
                      {row.unit_code && <small>{row.unit_code}</small>}
                    </td>
                    {resource === "products" && (
                      <>
                        <td>{row.reorder_level}</td>
                        <td>
                          {membership?.currency} {row.default_purchase_price}
                        </td>
                      </>
                    )}
                    <td>
                      <Badge>
                        {row.is_active === false ? "Inactive" : "Active"}
                      </Badge>
                    </td>
                    {canEdit && (
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Edit ${row.name}`}
                          onClick={() => setEditing(row)}
                        >
                          <Pencil size={16} />
                        </button>
                      </td>
                    )}
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
        <CatalogForm
          resource={resource}
          record={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void client.invalidateQueries({ queryKey: [scope] });
          }}
        />
      )}
    </>
  );
}
function CatalogForm({
  resource,
  record,
  onClose,
  onSaved,
}: {
  resource: Resource;
  record: RecordRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const config = settings[resource];
  const scope = useScope();
  const lookups = useQuery({
    queryKey: [scope, "catalog-lookups"],
    queryFn: async () => ({
      units: await all<Named>("units/"),
      categories: await all<Named>("categories/"),
      warehouses: await all<Named>("warehouses/"),
    }),
  });
  const mutation = useMutation({
    mutationFn: (data: unknown) =>
      send(
        `${resource}/${record ? record.id + "/" : ""}`,
        data,
        record ? "PATCH" : "POST",
      ),
    onSuccess: onSaved,
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data: Record<string, unknown> = Object.fromEntries(
      new FormData(e.currentTarget),
    );
    for (const field of ["reorder_level"])
      if (field in data) data[field] = Number(data[field]);
    if (data.category === "") data.category = null;
    if (["products", "suppliers", "warehouses", "locations"].includes(resource))
      data.is_active = data.is_active === "on";
    mutation.mutate(data);
  }
  return (
    <Modal
      title={`${record ? "Edit" : "Add"} ${config.singular}`}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          {config.fields.map((field) => {
            const values =
              field === "unit"
                ? lookups.data?.units
                : field === "category"
                  ? lookups.data?.categories
                  : field === "warehouse"
                    ? lookups.data?.warehouses
                    : undefined;
            const relation = ["unit", "category", "warehouse"].includes(field);
            const number = ["reorder_level", "default_purchase_price"].includes(
              field,
            );
            const initial = record
              ? (record as unknown as Record<string, string | number>)[field]
              : number
                ? "0"
                : "";
            return (
              <label key={field}>
                {field.replaceAll("_", " ")}
                {relation ? (
                  <select
                    name={field}
                    aria-label={field.replaceAll("_", " ")}
                    required={field !== "category"}
                    defaultValue={initial ?? ""}
                  >
                    <option value="">Select {field}</option>
                    {values?.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name={field}
                    type={
                      number ? "number" : field === "email" ? "email" : "text"
                    }
                    min={number ? 0 : undefined}
                    step={
                      field === "default_purchase_price"
                        ? "0.01"
                        : number
                          ? "1"
                          : undefined
                    }
                    defaultValue={initial ?? ""}
                    required={[
                      "sku",
                      "name",
                      "code",
                      "reorder_level",
                      "default_purchase_price",
                    ].includes(field)}
                    maxLength={
                      field === "description" || field === "address"
                        ? undefined
                        : 160
                    }
                  />
                )}
              </label>
            );
          })}
        </div>
        {["products", "suppliers", "warehouses", "locations"].includes(
          resource,
        ) && (
          <label className="checkbox">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={record?.is_active !== false}
            />{" "}
            Active
          </label>
        )}
        {resource === "products" && (
          <p className="form-note">
            Reference purchase price is not inventory valuation. Create a stock
            operation to change quantities.
          </p>
        )}
        <ErrorMessage error={lookups.error || mutation.error} />
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={mutation.isPending || lookups.isPending}
          >
            {mutation.isPending ? "Saving..." : "Save " + config.singular}
          </button>
        </div>
      </form>
    </Modal>
  );
}
