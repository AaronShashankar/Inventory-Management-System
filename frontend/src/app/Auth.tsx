import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, send, setOrganization } from "../lib/api";
import type { Membership, User } from "../types";
interface Auth {
  user: User | undefined;
  membership: Membership | undefined;
  loading: boolean;
  refresh: () => Promise<unknown>;
  switchOrg: (id: string) => void;
  logout: () => Promise<void>;
}
const Context = createContext<Auth>(null!);
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState("");
  const query = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("auth/me/"),
    retry: false,
  });
  const membership =
    query.data?.memberships.find((m) => m.organization === selected) ||
    query.data?.memberships[0];
  setOrganization(membership?.organization || "");
  return (
    <Context.Provider
      value={{
        user: query.data,
        membership,
        loading: query.isPending,
        refresh: () => query.refetch(),
        switchOrg: (id) => {
          client.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
          setSelected(id);
        },
        logout: async () => {
          await send("auth/logout/", {});
          setOrganization("");
          client.clear();
          window.location.assign("/login");
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
export const useScope = () => useAuth().membership?.organization;
