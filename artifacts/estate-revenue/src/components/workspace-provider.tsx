import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListCrmWorkspacesQueryKey,
  setWorkspaceIdGetter,
  useListCrmWorkspaces,
  type CrmWorkspace,
} from "@workspace/api-client-react";

const STORAGE_KEY = "estate-revenue-workspace-id";
setWorkspaceIdGetter(() =>
  typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY),
);

type WorkspaceContextValue = {
  workspaces: CrmWorkspace[];
  currentWorkspace: CrmWorkspace | null;
  selectWorkspace: (workspaceId: number) => Promise<void>;
  canManageWorkspace: boolean;
  canWriteWorkspace: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function storedWorkspaceId(): number | null {
  if (typeof window === "undefined") return null;
  const id = Number(window.localStorage.getItem(STORAGE_KEY));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const workspacesQuery = useListCrmWorkspaces({
    query: {
      queryKey: getListCrmWorkspacesQueryKey(),
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  });
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(storedWorkspaceId);
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const lastWorkspaceId = useRef<number | null>(null);
  const workspaces = workspacesQuery.data?.workspaces ?? [];
  const currentWorkspace =
    workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ??
    (switchingWorkspace
      ? undefined
      : workspaces.find(
          (workspace) => workspace.id === workspacesQuery.data?.currentWorkspaceId,
        )) ??
    null;

  useEffect(() => {
    if (switchingWorkspace || !currentWorkspace || currentWorkspace.id === selectedWorkspaceId) return;
    setSelectedWorkspaceId(currentWorkspace.id);
    window.localStorage.setItem(STORAGE_KEY, String(currentWorkspace.id));
  }, [currentWorkspace, selectedWorkspaceId, switchingWorkspace]);

  useEffect(() => {
    if (!currentWorkspace) return;
    if (
      !switchingWorkspace &&
      lastWorkspaceId.current !== null &&
      lastWorkspaceId.current !== currentWorkspace.id
    ) {
      lastWorkspaceId.current = currentWorkspace.id;
      void (async () => {
        await queryClient.cancelQueries();
        queryClient.clear();
        await workspacesQuery.refetch();
      })();
      return;
    }
    lastWorkspaceId.current = currentWorkspace.id;
  }, [currentWorkspace, queryClient, switchingWorkspace, workspacesQuery.refetch]);

  const selectWorkspace = useCallback(
    async (workspaceId: number) => {
      if (!Number.isSafeInteger(workspaceId) || workspaceId <= 0) return;
      window.localStorage.setItem(STORAGE_KEY, String(workspaceId));
      setSelectedWorkspaceId(workspaceId);
      lastWorkspaceId.current = workspaceId;
      setSwitchingWorkspace(true);
      try {
        await queryClient.cancelQueries();
        queryClient.clear();
        await workspacesQuery.refetch();
      } finally {
        setSwitchingWorkspace(false);
      }
    },
    [queryClient, workspacesQuery.refetch],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      currentWorkspace,
      selectWorkspace,
      canManageWorkspace:
        currentWorkspace?.role === "owner" || currentWorkspace?.role === "admin",
      canWriteWorkspace:
        currentWorkspace?.role === "owner" ||
        currentWorkspace?.role === "admin" ||
        currentWorkspace?.role === "agent",
    }),
    [currentWorkspace, selectWorkspace, workspaces],
  );

  if (switchingWorkspace || workspacesQuery.isLoading || !workspacesQuery.data) {
    if (workspacesQuery.error) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="max-w-md rounded-sm border border-border bg-card p-6 text-center">
            <h1 className="font-display text-lg font-bold">Workspace unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We could not load your workspace memberships.
            </p>
            <button
              className="mt-4 rounded-sm bg-foreground px-4 py-2 text-sm text-background"
              onClick={() => void workspacesQuery.refetch()}
            >
              Try again
            </button>
          </div>
        </main>
      );
    }
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading workspace…
      </main>
    );
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}