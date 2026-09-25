import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import {
  crmWorkspaceInvitationsTable,
  crmWorkspaceMembershipsTable,
  crmWorkspacesTable,
  db,
  pool,
} from "@workspace/db";
import {
  createCrmWorkspaceRouter,
  type CrmWorkspaceRouterDependencies,
} from "../src/routes/crm-workspaces.ts";
import type { WorkspaceInvitationEmailInput } from "../src/lib/workspace-invitation-email.ts";

type ClerkUser = Awaited<
  ReturnType<NonNullable<CrmWorkspaceRouterDependencies["getClerkUser"]>>
>;

type TestClerkUser = {
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{
    id: string;
    emailAddress: string;
    verification: { status: string } | null;
  }>;
};

function clerkUser(user: TestClerkUser): ClerkUser {
  return user as unknown as ClerkUser;
}

async function createWorkspaceFixture() {
  const suffix = randomUUID();
  const ownerId = `workspace-invite-owner-${suffix}`;
  const [workspace] = await db
    .insert(crmWorkspacesTable)
    .values({ name: `Invitation route test ${suffix}`, kind: "agency" })
    .returning({ id: crmWorkspacesTable.id });

  assert.ok(workspace);
  await db.insert(crmWorkspaceMembershipsTable).values({
    workspaceId: workspace.id,
    userId: ownerId,
    email: `${ownerId}@example.test`,
    role: "owner",
  });

  return {
    workspaceId: workspace.id,
    ownerId,
    async cleanup() {
      await db
        .delete(crmWorkspacesTable)
        .where(eq(crmWorkspacesTable.id, workspace.id));
    },
  };
}

async function startTestServer(
  getClerkUser: NonNullable<CrmWorkspaceRouterDependencies["getClerkUser"]>,
  sendInvitation: (invitation: WorkspaceInvitationEmailInput) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { log: { error: () => undefined } });
    next();
  });
  app.use(
    createCrmWorkspaceRouter({
      database: db,
      getUserId: (req) => req.get("x-test-user-id") ?? null,
      getClerkUser,
      createInvitationEmailSender: () => sendInvitation,
    }),
  );

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address() as AddressInfo;
  return {
    async post(path: string, userId: string, body: unknown) {
      return fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": userId,
        },
        body: JSON.stringify(body),
      });
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

after(async () => {
  await pool.end();
});

test("invitation rows store a code hash and expire seven days after creation", async () => {
  const fixture = await createWorkspaceFixture();
  let sentInvitation: WorkspaceInvitationEmailInput | undefined;
  const server = await startTestServer(
    async () => clerkUser({ primaryEmailAddressId: null, emailAddresses: [] }),
    async (invitation) => {
      sentInvitation = invitation;
    },
  );

  try {
    const requestStartedAt = Date.now();
    const response = await server.post(
      `/crm/workspaces/${fixture.workspaceId}/members`,
      fixture.ownerId,
      { email: "Invitee@Example.Test", role: "agent" },
    );
    const responseReceivedAt = Date.now();
    assert.equal(response.status, 201);
    assert.ok(sentInvitation);

    const [storedInvitation] = await db
      .select()
      .from(crmWorkspaceInvitationsTable)
      .where(eq(crmWorkspaceInvitationsTable.workspaceId, fixture.workspaceId));
    assert.ok(storedInvitation);
    assert.equal(
      storedInvitation.tokenHash,
      createHash("sha256").update(sentInvitation.code).digest("hex"),
    );
    assert.notEqual(storedInvitation.tokenHash, sentInvitation.code);
    assert.equal("code" in storedInvitation, false);
    assert.equal(storedInvitation.email, "invitee@example.test");

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    assert.ok(
      storedInvitation.expiresAt.getTime() >= requestStartedAt + sevenDaysMs,
      "expiry should be no earlier than seven days after the request started",
    );
    assert.ok(
      storedInvitation.expiresAt.getTime() <= responseReceivedAt + sevenDaysMs,
      "expiry should be no later than seven days after the request completed",
    );
    assert.equal(
      storedInvitation.expiresAt.getTime(),
      sentInvitation.expiresAt.getTime(),
    );
  } finally {
    await server.close();
    await fixture.cleanup();
  }
});

