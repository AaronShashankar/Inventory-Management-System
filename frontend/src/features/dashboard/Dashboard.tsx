import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  ClipboardList,
  Layers,
  TriangleAlert,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../lib/api";
import { useAuth, useScope } from "../../app/Auth";
import {
  Badge,
  Empty,
  ErrorMessage,
  Loading,
  PageHeader,
} from "../../components/UI";
import type { Dashboard as Summary } from "../../types";
export function Dashboard() {
  const scope = useScope();
  const { membership } = useAuth();
  const { data, isPending, error } = useQuery({
    queryKey: [scope, "dashboard"],
    queryFn: () => api<Summary>("dashboard/summary/"),
  });
  if (isPending) return <Loading />;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return null;
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - 13 + i);
    const key = date.toISOString().slice(0, 10);
    const items = data.activity.filter((a) => a.day === key);
    return {
      day: date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      received: items
        .filter((a) => a.document__type === "RECEIVE")
        .reduce((s, a) => s + a.movements, 0),
      issued: items
        .filter((a) => a.document__type === "ISSUE")
        .reduce((s, a) => s + a.movements, 0),
    };
  });
  return (
    <>
      <PageHeader
        eyebrow="YOUR BUSINESS AT A GLANCE"
        title="Overview"
        description="A clear picture of your inventory. A better start to your day."
        action={
          membership?.role !== "VIEWER" && (
            <Link className="button primary" to="/app/operations?type=RECEIVE">
              <ArrowDownToLine size={17} /> Receive stock
            </Link>
          )
        }
      />
      <div className="overview-banner">
        <div>
          <span className="status-dot" /> WORKSPACE SNAPSHOT
        </div>
        <span>
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      </div>
      <section className="stats">
        {[
          [
            "Active products",
            data.active_skus,
            Boxes,
            "Across your product catalog",
          ],
          [
            "Low-stock products",
            data.low_stock_count,
            TriangleAlert,
            "At or below reorder threshold",
          ],
          [
            "Open purchase orders",
            data.open_purchase_orders,
            ClipboardList,
            "Awaiting goods from suppliers",
          ],
          [
            "Movements today",
            data.movements_today,
            Layers,
            "Posted ledger entries / UTC",
          ],
        ].map(([label, value, Icon, note], i) => {
          const I = Icon as typeof Boxes;
          return (
            <div
              className={`stat ${i === 1 ? "warning-stat" : ""}`}
              key={String(label)}
            >
              <div>
                <span>{String(label)}</span>
                <I size={19} />
              </div>
              <strong>{String(value).padStart(2, "0")}</strong>
              <small>{String(note)}</small>
            </div>
          );
        })}
      </section>
      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Stock activity</h2>
              <p>Receipt and issue entries over the last 14 days</p>
            </div>
            <span className="subtle-label">UTC</span>
          </div>
          <div className="chart-legend">
            <span>
              <i /> Receipts
            </span>
            <span>
              <i /> Issues
            </span>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days} barGap={3}>
                <CartesianGrid vertical={false} stroke="#edf0ed" />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "#81908a" }}
                  interval={2}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#81908a" }}
                  width={28}
                />
                <Tooltip cursor={{ fill: "#f5f7f5" }} />
                <Bar dataKey="received" fill="#3e7968" radius={[3, 3, 0, 0]} />
                <Bar dataKey="issued" fill="#c8d8b7" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel attention">
          <div className="panel-heading">
            <div>
              <h2>
                Needs attention{" "}
                <span className="count">{data.low_stock_count}</span>
              </h2>
              <p>Companywide reorder signals</p>
            </div>
            <TriangleAlert size={19} />
          </div>
          {data.low_stock.length ? (
            data.low_stock.slice(0, 4).map((p) => (
              <div className="attention-item" key={p.product}>
                <span className="product-icon">
                  <Boxes size={18} />
                </span>
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    {p.sku} / Reorder at {p.reorder_level}
                  </small>
                </div>
                <span className="stock-warning">{p.on_hand} left</span>
              </div>
            ))
          ) : (
            <Empty
              title="Stock looks healthy"
              text="No products at or below their threshold."
            />
          )}
          <Link
            className="text-link"
            to={
              membership?.role === "STAFF" ? "/app/inventory" : "/app/reports"
            }
          >
            Review inventory <ArrowRight size={15} />
          </Link>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Recent movements</h2>
            <p>The latest changes across your warehouses</p>
          </div>
          <Link className="text-link" to="/app/inventory?tab=movements">
            View all activity <ArrowUpRight size={16} />
          </Link>
        </div>
        {data.recent_movements.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Operation</th>
                  <th>Warehouse</th>
                  <th>Quantity</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_movements.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.product_name}</strong>
                      <small>{m.sku}</small>
                    </td>
                    <td>
                      <Badge>{m.type}</Badge>
                    </td>
                    <td>
                      {m.warehouse_name}
                      <small>{m.location_code}</small>
                    </td>
                    <td
                      className={m.delta_quantity > 0 ? "positive" : "negative"}
                    >
                      {m.delta_quantity > 0 ? "+" : ""}
                      {m.delta_quantity}
                    </td>
                    <td className="mono">{m.document_no}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Your ledger starts here"
            text="Post a receipt to record your first stock movement."
          />
        )}
      </section>
      <div className="integrity-note">
        <ShieldIcon /> Your dashboard reflects posted movements. Drafts never
        change stock.
      </div>
    </>
  );
}
function ShieldIcon() {
  return <span className="status-dot" />;
}
