export type Role = "ADMIN" | "MANAGER" | "STAFF" | "VIEWER";
export interface Membership {
  organization: string;
  name: string;
  currency: string;
  role: Role;
}
export interface User {
  id: string;
  username: string;
  email: string;
  memberships: Membership[];
}
export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  barcode: string;
  category: string | null;
  category_name: string;
  unit: string;
  unit_code: string;
  reorder_level: number;
  default_purchase_price: string;
  is_active: boolean;
}
export interface Named {
  id: string;
  name: string;
  code?: string;
  warehouse?: string;
  warehouse_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  is_active?: boolean;
}
export interface Balance {
  location: string;
  id: string;
  product: string;
  sku: string;
  product_name: string;
  warehouse_name: string;
  location_code: string;
  on_hand: number;
  unit_code: string;
  reorder_level: number;
}
export interface Movement {
  id: string;
  sku: string;
  product_name: string;
  warehouse_name: string;
  location_code: string;
  document_no: string;
  type: string;
  delta_quantity: number;
  quantity_after: number;
  actor_name: string;
  created_at: string;
}
export interface StockLine {
  id?: number;
  product: string;
  product_name?: string;
  quantity: number;
  unit_cost?: string | null;
  adjustment_direction?: string;
}
export interface StockDocument {
  receipt_id: string | null;
  id: string;
  document_no: string;
  type: string;
  status: string;
  source_location: string | null;
  destination_location: string | null;
  reason: string;
  reference: string;
  lines: StockLine[];
  created_at: string;
}
export interface OrderLine {
  id?: number;
  product: string;
  product_name?: string;
  ordered_qty: number;
  unit_price: string;
  received_qty?: number;
}
export interface Order {
  id: string;
  po_number: string;
  supplier: string;
  supplier_name: string;
  status: string;
  total: string;
  expected_date: string | null;
  lines: OrderLine[];
  created_at: string;
}
export interface Receipt {
  lines: StockLine[];
  location: string;
  warehouse: string;
  id: string;
  receipt_number: string;
  po_number: string;
  status: string;
  stock_document: string;
}
export interface StockRow {
  product: string;
  sku: string;
  name: string;
  unit: string;
  on_hand: number;
  reorder_level: number;
  low_stock: boolean;
}
export interface Dashboard {
  active_skus: number;
  low_stock_count: number;
  open_purchase_orders: number;
  movements_today: number;
  low_stock: StockRow[];
  recent_movements: Movement[];
  activity: {
    day: string;
    document__type: string;
    quantity: number;
    movements: number;
  }[];
}
