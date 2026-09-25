import { createHash, randomBytes } from "node:crypto";
import { clerkClient, getAuth } from "@clerk/express";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  AcceptCrmWorkspaceInvitationBody,
  AcceptCrmWorkspaceInvitationResponse,
  CreateCrmWorkspaceBody,
  CreateCrmWorkspaceResponse,
  InviteCrmWorkspaceMemberBody,
  InviteCrmWorkspaceMemberParams,
  InviteCrmWorkspaceMemberResponse,
  ListCrmWorkspaceMembersParams,
  ListCrmWorkspaceMembersResponse,
  ListCrmWorkspacesResponse,
  RemoveCrmWorkspaceMemberParams,
  UpdateCrmWorkspaceMemberBody,
  UpdateCrmWorkspaceMemberParams,
  UpdateCrmWorkspaceMemberResponse,
} from "@workspace/api-zod";
import {
  crmWorkspaceInvitationsTable,
  crmWorkspaceMembershipsTable,
  crmWorkspacesTable,
  db,
} from "@workspace/db";
import { ensurePersonalWorkspace } from "../lib/crm-workspaces";
import {
  canAccessWorkspace,
  isWorkspaceMember,
  type CrmWorkspaceRole,
  type WorkspaceMembershipIdentity,
} from "../lib/workspace-access";
import {
  createWorkspaceInvitationEmailSender,
  WorkspaceInvitationEmailConfigurationError,
} from "../lib/workspace-invitation-email";

function currentUserId(req: Request): string | null {
  return getAuth(req).userId;
}

