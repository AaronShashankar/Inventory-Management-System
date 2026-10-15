import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useScope } from "../../app/Auth";
import { all, api } from "../../lib/api";
import {
  Badge,
  date,
  Empty,
  ErrorMessage,
  Loading,
  PageHeader,
  Pagination,
} from "../../components/UI";
import type { Balance, Movement, Named, Page } from "../../types";
export function Inventory() {
  const scope = useScope();
  const [params, setParams] = useSearchParams();
  const movements = params.get("tab") === "movements";
  const [search, setSearch] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [page, setPage] = useState(1);
  const locations = useQuery({
    queryKey: [scope, "warehouses-all"],
    queryFn: () => all<Named>("warehouses/"),
  });
  const query = useQuery({
    queryKey: [scope, "inventory", movements, search, warehouse, page],
    queryFn: () =>
      api<Page<Balance & Movement>>(
        `inventory/${movements ? "movements" : "balances"}/?search=${encodeURIComponent(search)}&location__warehouse=${warehouse}&page=${page}`,
      ),
  });
  return (
    <>
      <PageHeader
        eyebrow="INVENTORY CONTROL"
        title={movements ? "Movement ledger" : "Stock on hand"}
        description={
          movements
            ? "Every posted change, with a person, a place, and a reason."
            : "Live quantities across warehouses and storage locations."
        }
      />
      <div className="tabs">
        <button
          className={!movements ? "active" : ""}
          onClick={() => {
            setParams({});
            setPage(1);
          }}
        >
          Stock on hand
        </button>
        <button
          className={movements ? "active" : ""}
          onClick={() => {
            setParams({ tab: "movements" });
            setPage(1);
          }}
        >
          Movement ledger
        </button>
      </div>
      <section className="panel">
        <div className="toolbar">
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Search inventory"
              placeholder="Search product or SKU..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            aria-label="Filter by warehouse"
            value={warehouse}
            onChange={(e) => {
              setWarehouse(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All warehouses</option>
            {locations.data?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <ErrorMessage error={query.error || locations.error} />
        {query.isPending ? (
          <Loading />
        ) : !query.data?.results.length ? (
          <Empty />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Warehouse / bin</th>
                  {movements ? (
                    <>
                      <th>Type</th>
                      <th>Change</th>
                      <th>After</th>
                      <th>Posted by</th>
                      <th>Date</th>
                    </>
                  ) : (
                    <>
                      <th>On hand</th>
                      <th>Unit</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {query.data.results.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.product_name}</strong>
                      <small>{row.sku}</small>
                    </td>
                    <td>
                      {row.warehouse_name}
                      <small>{row.location_code}</small>
                    </td>
                    {movements ? (
                      <>
                        <td>
                          <Badge>{row.type}</Badge>
                        </td>
                        <td
                          className={
                            row.delta_quantity > 0 ? "positive" : "negative"
                          }
                        >
                          {row.delta_quantity > 0 ? "+" : ""}
                          {row.delta_quantity}
                        </td>
                        <td>{row.quantity_after}</td>
                        <td>{row.actor_name}</td>
                        <td>
                          {date(row.created_at)}
                          <small>{row.document_no}</small>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <strong>{row.on_hand}</strong>
                        </td>
                        <td>{row.unit_code}</td>
                      </>
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
      <p className="form-note">
        Balances show bins with recorded stock activity. Reports include active
        products with zero stock.
      </p>
    </>
  );
}
