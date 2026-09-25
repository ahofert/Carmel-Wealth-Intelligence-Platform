export type CrmWorkspaceRole = "owner" | "admin" | "agent" | "viewer";
export type CrmWorkspaceCapability = "read" | "write" | "manage";

export type WorkspaceMembershipIdentity = {
  userId: string;
  workspaceId: number;
};

export type WorkspaceMembershipAuthorization = WorkspaceMembershipIdentity & {
  role: CrmWorkspaceRole | string;
};

export function isWorkspaceMember(
  membership: WorkspaceMembershipIdentity | null | undefined,
  userId: string,
  workspaceId: number,
): boolean {
  return Boolean(
    membership &&
      membership.userId === userId &&
      membership.workspaceId === workspaceId,
  );
}

export function canAccessWorkspace(
  role: CrmWorkspaceRole | string | null | undefined,
  capability: CrmWorkspaceCapability,
): boolean {
  if (capability === "read") {
    return role === "owner" || role === "admin" || role === "agent" || role === "viewer";
  }
  if (capability === "write") {
    return role === "owner" || role === "admin" || role === "agent";
  }
  return role === "owner" || role === "admin";
}

export function canAccessWorkspaceMembership(
  membership: WorkspaceMembershipAuthorization | null | undefined,
  userId: string,
  workspaceId: number,
  capability: CrmWorkspaceCapability,
): boolean {
  return Boolean(
    membership &&
      isWorkspaceMember(membership, userId, workspaceId) &&
      canAccessWorkspace(membership.role, capability),
  );
}