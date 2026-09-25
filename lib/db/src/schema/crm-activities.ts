import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { crmLeadsTable } from "./crm-leads";
import { crmWorkspacesTable } from "./crm-workspaces";

export const crmActivitiesTable = pgTable(
  "crm_activities",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    workspaceId: integer("workspace_id").references(() => crmWorkspacesTable.id, {
      onDelete: "cascade",
    }),
    leadId: integer("lead_id").notNull().references(() => crmLeadsTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("crm_activities_workspace_idx").on(table.workspaceId)],
);

export const insertCrmActivitySchema = createInsertSchema(crmActivitiesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertCrmActivity = typeof crmActivitiesTable.$inferInsert;
export type CrmActivity = typeof crmActivitiesTable.$inferSelect;