function selectedWorkspaceId(req: Request): number | null {
  const raw = req.get("x-workspace-id");
  if (raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function getWorkspaceMembership(
  database: typeof db,
  userId: string,
  workspaceId: number,
) {
  const [membership] = await database
    .select({
      id: crmWorkspaceMembershipsTable.id,
      userId: crmWorkspaceMembershipsTable.userId,
      workspaceId: crmWorkspaceMembershipsTable.workspaceId,
      email: crmWorkspaceMembershipsTable.email,
      role: crmWorkspaceMembershipsTable.role,
      joinedAt: crmWorkspaceMembershipsTable.joinedAt,
      name: crmWorkspacesTable.name,
      kind: crmWorkspacesTable.kind,
      createdAt: crmWorkspacesTable.createdAt,
    })
    .from(crmWorkspaceMembershipsTable)
    .innerJoin(
      crmWorkspacesTable,
      eq(crmWorkspaceMembershipsTable.workspaceId, crmWorkspacesTable.id),
    )
    .where(
      and(
        eq(crmWorkspaceMembershipsTable.userId, userId),
        eq(crmWorkspaceMembershipsTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return membership;
}

async function memberCount(database: typeof db, workspaceId: number): Promise<number> {
  const [result] = await database
    .select({ value: count() })
    .from(crmWorkspaceMembershipsTable)
    .where(eq(crmWorkspaceMembershipsTable.workspaceId, workspaceId));
  return result?.value ?? 0;
}

function unauthorizedWorkspaceResponse(res: Response): void {
  res.status(403).json({ error: "Workspace membership or permission required" });
}

function isSelectedWorkspace(req: Request, workspaceId: number): boolean {
  const raw = req.get("x-workspace-id");
  return raw === undefined || selectedWorkspaceId(req) === workspaceId;
}

type ClerkUser = Awaited<ReturnType<typeof clerkClient.users.getUser>>;

export type CrmWorkspaceRouterDependencies = {
  database?: typeof db;
  getUserId?: (req: Request) => string | null;
  getClerkUser?: (userId: string) => Promise<ClerkUser>;
  createInvitationEmailSender?: typeof createWorkspaceInvitationEmailSender;
};

export function createCrmWorkspaceRouter(
  dependencies: CrmWorkspaceRouterDependencies = {},
): IRouter {
  const router: IRouter = Router();
  const workspaceDb = dependencies.database ?? db;
  const getRequestUserId = dependencies.getUserId ?? currentUserId;
  const getUser =
    dependencies.getClerkUser ?? ((userId: string) => clerkClient.users.getUser(userId));
  const createInvitationEmailSender =
    dependencies.createInvitationEmailSender ?? createWorkspaceInvitationEmailSender;

router.get("/crm/workspaces", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const personalWorkspaceId = await ensurePersonalWorkspace(userId);
  const rows = await workspaceDb
    .select({
      id: crmWorkspacesTable.id,
      name: crmWorkspacesTable.name,
      kind: crmWorkspacesTable.kind,
      role: crmWorkspaceMembershipsTable.role,
      createdAt: crmWorkspacesTable.createdAt,
    })
    .from(crmWorkspaceMembershipsTable)
    .innerJoin(
      crmWorkspacesTable,
      eq(crmWorkspaceMembershipsTable.workspaceId, crmWorkspacesTable.id),
    )
    .where(eq(crmWorkspaceMembershipsTable.userId, userId))
    .orderBy(crmWorkspacesTable.createdAt);

  const workspaces = await Promise.all(
    rows.map(async (workspace) => ({
      ...workspace,
      role: workspace.role as CrmWorkspaceRole,
      memberCount: await memberCount(workspaceDb, workspace.id),
    })),
  );
  const selectedId = selectedWorkspaceId(req);
  const currentWorkspaceId = workspaces.some((workspace) => workspace.id === selectedId)
    ? selectedId!
    : personalWorkspaceId;
  res.json(
    ListCrmWorkspacesResponse.parse({
      currentWorkspaceId,
      workspaces,
    }),
  );
});

router.post("/crm/workspaces", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = CreateCrmWorkspaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  if (name.length < 2) {
    res.status(400).json({ error: "Workspace name must contain at least two non-space characters" });
    return;
  }
  await ensurePersonalWorkspace(userId);
  const [workspace] = await workspaceDb.transaction(async (tx) => {
    const [created] = await tx
      .insert(crmWorkspacesTable)
      .values({ name, kind: "agency" })
      .returning();
    if (!created) throw new Error("Could not create workspace");
    await tx.insert(crmWorkspaceMembershipsTable).values({
      workspaceId: created.id,
      userId,
      role: "owner",
    });
    return [created];
  });
  res.status(201).json(
    CreateCrmWorkspaceResponse.parse({
      id: workspace!.id,
      name: workspace!.name,
      kind: workspace!.kind,
      role: "owner",
      memberCount: 1,
      createdAt: workspace!.createdAt,
    }),
  );
});

router.get("/crm/workspaces/:workspaceId/members", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  const params = ListCrmWorkspaceMembersParams.safeParse(req.params);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!isSelectedWorkspace(req, params.data.workspaceId)) {
    unauthorizedWorkspaceResponse(res);
    return;
  }
  const requester = await getWorkspaceMembership(workspaceDb, userId, params.data.workspaceId);
  const requesterIdentity: WorkspaceMembershipIdentity | null = requester
    ? { userId: requester.userId, workspaceId: requester.workspaceId }
    : null;
  if (!isWorkspaceMember(requesterIdentity, userId, params.data.workspaceId)) {
    unauthorizedWorkspaceResponse(res);
    return;
  }
  const members = await workspaceDb
    .select({
      id: crmWorkspaceMembershipsTable.id,
      userId: crmWorkspaceMembershipsTable.userId,
      email: crmWorkspaceMembershipsTable.email,
      role: crmWorkspaceMembershipsTable.role,
      joinedAt: crmWorkspaceMembershipsTable.joinedAt,
    })
    .from(crmWorkspaceMembershipsTable)
    .where(eq(crmWorkspaceMembershipsTable.workspaceId, params.data.workspaceId))
    .orderBy(crmWorkspaceMembershipsTable.joinedAt);
  res.json(
    ListCrmWorkspaceMembersResponse.parse(
      members.map((member) => ({
        ...member,
        role: member.role as CrmWorkspaceRole,
        isCurrentUser: member.userId === userId,
      })),
    ),
  );
});

router.post("/crm/workspaces/:workspaceId/members", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  const params = InviteCrmWorkspaceMemberParams.safeParse(req.params);
  const body = InviteCrmWorkspaceMemberBody.safeParse(req.body);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (!isSelectedWorkspace(req, params.data.workspaceId)) {
    unauthorizedWorkspaceResponse(res);
    return;
  }
  const requester = await getWorkspaceMembership(workspaceDb, userId, params.data.workspaceId);
  if (!requester || !canAccessWorkspace(requester.role, "manage")) {
    unauthorizedWorkspaceResponse(res);
    return;
  }
  if (requester.kind !== "agency") {
    res.status(400).json({ error: "Invitations can only be created for agency workspaces" });
    return;
  }
  if (requester.role !== "owner" && body.data.role === "admin") {
    res.status(403).json({ error: "Only the workspace owner can invite administrators" });
    return;
  }
  const email = body.data.email.trim().toLowerCase();
  const [existingMember] = await workspaceDb
    .select({ id: crmWorkspaceMembershipsTable.id })
    .from(crmWorkspaceMembershipsTable)
    .where(
      and(
        eq(crmWorkspaceMembershipsTable.workspaceId, params.data.workspaceId),
        eq(crmWorkspaceMembershipsTable.email, email),
      ),
    )
    .limit(1);
  if (existingMember) {
    res.status(409).json({ error: "That email is already a workspace member" });
    return;
  }

  let sendInvitationEmail: ReturnType<typeof createWorkspaceInvitationEmailSender>;
  try {
    sendInvitationEmail = createInvitationEmailSender();
  } catch (error) {
    if (error instanceof WorkspaceInvitationEmailConfigurationError) {
      res.status(503).json({ error: error.message });
      return;
    }
    throw error;
  }

  const code = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [storedInvitation] = await workspaceDb
    .insert(crmWorkspaceInvitationsTable)
    .values({
      workspaceId: params.data.workspaceId,
      email,
      role: body.data.role,
      tokenHash: createHash("sha256").update(code).digest("hex"),
      invitedBy: userId,
      expiresAt,
    })
    .returning({ id: crmWorkspaceInvitationsTable.id });
  if (!storedInvitation) {
    throw new Error("Could not store workspace invitation");
  }

  try {
    await sendInvitationEmail({
      email,
      workspaceName: requester.name,
      role: body.data.role,
      code,
      expiresAt,
    });
  } catch (error) {
    try {
      await workspaceDb
        .delete(crmWorkspaceInvitationsTable)
        .where(
          and(
            eq(crmWorkspaceInvitationsTable.id, storedInvitation.id),
            isNull(crmWorkspaceInvitationsTable.acceptedAt),
          ),
        );
    } catch (cleanupError) {
      req.log.error(
        { err: cleanupError, workspaceId: params.data.workspaceId },
        "Could not remove an invitation after email delivery failed",
      );
    }
    req.log.error(
      { err: error, workspaceId: params.data.workspaceId },
      "Could not send workspace invitation email",
    );
    res.status(502).json({ error: "Could not send the invitation email. Please try again." });
    return;
  }

  res.status(201).json(
    InviteCrmWorkspaceMemberResponse.parse({
      email,
      role: body.data.role,
      code,
      expiresAt,
    }),
  );
});

router.patch(
  "/crm/workspaces/:workspaceId/members/:membershipId",
  async (req, res): Promise<void> => {
    const userId = getRequestUserId(req);
    const params = UpdateCrmWorkspaceMemberParams.safeParse(req.params);
    const body = UpdateCrmWorkspaceMemberBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (!isSelectedWorkspace(req, params.data.workspaceId)) {
      unauthorizedWorkspaceResponse(res);
      return;
    }
    const requester = await getWorkspaceMembership(workspaceDb, userId, params.data.workspaceId);
    if (!requester || !canAccessWorkspace(requester.role, "manage")) {
      unauthorizedWorkspaceResponse(res);
      return;
    }
    const [target] = await workspaceDb
      .select()
      .from(crmWorkspaceMembershipsTable)
      .where(
        and(
          eq(crmWorkspaceMembershipsTable.id, params.data.membershipId),
          eq(crmWorkspaceMembershipsTable.workspaceId, params.data.workspaceId),
        ),
      )
      .limit(1);
    if (!target || target.role === "owner") {
      res.status(404).json({ error: "Workspace member not found" });
      return;
    }
    if (requester.role !== "owner" && (target.role === "admin" || body.data.role === "admin")) {
      res.status(403).json({ error: "Only the workspace owner can manage administrator roles" });
      return;
    }
    const [updated] = await workspaceDb
      .update(crmWorkspaceMembershipsTable)
      .set({ role: body.data.role })
      .where(
        and(
          eq(crmWorkspaceMembershipsTable.id, params.data.membershipId),
          eq(crmWorkspaceMembershipsTable.workspaceId, params.data.workspaceId),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Workspace member not found" });
      return;
    }
    res.json(
      UpdateCrmWorkspaceMemberResponse.parse({
        id: updated.id,
        userId: updated.userId,
        email: updated.email,
        role: updated.role,
        joinedAt: updated.joinedAt,
        isCurrentUser: updated.userId === userId,
      }),
    );
  },
);

router.delete(
  "/crm/workspaces/:workspaceId/members/:membershipId",
  async (req, res): Promise<void> => {
    const userId = getRequestUserId(req);
    const params = RemoveCrmWorkspaceMemberParams.safeParse(req.params);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!isSelectedWorkspace(req, params.data.workspaceId)) {
      unauthorizedWorkspaceResponse(res);
      return;
    }
    const requester = await getWorkspaceMembership(workspaceDb, userId, params.data.workspaceId);
    if (!requester || !canAccessWorkspace(requester.role, "manage")) {
      unauthorizedWorkspaceResponse(res);
      return;
    }
    const [target] = await workspaceDb
      .select()
      .from(crmWorkspaceMembershipsTable)
      .where(
        and(
          eq(crmWorkspaceMembershipsTable.id, params.data.membershipId),
          eq(crmWorkspaceMembershipsTable.workspaceId, params.data.workspaceId),
        ),
      )
      .limit(1);
    if (!target || target.role === "owner") {
      res.status(404).json({ error: "Workspace member not found" });
      return;
    }
    if (requester.role !== "owner" && target.role === "admin") {
      res.status(403).json({ error: "Only the workspace owner can remove an administrator" });
      return;
    }
    await workspaceDb
      .delete(crmWorkspaceMembershipsTable)
      .where(
        and(
          eq(crmWorkspaceMembershipsTable.id, params.data.membershipId),
          eq(crmWorkspaceMembershipsTable.workspaceId, params.data.workspaceId),
        ),
      );
    res.status(204).end();
  },
);

router.post("/crm/workspace-invitations/accept", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  const body = AcceptCrmWorkspaceInvitationBody.safeParse(req.body);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  let verifiedEmail: string | null = null;
  try {
    const user = await getUser(userId);
    const primaryEmail = user.emailAddresses.find(
      (emailAddress) => emailAddress.id === user.primaryEmailAddressId,
    );
    if (primaryEmail?.verification?.status === "verified") {
      verifiedEmail = primaryEmail.emailAddress.trim().toLowerCase();
    }
  } catch (error) {
    req.log.error({ err: error }, "Could not verify invitation email");
    res.status(502).json({ error: "Could not verify your account email. Please try again." });
    return;
  }
  if (!verifiedEmail) {
    res.status(403).json({ error: "A verified primary email is required to accept an invitation" });
    return;
  }

  const tokenHash = createHash("sha256").update(body.data.code).digest("hex");
  const now = new Date();
  const [accepted] = await workspaceDb.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(crmWorkspaceInvitationsTable)
      .where(
        and(
          eq(crmWorkspaceInvitationsTable.tokenHash, tokenHash),
          isNull(crmWorkspaceInvitationsTable.acceptedAt),
          gt(crmWorkspaceInvitationsTable.expiresAt, now),
        ),
      )
      .limit(1);
    if (!invitation || invitation.email !== verifiedEmail) return [];

    const [existingMember] = await tx
      .select({ id: crmWorkspaceMembershipsTable.id })
      .from(crmWorkspaceMembershipsTable)
      .where(
        and(
          eq(crmWorkspaceMembershipsTable.workspaceId, invitation.workspaceId),
          eq(crmWorkspaceMembershipsTable.userId, userId),
        ),
      )
      .limit(1);
    if (existingMember) return [];

    const [markedAccepted] = await tx
      .update(crmWorkspaceInvitationsTable)
      .set({ acceptedAt: now })
      .where(
        and(
          eq(crmWorkspaceInvitationsTable.id, invitation.id),
          isNull(crmWorkspaceInvitationsTable.acceptedAt),
        ),
      )
      .returning({ id: crmWorkspaceInvitationsTable.id });
    if (!markedAccepted) return [];

    await tx.insert(crmWorkspaceMembershipsTable).values({
      workspaceId: invitation.workspaceId,
      userId,
      email: verifiedEmail,
      role: invitation.role,
    });
    const [workspace] = await tx
      .select()
      .from(crmWorkspacesTable)
      .where(eq(crmWorkspacesTable.id, invitation.workspaceId))
      .limit(1);
    return workspace ? [{ ...workspace, role: invitation.role }] : [];
  });

  if (!accepted) {
    res.status(404).json({ error: "Invitation is invalid, expired, already used, or for another email" });
    return;
  }
  res.json(
    AcceptCrmWorkspaceInvitationResponse.parse({
      id: accepted.id,
      name: accepted.name,
      kind: accepted.kind,
      role: accepted.role,
      memberCount: await memberCount(workspaceDb, accepted.id),
      createdAt: accepted.createdAt,
    }),
  );
});

  return router;
}

export default createCrmWorkspaceRouter();