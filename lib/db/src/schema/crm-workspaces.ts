import { createInsertSchema } from "drizzle-zod";
import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const crmWorkspacesTable = pgTable("crm_workspaces", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("agency"),
  personalOwnerId: text("personal_owner_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const crmWorkspaceMembershipsTable = pgTable(
  "crm_workspace_memberships",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => crmWorkspacesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    email: text("email"),
    role: text("role").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("crm_workspace_memberships_workspace_user_idx").on(
      table.workspaceId,
      table.userId,
    ),
    index("crm_workspace_memberships_user_idx").on(table.userId),
  ],
);

export const crmWorkspaceInvitationsTable = pgTable(
  "crm_workspace_invitations",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => crmWorkspacesTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("crm_workspace_invitations_workspace_idx").on(table.workspaceId),
  ],
);

export const insertCrmWorkspaceSchema = createInsertSchema(crmWorkspacesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCrmWorkspace = typeof crmWorkspacesTable.$inferInsert;
export type CrmWorkspace = typeof crmWorkspacesTable.$inferSelect;
export type CrmWorkspaceMembership = typeof crmWorkspaceMembershipsTable.$inferSelect;
export type CrmWorkspaceInvitation = typeof crmWorkspaceInvitationsTable.$inferSelect;