import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useAuth, useScope } from "../../app/Auth";
import { api, send } from "../../lib/api";
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
import type { Page, Role } from "../../types";
interface Audit {
  id: string;
  action: string;
  actor_name: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
}
interface Member {
  id: number;
  email: string;
  name: string;
  role: Role;
  is_active: boolean;
}
export function AuditLog() {
  const scope = useScope();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [scope, "audit", page],
    queryFn: () => api<Page<Audit>>(`audit-events/?page=${page}`),
  });
  return (
    <>
      <PageHeader
        eyebrow="ACCOUNTABILITY"
        title="Audit trail"
        description="A chronological record of sensitive workspace actions."
      />
      <section className="panel">
        <ErrorMessage error={query.error} />
        {query.isPending ? (
          <Loading />
        ) : !query.data?.results.length ? (
          <Empty />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Entity</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {query.data.results.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Badge>{e.action}</Badge>
                    </td>
                    <td>{e.actor_name}</td>
                    <td>
                      {e.entity_type}
                      <small className="mono">{e.entity_id}</small>
                    </td>
                    <td>{date(e.created_at)}</td>
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
    </>
  );
}
export function Team() {
  const scope = useScope();
  const client = useQueryClient();
  const [invite, setInvite] = useState(false);
  const [editing, setEditing] = useState<Member>();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [scope, "members", page],
    queryFn: () => api<Page<Member>>(`members/?page=${page}`),
  });
  const mutation = useMutation({
    mutationFn: (data: unknown) =>
      send(
        editing ? `members/${editing.id}/` : "members/invite/",
        data,
        editing ? "PATCH" : "POST",
      ),
    onSuccess: () => {
      setInvite(false);
      setEditing(undefined);
      void client.invalidateQueries({ queryKey: [scope, "members"] });
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    mutation.mutate(
      editing ? { role: data.role, is_active: data.is_active === "on" } : data,
    );
  }
  return (
    <>
      <PageHeader
        eyebrow="WORKSPACE SETTINGS"
        title="Team & access"
        description="Give each person the access they need. Keep at least one active administrator."
        action={
          <button className="button primary" onClick={() => setInvite(true)}>
            <Plus size={17} /> Invite teammate
          </button>
        }
      />
      <section className="panel">
        <ErrorMessage error={query.error} />
        {query.isPending ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {query.data?.results.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.name}</strong>
                      <small>{m.email}</small>
                    </td>
                    <td>
                      <Badge>{m.role}</Badge>
                    </td>
                    <td>
                      <Badge>{m.is_active ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td>
                      <button
                        className="button secondary"
                        onClick={() => setEditing(m)}
                      >
                        Manage access
                      </button>
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
      {(invite || editing) && (
        <Modal
          title={editing ? "Manage access" : "Invite teammate"}
          onClose={() => {
            setInvite(false);
            setEditing(undefined);
          }}
        >
          <form onSubmit={submit}>
            {!editing && (
              <label>
                Email
                <input name="email" type="email" required />
              </label>
            )}
            <label>
              Role
              <select name="role" defaultValue={editing?.role || "STAFF"}>
                {["ADMIN", "MANAGER", "STAFF", "VIEWER"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            {editing && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={editing.is_active}
                />{" "}
                Active membership
              </label>
            )}
            <p className="form-note">
              Managers maintain catalog and adjustments. Staff handle receiving,
              issues, and transfers. Viewers have read-only access.
            </p>
            <ErrorMessage error={mutation.error} />
            <div className="form-actions">
              <button className="button primary" disabled={mutation.isPending}>
                {editing ? "Save access" : "Send invitation"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function OrganizationSettings() {
  const scope = useScope();
  const { refresh } = useAuth();
  const query = useQuery({
    queryKey: [scope, "organization"],
    queryFn: () =>
      api<{ name: string; base_currency: string }>("organization/"),
  });
  const mutation = useMutation({
    mutationFn: (data: unknown) => send("organization/", data, "PATCH"),
    onSuccess: () => {
      void query.refetch();
      void refresh();
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate(Object.fromEntries(new FormData(event.currentTarget)));
  }
  return (
    <>
      <PageHeader
        eyebrow="ADMINISTRATION"
        title="Organization settings"
        description="Workspace identity and the currency used for reference purchase amounts."
      />
      <section className="panel settings-panel">
        <ErrorMessage error={query.error || mutation.error} />
        {query.isPending ? (
          <Loading />
        ) : (
          query.data && (
            <form onSubmit={submit}>
              <label>
                Organization name
                <input
                  name="name"
                  required
                  maxLength={160}
                  defaultValue={query.data.name}
                />
              </label>
              <label>
                Base currency
                <input
                  name="base_currency"
                  pattern="[A-Z]{3}"
                  maxLength={3}
                  required
                  defaultValue={query.data.base_currency}
                />
              </label>
              <p className="form-note">
                Use a three-letter ISO currency code. Currency changes are
                blocked after products exist, to prevent reinterpreting stored
                reference prices.
              </p>
              {mutation.isSuccess && (
                <p className="success" role="status">
                  Organization settings saved.
                </p>
              )}
              <button className="button primary" disabled={mutation.isPending}>
                Save settings
              </button>
            </form>
          )
        )}
      </section>
    </>
  );
}