test("SMTP failure removes the pending invitation row", async () => {
  const fixture = await createWorkspaceFixture();
  const server = await startTestServer(
    async () => clerkUser({ primaryEmailAddressId: null, emailAddresses: [] }),
    async () => {
      throw new Error("simulated SMTP failure");
    },
  );

  try {
    const response = await server.post(
      `/crm/workspaces/${fixture.workspaceId}/members`,
      fixture.ownerId,
      { email: "delivery-failure@example.test", role: "agent" },
    );
    assert.equal(response.status, 502);

    const invitations = await db
      .select()
      .from(crmWorkspaceInvitationsTable)
      .where(eq(crmWorkspaceInvitationsTable.workspaceId, fixture.workspaceId));
    assert.deepEqual(invitations, []);
  } finally {
    await server.close();
    await fixture.cleanup();
  }
});

test("acceptance requires the matching verified primary email and succeeds only once", async () => {
  const fixture = await createWorkspaceFixture();
  const inviteEmail = "invitee@example.test";
  let sentInvitation: WorkspaceInvitationEmailInput | undefined;
  const users = new Map<string, ClerkUser>([
    [
      "unverified-primary",
      clerkUser({
        primaryEmailAddressId: "primary",
        emailAddresses: [
          {
            id: "primary",
            emailAddress: inviteEmail,
            verification: { status: "unverified" },
          },
          {
            id: "verified-secondary",
            emailAddress: inviteEmail,
            verification: { status: "verified" },
          },
        ],
      }),
    ],
    [
      "wrong-primary",
      clerkUser({
        primaryEmailAddressId: "primary",
        emailAddresses: [
          {
            id: "primary",
            emailAddress: "different@example.test",
            verification: { status: "verified" },
          },
          {
            id: "matching-secondary",
            emailAddress: inviteEmail,
            verification: { status: "verified" },
          },
        ],
      }),
    ],
    [
      "matching-primary",
      clerkUser({
        primaryEmailAddressId: "primary",
        emailAddresses: [
          {
            id: "primary",
            emailAddress: "INVITEE@EXAMPLE.TEST",
            verification: { status: "verified" },
          },
        ],
      }),
    ],
  ]);
  const server = await startTestServer(
    async (userId) => {
      const user = users.get(userId);
      if (!user) throw new Error("Unexpected test user");
      return user;
    },
    async (invitation) => {
      sentInvitation = invitation;
    },
  );

  try {
    const inviteResponse = await server.post(
      `/crm/workspaces/${fixture.workspaceId}/members`,
      fixture.ownerId,
      { email: inviteEmail, role: "agent" },
    );
    assert.equal(inviteResponse.status, 201);
    assert.ok(sentInvitation);

    const invitationCode = sentInvitation.code;
    const acceptPath = "/crm/workspace-invitations/accept";
    const unverifiedResponse = await server.post(acceptPath, "unverified-primary", {
      code: invitationCode,
    });
    assert.equal(unverifiedResponse.status, 403);

    const wrongPrimaryResponse = await server.post(acceptPath, "wrong-primary", {
      code: invitationCode,
    });
    assert.equal(wrongPrimaryResponse.status, 404);

    const pendingInvitations = await db
      .select()
      .from(crmWorkspaceInvitationsTable)
      .where(
        and(
          eq(crmWorkspaceInvitationsTable.workspaceId, fixture.workspaceId),
          eq(crmWorkspaceInvitationsTable.email, inviteEmail),
        ),
      );
    assert.equal(pendingInvitations.length, 1);
    assert.equal(pendingInvitations[0]?.acceptedAt, null);

    const acceptedResponse = await server.post(acceptPath, "matching-primary", {
      code: invitationCode,
    });
    assert.equal(acceptedResponse.status, 200);

    const replayResponse = await server.post(acceptPath, "matching-primary", {
      code: invitationCode,
    });
    assert.equal(replayResponse.status, 404);

    const [acceptedInvitation] = await db
      .select()
      .from(crmWorkspaceInvitationsTable)
      .where(eq(crmWorkspaceInvitationsTable.workspaceId, fixture.workspaceId));
    assert.ok(acceptedInvitation?.acceptedAt);
    const acceptedMemberships = await db
      .select()
      .from(crmWorkspaceMembershipsTable)
      .where(
        and(
          eq(crmWorkspaceMembershipsTable.workspaceId, fixture.workspaceId),
          eq(crmWorkspaceMembershipsTable.userId, "matching-primary"),
        ),
      );
    assert.equal(acceptedMemberships.length, 1);
    assert.equal(acceptedMemberships[0]?.email, inviteEmail);
  } finally {
    await server.close();
    await fixture.cleanup();
  }
});