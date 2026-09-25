import { and, eq, isNull } from "drizzle-orm";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  crmActivitiesTable,
  crmAppointmentsTable,
  crmAutomationsTable,
  crmLeadsTable,
  crmWorkspaceMembershipsTable,
  crmWorkspacesTable,
  db,
} from "@workspace/db";
import { getAuth } from "@clerk/express";
import {
  canAccessWorkspace,
  canAccessWorkspaceMembership,
  type CrmWorkspaceCapability,
  type CrmWorkspaceRole,
} from "./workspace-access";

export type CrmWorkspaceContext = {
  userId: string;
  workspaceId: number;
  workspaceName: string;
  role: CrmWorkspaceRole;
};

type WorkspaceResponse = Response & {
  locals: Response["locals"] & { crmWorkspace?: CrmWorkspaceContext };
};

export async function ensurePersonalWorkspace(userId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(crmWorkspacesTable)
      .values({
        name: "Personal workspace",
        kind: "personal",
        personalOwnerId: userId,
      })
      .onConflictDoNothing({ target: crmWorkspacesTable.personalOwnerId })
      .returning({ id: crmWorkspacesTable.id });

    const [existing] = created
      ? [created]
      : await tx
          .select({ id: crmWorkspacesTable.id })
          .from(crmWorkspacesTable)
          .where(eq(crmWorkspacesTable.personalOwnerId, userId))
          .limit(1);

    if (!existing) throw new Error("Could not create a personal workspace");

    await tx
      .insert(crmWorkspaceMembershipsTable)
      .values({ workspaceId: existing.id, userId, role: "owner" })
      .onConflictDoNothing();

    await tx
      .update(crmLeadsTable)
      .set({ workspaceId: existing.id })
      .where(
        and(
          eq(crmLeadsTable.ownerId, userId),
          isNull(crmLeadsTable.workspaceId),
        ),
      );
    await tx
      .update(crmActivitiesTable)
      .set({ workspaceId: existing.id })
      .where(
        and(
          eq(crmActivitiesTable.ownerId, userId),
          isNull(crmActivitiesTable.workspaceId),
        ),
      );
    await tx
      .update(crmAppointmentsTable)
      .set({ workspaceId: existing.id })
      .where(
        and(
          eq(crmAppointmentsTable.ownerId, userId),
          isNull(crmAppointmentsTable.workspaceId),
        ),
      );
    await tx
      .update(crmAutomationsTable)
      .set({ workspaceId: existing.id })
      .where(
        and(
          eq(crmAutomationsTable.ownerId, userId),
          isNull(crmAutomationsTable.workspaceId),
        ),
      );

    return existing.id;
  });
}

export function crmWorkspaceContext(res: Response): CrmWorkspaceContext {
  const context = (res as WorkspaceResponse).locals.crmWorkspace;
  if (!context) throw new Error("CRM workspace context is missing");
  return context;
}

export const requireCrmWorkspaceContext: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const personalWorkspaceId = await ensurePersonalWorkspace(userId);
  const rawWorkspaceId = req.get("x-workspace-id");
  const requestedWorkspaceId = rawWorkspaceId === undefined
    ? personalWorkspaceId
    : Number(rawWorkspaceId);
  if (!Number.isSafeInteger(requestedWorkspaceId) || requestedWorkspaceId <= 0) {
    res.status(400).json({ error: "Invalid workspace selection" });
    return;
  }

  const [membership] = await db
    .select({
      id: crmWorkspaceMembershipsTable.id,
      userId: crmWorkspaceMembershipsTable.userId,
      workspaceId: crmWorkspaceMembershipsTable.workspaceId,
      role: crmWorkspaceMembershipsTable.role,
      name: crmWorkspacesTable.name,
    })
    .from(crmWorkspaceMembershipsTable)
    .innerJoin(
      crmWorkspacesTable,
      eq(crmWorkspaceMembershipsTable.workspaceId, crmWorkspacesTable.id),
    )
    .where(
      and(
        eq(crmWorkspaceMembershipsTable.userId, userId),
        eq(crmWorkspaceMembershipsTable.workspaceId, requestedWorkspaceId),
      ),
    )
    .limit(1);

  if (!canAccessWorkspaceMembership(membership, userId, requestedWorkspaceId, "read")) {
    res.status(403).json({ error: "You are not a member of this workspace" });
    return;
  }

  (res as WorkspaceResponse).locals.crmWorkspace = {
    userId,
    workspaceId: membership.workspaceId,
    workspaceName: membership.name,
    role: membership.role as CrmWorkspaceRole,
  };
  next();
};

export function requireCrmWorkspaceCapability(
  capability: CrmWorkspaceCapability,
): RequestHandler {
  return (_req, res, next): void => {
    const context = crmWorkspaceContext(res);
    if (!canAccessWorkspace(context.role, capability)) {
      res.status(403).json({ error: `Workspace ${capability} permission required` });
      return;
    }
    next();
  };
}