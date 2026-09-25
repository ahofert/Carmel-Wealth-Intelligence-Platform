import nodemailer from "nodemailer";

export type WorkspaceInvitationEmailInput = {
  email: string;
  workspaceName: string;
  role: "admin" | "agent" | "viewer";
  code: string;
  expiresAt: Date;
};

type InvitationEmailMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
};

type EmailDelivery = (
  smtpUrl: string,
  message: InvitationEmailMessage,
) => Promise<void>;

export class WorkspaceInvitationEmailConfigurationError extends Error {
  constructor() {
    super("Workspace email is not configured. Set SMTP_URL and SMTP_FROM before sending invitations.");
    this.name = "WorkspaceInvitationEmailConfigurationError";
  }
}

async function deliverThroughSmtp(
  smtpUrl: string,
  message: InvitationEmailMessage,
): Promise<void> {
  const transporter = nodemailer.createTransport(smtpUrl);
  await transporter.sendMail(message);
}

function buildInvitationMessage(
  from: string,
  invitation: WorkspaceInvitationEmailInput,
): InvitationEmailMessage {
  const workspaceName = invitation.workspaceName.replace(/[\r\n]+/g, " ").trim();
  const role = invitation.role[0].toUpperCase() + invitation.role.slice(1);

  return {
    from,
    to: invitation.email,
    subject: "You have a workspace invitation",
    text: [
      `You have been invited to join ${workspaceName} as a ${role}.`,
      "",
      `Invitation code: ${invitation.code}`,
      `Expires: ${invitation.expiresAt.toUTCString()}`,
      "",
      "To accept, sign in to Estate Revenue with the invited email address, then enter the code under Workspace & members → Accept an invitation.",
      "The invitation can be used once and can only be accepted from an account with this verified email address.",
    ].join("\n"),
  };
}

export function createWorkspaceInvitationEmailSender(
  config: {
    smtpUrl?: string;
    from?: string;
  } = {
    smtpUrl: process.env.SMTP_URL,
    from: process.env.SMTP_FROM,
  },
  deliver: EmailDelivery = deliverThroughSmtp,
): (invitation: WorkspaceInvitationEmailInput) => Promise<void> {
  const smtpUrl = config.smtpUrl?.trim();
  const from = config.from?.trim();
  if (!smtpUrl || !from) {
    throw new WorkspaceInvitationEmailConfigurationError();
  }

  return async (invitation) => {
    await deliver(smtpUrl, buildInvitationMessage(from, invitation));
  };
}