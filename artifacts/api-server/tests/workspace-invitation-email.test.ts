import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createWorkspaceInvitationEmailSender,
  WorkspaceInvitationEmailConfigurationError,
} from "../src/lib/workspace-invitation-email.ts";

test("invitation email includes workspace, assigned role, expiry, and acceptance code", async () => {
  let deliveredMessage:
    | { from: string; to: string; subject: string; text: string }
    | undefined;
  let deliveredSmtpUrl: string | undefined;
  const send = createWorkspaceInvitationEmailSender(
    { smtpUrl: "smtps://mail.example.test", from: "workspace@example.test" },
    async (smtpUrl, message) => {
      deliveredSmtpUrl = smtpUrl;
      deliveredMessage = message;
    },
  );

  await send({
    email: "teammate@example.com",
    workspaceName: "Northstar Realty",
    role: "agent",
    code: "safe-one-time-code",
    expiresAt: new Date("2026-10-01T12:00:00.000Z"),
  });

  assert.equal(deliveredSmtpUrl, "smtps://mail.example.test");
  assert.equal(deliveredMessage?.from, "workspace@example.test");
  assert.equal(deliveredMessage?.to, "teammate@example.com");
  assert.match(deliveredMessage?.text ?? "", /Northstar Realty/);
  assert.match(deliveredMessage?.text ?? "", /Agent/);
  assert.match(deliveredMessage?.text ?? "", /safe-one-time-code/);
  assert.match(deliveredMessage?.text ?? "", /Thu, 01 Oct 2026 12:00:00 GMT/);
  assert.match(deliveredMessage?.text ?? "", /verified email address/);
});

test("sender fails explicitly when SMTP settings are missing", () => {
  assert.throws(
    () => createWorkspaceInvitationEmailSender({ smtpUrl: "", from: "" }),
    WorkspaceInvitationEmailConfigurationError,
  );
});