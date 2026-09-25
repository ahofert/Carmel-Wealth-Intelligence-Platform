import { createInsertSchema } from "drizzle-zod";
import { boolean, index, integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { crmWorkspacesTable } from "./crm-workspaces";

export const crmLeadsTable = pgTable(
  "crm_leads",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    workspaceId: integer("workspace_id").references(() => crmWorkspacesTable.id, {
      onDelete: "cascade",
    }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    segment: text("segment").notNull(),
    intent: text("intent").notNull(),
    source: text("source").notNull(),
    stage: text("stage").notNull().default("New"),
    city: text("city").notNull(),
    province: text("province").notNull(),
    budgetMin: numeric("budget_min", { precision: 14, scale: 2, mode: "number" }),
    budgetMax: numeric("budget_max", { precision: 14, scale: 2, mode: "number" }),
    score: integer("score").notNull().default(35),
    revenueEstimate: numeric("revenue_estimate", { precision: 14, scale: 2, mode: "number" }),
    revenueWon: numeric("revenue_won", { precision: 14, scale: 2, mode: "number" }),
    consent: boolean("consent").notNull().default(false),
    nextAction: text("next_action"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [index("crm_leads_workspace_idx").on(table.workspaceId)],
);

export const insertCrmLeadSchema = createInsertSchema(crmLeadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCrmLead = typeof crmLeadsTable.$inferInsert;
export type CrmLead = typeof crmLeadsTable.$inferSelect;