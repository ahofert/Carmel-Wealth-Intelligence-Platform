import { createInsertSchema } from "drizzle-zod";
import { boolean, index, integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { crmWorkspacesTable } from "./crm-workspaces";

export const crmAutomationsTable = pgTable(
  "crm_automations",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    workspaceId: integer("workspace_id").references(() => crmWorkspacesTable.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    trigger: text("trigger").notNull(),
    channel: text("channel").notNull(),
    active: boolean("active").notNull().default(false),
    sentCount: integer("sent_count").notNull().default(0),
    category: text("category").notNull(),
  },
  (table) => [index("crm_automations_workspace_idx").on(table.workspaceId)],
);

export const insertCrmAutomationSchema = createInsertSchema(crmAutomationsTable).omit({
  id: true,
});

export type InsertCrmAutomation = typeof crmAutomationsTable.$inferInsert;
export type CrmAutomation = typeof crmAutomationsTable.$inferSelect;