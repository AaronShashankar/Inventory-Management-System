import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useScope } from "../../app/Auth";
import { all, api, downloadStock } from "../../lib/api";
import {
  Badge,
  Empty,
  ErrorMessage,
  Loading,
  PageHeader,
  Pagination,
} from "../../components/UI";
import type { Named, Page, StockRow } from "../../types";
export function Reports() {
  const scope = useScope();
  const [warehouse, setWarehouse] = useState("");
  const [low, setLow] = useState(false);
  const [page, setPage] = useState(1);
  const [exportError, setExportError] = useState<unknown>();
  const warehouses = useQuery({
    queryKey: [scope, "warehouses-all"],
    queryFn: () => all<Named>("warehouses/"),
  });
  const query = useQuery({
    queryKey: [scope, "reports", warehouse, low, page],
    queryFn: () =>
      api<Page<StockRow>>(
        `reports/${low ? "low-stock" : "stock-on-hand"}/?warehouse=${warehouse}&page=${page}`,
      ),
  });
  return (
    <>
      <PageHeader
        eyebrow="BUSINESS INSIGHTS"
        title="Inventory reports"
        description="Reconciled quantities, including active products with no recorded stock."
        action={
          <button
            className="button primary"
            onClick={() => void downloadStock(warehouse).catch(setExportError)}
          >
            <Download size={17} /> Export stock CSV
          </button>
        }
      />
      <div className="tabs">
        <button
          className={!low ? "active" : ""}
          onClick={() => {
            setLow(false);
            setPage(1);
          }}
        >
          Stock on hand
        </button>
        <button
          className={low ? "active" : ""}
          onClick={() => {
            setLow(true);
            setPage(1);
          }}
        >
          Low stock
        </button>
      </div>
      <section className="panel">
        <div className="toolbar">
          <span className="subtle-label">
            {warehouse ? "Selected warehouse" : "Companywide"} thresholds
          </span>
          <select
            aria-label="Report warehouse"
            value={warehouse}
            onChange={(e) => {
              setWarehouse(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All warehouses</option>
            {warehouses.data?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <ErrorMessage error={query.error || warehouses.error || exportError} />
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
                  <th>On hand</th>
                  <th>Unit</th>
                  <th>Reorder threshold</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {query.data.results.map((r) => (
                  <tr key={r.product}>
                    <td>
                      <strong>{r.name}</strong>
                      <small>{r.sku}</small>
                    </td>
                    <td>{r.on_hand}</td>
                    <td>{r.unit}</td>
                    <td>{r.reorder_level}</td>
                    <td>
                      <Badge>{r.low_stock ? "Low stock" : "Healthy"}</Badge>
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
      <p className="form-note">
        Export includes all active products in the selected warehouse scope.
        Quantities are not financial valuations; units across different products
        are not added into a money metric.
      </p>
    </>
  );
}
