import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { crmLeadsTable } from "./crm-leads";
import { crmWorkspacesTable } from "./crm-workspaces";

export const crmAppointmentsTable = pgTable(
  "crm_appointments",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    workspaceId: integer("workspace_id").references(() => crmWorkspacesTable.id, {
      onDelete: "cascade",
    }),
    leadId: integer("lead_id").notNull().references(() => crmLeadsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    type: text("type").notNull(),
    status: text("status").notNull().default("Confirmed"),
    location: text("location").notNull(),
  },
  (table) => [index("crm_appointments_workspace_idx").on(table.workspaceId)],
);

export const insertCrmAppointmentSchema = createInsertSchema(crmAppointmentsTable).omit({
  id: true,
});

export type InsertCrmAppointment = typeof crmAppointmentsTable.$inferInsert;
export type CrmAppointment = typeof crmAppointmentsTable.$inferSelect;