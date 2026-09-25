import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListCrmWorkspaceMembersQueryKey,
  useAcceptCrmWorkspaceInvitation,
  useCreateCrmWorkspace,
  useInviteCrmWorkspaceMember,
  useListCrmWorkspaceMembers,
  useRemoveCrmWorkspaceMember,
  useUpdateCrmWorkspaceMember,
} from "@workspace/api-client-react";
import { useWorkspace } from "./workspace-provider";

type AssignableRole = "admin" | "agent" | "viewer";

const fieldClass =
  "h-10 min-w-0 rounded-sm border border-input bg-background px-3 text-xs";
const buttonClass =
  "inline-flex items-center justify-center rounded-sm bg-foreground px-4 py-2.5 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-sm border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-secondary disabled:opacity-50";

export function WorkspaceSettingsContent() {
  const {
    currentWorkspace,
    canManageWorkspace,
    selectWorkspace,
  } = useWorkspace();
  const queryClient = useQueryClient();
  const workspaceId = currentWorkspace?.id ?? 0;
  const members = useListCrmWorkspaceMembers(workspaceId, {
    query: {
      queryKey: getListCrmWorkspaceMembersQueryKey(workspaceId),
      enabled: Boolean(currentWorkspace),
    },
  });
  const createWorkspace = useCreateCrmWorkspace();
  const inviteMember = useInviteCrmWorkspaceMember();
  const updateMember = useUpdateCrmWorkspaceMember();
  const removeMember = useRemoveCrmWorkspaceMember();
  const acceptInvitation = useAcceptCrmWorkspaceInvitation();
  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AssignableRole>("agent");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");

  const refreshMembers = (id = workspaceId) => {
    void queryClient.invalidateQueries({
      queryKey: getListCrmWorkspaceMembersQueryKey(id),
    });
  };

  const create = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    createWorkspace.mutate(
      { data: { name: workspaceName.trim() } },
      {
        onSuccess: (workspace) => {
          setWorkspaceName("");
          void selectWorkspace(workspace.id);
        },
        onError: (error) => setMessage(error.message),
      },
    );
  };

  const invite = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setInviteCode(null);
    inviteMember.mutate(
      { workspaceId, data: { email: inviteEmail.trim(), role: inviteRole } },
      {
        onSuccess: (result) => {
          setInviteCode(result.code);
          setInviteEmail("");
          setMessage(
            `Invitation email sent to ${result.email}. It expires ${new Date(result.expiresAt).toLocaleString()}.`,
          );
        },
        onError: (error) => setMessage(error.message),
      },
    );
  };

  const accept = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    acceptInvitation.mutate(
      { data: { code: joinCode.trim() } },
      {
        onSuccess: (workspace) => {
          setJoinCode("");
          void selectWorkspace(workspace.id);
        },
        onError: (error) => setMessage(error.message),
      },
    );
  };

  const changeRole = (membershipId: number, role: AssignableRole) => {
    updateMember.mutate(
      { workspaceId, membershipId, data: { role } },
      {
        onSuccess: () => refreshMembers(),
        onError: (error) => setMessage(error.message),
      },
    );
  };

  const remove = (membershipId: number, email: string | null) => {
    if (!window.confirm(`Remove ${email ?? "this member"} from ${currentWorkspace?.name}?`)) return;
    removeMember.mutate(
      { workspaceId, membershipId },
      {
        onSuccess: () => refreshMembers(),
        onError: (error) => setMessage(error.message),
      },
    );
  };

  return (
    <div className="min-h-[calc(100dvh-76px)] px-5 py-8 md:px-9 md:py-10">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-8 flex flex-col justify-between gap-4 border-b border-border pb-6 md:flex-row md:items-end">
          <div>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Agency / access</div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Workspace & members</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Choose the agency pipeline you are working in, invite agents, and manage their access.</p>
          </div>
        </div>

        {message && (
          <div className="mb-5 rounded-sm border border-border bg-card p-3 text-xs" role="status">
            {message}
          </div>
        )}

        <section className="mb-5 rounded-sm border border-border bg-card p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Selected workspace</div>
              <h2 className="mt-1 font-display text-xl font-bold">{currentWorkspace?.name}</h2>
              <p className="mt-1 text-xs capitalize text-muted-foreground">
                {currentWorkspace?.kind} · {currentWorkspace?.role} · {currentWorkspace?.memberCount} members
              </p>
            </div>
            <div className="rounded-sm bg-secondary px-3 py-2 text-xs text-muted-foreground">
              {currentWorkspace?.role === "viewer" ? "View-only access" : "Lead and activity access enabled"}
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-sm border border-border bg-card p-5 md:p-6">
            <div className="mb-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-accent">New agency</div>
              <h2 className="mt-1 font-display text-lg font-bold">Create a shared workspace</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Your existing personal leads stay private. New agency work starts in its own shared pipeline.</p>
            </div>
            <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
              <input
                required
                minLength={2}
                maxLength={80}
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="Agency name"
                className={`flex-1 ${fieldClass}`}
                data-testid="input-agency-name"
              />
              <button type="submit" className={buttonClass} disabled={createWorkspace.isPending} data-testid="button-create-agency">
                {createWorkspace.isPending ? "Creating…" : "Create workspace"}
              </button>
            </form>
          </section>

          <section className="rounded-sm border border-border bg-card p-5 md:p-6">
            <div className="mb-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-accent">Join agency</div>
              <h2 className="mt-1 font-display text-lg font-bold">Accept an invitation</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Use the code while signed in with the verified email address the invite was sent to.</p>
            </div>
            <form onSubmit={accept} className="flex flex-col gap-2 sm:flex-row">
              <input
                required
                minLength={20}
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="Paste invitation code"
                className={`flex-1 ${fieldClass}`}
                data-testid="input-workspace-invitation-code"
              />
              <button type="submit" className={buttonClass} disabled={acceptInvitation.isPending} data-testid="button-accept-invitation">
                {acceptInvitation.isPending ? "Joining…" : "Join workspace"}
              </button>
            </form>
          </section>
        </div>

        <section className="mt-5 rounded-sm border border-border bg-card p-5 md:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Current workspace</div>
              <h2 className="mt-1 font-display text-lg font-bold">Members & roles</h2>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">{members.data?.length ?? 0} members</span>
          </div>
          {members.isLoading ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Loading members…</p>
          ) : members.error ? (
            <div className="flex items-center justify-between rounded-sm border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive">
              Could not load members.
              <button className={secondaryButtonClass} onClick={() => void members.refetch()}>Retry</button>
            </div>
          ) : members.data?.length ? (
            <div className="divide-y divide-border">
              {members.data.map((member) => (
                <div key={member.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0" data-testid={`workspace-member-${member.id}`}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e9efd4] font-mono text-[10px] text-accent">
                    {(member.email ?? member.userId).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">{member.email ?? member.userId}{member.isCurrentUser ? " · You" : ""}</div>
                    <div className="font-mono text-[9px] uppercase text-muted-foreground">{member.role}</div>
                  </div>
                  {canManageWorkspace && member.role !== "owner" && (
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Role for ${member.email ?? member.userId}`}
                        value={member.role}
                        disabled={updateMember.isPending || (currentWorkspace?.role !== "owner" && member.role === "admin")}
                        onChange={(event) => changeRole(member.id, event.target.value as AssignableRole)}
                        className="h-9 rounded-sm border border-input bg-background px-2 text-xs"
                        data-testid={`select-member-role-${member.id}`}
                      >
                        <option value="admin">Admin</option>
                        <option value="agent">Agent</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        className={secondaryButtonClass}
                        onClick={() => remove(member.id, member.email)}
                        disabled={removeMember.isPending}
                        data-testid={`button-remove-member-${member.id}`}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">No members found.</p>
          )}
        </section>

        {canManageWorkspace && currentWorkspace?.kind === "agency" && (
          <section className="mt-5 rounded-sm border border-border bg-card p-5 md:p-6">
            <div className="mb-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-accent">Invite agent</div>
              <h2 className="mt-1 font-display text-lg font-bold">Add a teammate</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">We’ll email a one-time code to this address. It expires in seven days, and the teammate must accept while signed in with this verified email.</p>
            </div>
            <form onSubmit={invite} className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
              <input
                required
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="agent@example.com"
                className={fieldClass}
                data-testid="input-invite-email"
              />
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as AssignableRole)}
                className={fieldClass}
                data-testid="select-invite-role"
              >
                <option value="admin">Admin</option>
                <option value="agent">Agent</option>
                <option value="viewer">Viewer</option>
              </select>
              <button type="submit" className={buttonClass} disabled={inviteMember.isPending} data-testid="button-invite-member">
                {inviteMember.isPending ? "Sending…" : "Send invitation"}
              </button>
            </form>
            {inviteCode && (
              <div className="mt-4 rounded-sm border border-primary/40 bg-[#f3f6e6] p-3" data-testid="panel-invitation-code">
                <label className="block font-mono text-[9px] uppercase tracking-wider text-muted-foreground">One-time code (optional backup)</label>
                <div className="mt-2 flex gap-2">
                  <input readOnly value={inviteCode} className={`flex-1 font-mono ${fieldClass}`} />
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => void navigator.clipboard.writeText(inviteCode)}
                    data-testid="button-copy-invitation-code"
                  >
                    Copy code
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}