import { NavLink, Outlet } from "react-router-dom";
import {
  ArrowDownToLine,
  Boxes,
  ChartNoAxesCombined,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  PanelLeftClose,
  Settings,
  ShieldCheck,
  Truck,
  Warehouse,
} from "lucide-react";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "../app/Auth";
export function Layout() {
  const { user, membership, logout, switchOrg } = useAuth();
  const [open, setOpen] = useState(false);
  const role = membership?.role;
  const report = role !== "STAFF";
  const links: [string, string, LucideIcon][] = [
    ["/app/dashboard", "Overview", LayoutDashboard],
    ["/app/products", "Products", Package],
    ["/app/inventory", "Stock on hand", Boxes],
    ["/app/operations", "Stock operations", ArrowDownToLine],
    ["/app/purchasing", "Purchase orders", ClipboardList],
    ["/app/suppliers", "Suppliers", Truck],
    ["/app/warehouses", "Warehouses", Warehouse],
    ...(report
      ? [
          ["/app/reports", "Reports", ChartNoAxesCombined],
          ["/app/audit", "Audit trail", ShieldCheck],
        ]
      : []),
    ...(role === "ADMIN"
      ? [
          ["/app/team", "Team & access", Settings],
          ["/app/organization", "Organization", Settings],
        ]
      : []),
  ] as [string, string, LucideIcon][];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <NavLink to="/app/dashboard" className="brand">
          <span className="brand-icon">
            <Boxes size={24} />
          </span>
          stockroom<span className="brand-dot">.</span>
        </NavLink>
        <div className="workspace-switch">
          <span className="workspace-avatar">
            {membership?.name.slice(0, 1)}
          </span>
          <div>
            <strong>{membership?.name}</strong>
            <small>Inventory workspace</small>
          </div>
        </div>
        {(user?.memberships.length || 0) > 1 && (
          <select
            aria-label="Organization"
            value={membership?.organization}
            onChange={(e) => switchOrg(e.target.value)}
          >
            {user?.memberships.map((m) => (
              <option key={m.organization} value={m.organization}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        <div className="nav-label">OPERATIONS</div>
        <nav>
          {links.map(([path, label, Icon]) => (
            <NavLink key={path} to={path} onClick={() => setOpen(false)}>
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-status">
            <span /> All movements, accounted for.
          </div>
          <div className="user">
            <span className="user-avatar">
              {user?.username.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{user?.username.split("@")[0]}</strong>
              <small>{role?.toLowerCase()}</small>
            </div>
            <button aria-label="Sign out" onClick={() => void logout()}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="mobile-menu icon-button"
              aria-label="Toggle navigation"
              onClick={() => setOpen(!open)}
            >
              <PanelLeftClose size={20} />
            </button>
            <span className="breadcrumb">
              Workspace <span>/</span> Inventory management
            </span>
          </div>
          <span className="environment">
            <span /> Live workspace
          </span>
        </header>
        <main>
          <Outlet />
        </main>
        <footer>
          STOCKROOM <span>Built for a clearer view of your inventory.</span>
          <span>{membership?.currency} / Whole-unit inventory</span>
        </footer>
      </div>
    </div>
  );
}
