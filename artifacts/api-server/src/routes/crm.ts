import { openai } from "@workspace/integrations-openai-ai-server";
import {
  and,
  desc,
  eq,
  ilike,
  ne,
  or,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateCrmAppointmentBody,
  CreateCrmAppointmentResponse,
  CreateCrmLeadBody,
  CreateCrmLeadResponse,
  CreateLeadActivityBody,
  CreateLeadActivityParams,
  CreateLeadActivityResponse,
  GetCrmDashboardResponse,
  GetCrmReportsResponse,
  ListCrmAppointmentsResponse,
  ListCrmAutomationsResponse,
  ListCrmLeadsQueryParams,
  ListCrmLeadsResponse,
  ListLeadActivitiesParams,
  ListLeadActivitiesResponse,
  QualifyCrmLeadBody,
  QualifyCrmLeadResponse,
  UpdateCrmAutomationBody,
  UpdateCrmAutomationParams,
  UpdateCrmAutomationResponse,
  UpdateCrmLeadBody,
  UpdateCrmLeadParams,
  UpdateCrmLeadResponse,
} from "@workspace/api-zod";
import {
  crmActivitiesTable,
  crmAppointmentsTable,
  crmAutomationsTable,
  crmLeadsTable,
  db,
  type CrmLead,
} from "@workspace/db";
import {
  crmWorkspaceContext,
  requireCrmWorkspaceCapability,
} from "../lib/crm-workspaces";

const router: IRouter = Router();
const PIPELINE_STAGES = [
  "New",
  "Contacted",
  "Qualified",
  "Viewing booked",
  "Offer",
  "Won",
  "Lost",
];
const WON_STAGE = "Won";
const OPEN_STAGES = PIPELINE_STAGES.filter((stage) => stage !== "Won" && stage !== "Lost");

function toPublicLead(lead: CrmLead) {
  return {
    id: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    segment: lead.segment,
    intent: lead.intent,
    source: lead.source,
    stage: lead.stage,
    city: lead.city,
    province: lead.province,
    budgetMin: lead.budgetMin,
    budgetMax: lead.budgetMax,
    score: lead.score,
    revenueEstimate: lead.revenueEstimate,
    revenueWon: lead.revenueWon,
    consent: lead.consent,
    nextAction: lead.nextAction,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

function toPublicActivity(activity: typeof crmActivitiesTable.$inferSelect) {
  return {
    id: activity.id,
    leadId: activity.leadId,
    kind: activity.kind,
    title: activity.title,
    detail: activity.detail,
    createdAt: activity.createdAt.toISOString(),
  };
}

async function ensureSeeded(ownerId: string, workspaceId: number): Promise<void> {
  const existing = await db
    .select({ id: crmLeadsTable.id })
    .from(crmLeadsTable)
    .where(eq(crmLeadsTable.workspaceId, workspaceId))
    .limit(1);
  if (existing.length > 0) return;

  const now = Date.now();
  const leads = await db
    .insert(crmLeadsTable)
    .values([
      {
        ownerId,
        workspaceId,
        firstName: "Thando",
        lastName: "Mokoena",
        email: "thando.mokoena@example.invalid",
        phone: null,
        segment: "B2C",
        intent: "Buyer",
        source: "Property24",
        stage: "Qualified",
        city: "Johannesburg",
        province: "Gauteng",
        budgetMin: 1800000,
        budgetMax: 2500000,
        score: 88,
        revenueEstimate: 45000,
        revenueWon: null,
        consent: true,
        nextAction: "Call to confirm viewing",
        createdAt: new Date(now - 3 * 60 * 60 * 1000),
        updatedAt: new Date(now - 18 * 60 * 60 * 1000),
      },
      {
        ownerId,
        workspaceId,
        firstName: "Ayesha",
        lastName: "Adams",
        email: "ayesha.adams@example.invalid",
        phone: null,
        segment: "B2C",
        intent: "Seller",
        source: "Referral",
        stage: "Viewing booked",
        city: "Cape Town",
        province: "Western Cape",
        budgetMin: 3200000,
        budgetMax: 3900000,
        score: 74,
        revenueEstimate: 52000,
        revenueWon: null,
        consent: true,
        nextAction: "Prepare comparative market analysis",
        createdAt: new Date(now - 27 * 60 * 60 * 1000),
        updatedAt: new Date(now - 5 * 60 * 60 * 1000),
      },
      {
        ownerId,
        workspaceId,
        firstName: "Imran",
        lastName: "Naidoo",
        email: "imran.naidoo@example.invalid",
        phone: null,
        segment: "B2B",
        intent: "Developer",
        source: "Website enquiry",
        stage: "Offer",
        city: "Durban",
        province: "KwaZulu-Natal",
        budgetMin: 8500000,
        budgetMax: 12000000,
        score: 92,
        revenueEstimate: 145000,
        revenueWon: null,
        consent: false,
        nextAction: "Send proposal after direct-contact permission",
        createdAt: new Date(now - 96 * 60 * 60 * 1000),
        updatedAt: new Date(now - 28 * 60 * 60 * 1000),
      },
      {
        ownerId,
        workspaceId,
        firstName: "Morgan",
        lastName: "Jacobs",
        email: "morgan.jacobs@example.invalid",
        phone: null,
        segment: "B2C",
        intent: "Buyer",
        source: "Past client referral",
        stage: WON_STAGE,
        city: "Stellenbosch",
        province: "Western Cape",
        budgetMin: 2600000,
        budgetMax: 3100000,
        score: 100,
        revenueEstimate: 58500,
        revenueWon: 58500,
        consent: true,
        nextAction: "Request post-transfer feedback",
        createdAt: new Date(now - 45 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
      },
    ])
    .returning();

  await db.insert(crmActivitiesTable).values([
    {
      ownerId,
      workspaceId,
      leadId: leads[0]!.id,
      kind: "qualification",
      title: "Lead qualified",
      detail: "Clear buyer brief, Gauteng focus and confirmed budget range.",
      createdAt: new Date(now - 2 * 60 * 60 * 1000),
    },
    {
      ownerId,
      workspaceId,
      leadId: leads[1]!.id,
      kind: "appointment",
      title: "Valuation visit booked",
      detail: "On-site valuation with the seller in Cape Town.",
      createdAt: new Date(now - 5 * 60 * 60 * 1000),
    },
    {
      ownerId,
      workspaceId,
      leadId: leads[2]!.id,
      kind: "pipeline",
      title: "Moved to offer",
      detail: "B2B development opportunity; direct marketing consent is not recorded.",
      createdAt: new Date(now - 28 * 60 * 60 * 1000),
    },
  ]);

  await db.insert(crmAppointmentsTable).values([
    {
      ownerId,
      workspaceId,
      leadId: leads[0]!.id,
      title: "Property viewing",
      startsAt: new Date(now + 22 * 60 * 60 * 1000),
      type: "Viewing",
      status: "Confirmed",
      location: "Rosebank, Johannesburg",
    },
    {
      ownerId,
      workspaceId,
      leadId: leads[1]!.id,
      title: "Seller valuation",
      startsAt: new Date(now + 51 * 60 * 60 * 1000),
      type: "Valuation",
      status: "Confirmed",
      location: "Claremont, Cape Town",
    },
  ]);

  await db.insert(crmAutomationsTable).values([
    {
      ownerId,
      workspaceId,
      name: "New enquiry response",
      description: "Acknowledge a new enquiry and create an agent call task.",
      trigger: "When a new lead is captured",
      channel: "SMS + email",
      active: false,
      sentCount: 0,
      category: "Lead response",
    },
    {
      ownerId,
      workspaceId,
      name: "Viewing reminder",
      description: "Remind both parties before a confirmed property viewing.",
      trigger: "24 hours before appointment",
      channel: "SMS",
      active: false,
      sentCount: 0,
      category: "Appointments",
    },
    {
      ownerId,
      name: "No-show recovery",
      description: "Create a same-day recovery task after a missed appointment.",
      trigger: "Appointment marked as no-show",
      channel: "SMS + email",
      active: false,
      sentCount: 0,
      category: "Recovery",
    },
    {
      ownerId,
      name: "Past-client referral check-in",
      description: "Schedule a personal check-in for eligible past clients.",
      trigger: "90 days after transfer",
      channel: "Email",
      active: false,
      sentCount: 0,
      category: "Referrals",
    },
  ]);
}

router.get("/crm/dashboard", async (req, res): Promise<void> => {
  const { userId: ownerId, workspaceId } = crmWorkspaceContext(res);
  await ensureSeeded(ownerId, workspaceId);
  const leads = await db.select().from(crmLeadsTable).where(eq(crmLeadsTable.workspaceId, workspaceId));
  const appointmentRows = await db
    .select({
      id: crmAppointmentsTable.id,
      leadId: crmAppointmentsTable.leadId,
      title: crmAppointmentsTable.title,
      startsAt: crmAppointmentsTable.startsAt,
      type: crmAppointmentsTable.type,
      status: crmAppointmentsTable.status,
      location: crmAppointmentsTable.location,
      firstName: crmLeadsTable.firstName,
      lastName: crmLeadsTable.lastName,
    })
    .from(crmAppointmentsTable)
    .innerJoin(crmLeadsTable, eq(crmAppointmentsTable.leadId, crmLeadsTable.id))
    .where(
      and(
        eq(crmAppointmentsTable.workspaceId, workspaceId),
        eq(crmLeadsTable.workspaceId, workspaceId),
        ne(crmAppointmentsTable.status, "Cancelled"),
      ),
    )
    .orderBy(crmAppointmentsTable.startsAt)
    .limit(6);
  const now = new Date();
  const upcomingAppointments = appointmentRows
    .filter((row) => row.startsAt >= now)
    .map((row) => ({
      id: row.id,
      leadId: row.leadId,
      leadName: `${row.firstName} ${row.lastName}`,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      type: row.type,
      status: row.status,
      location: row.location,
    }));
  const stageCounts = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: leads.filter((lead) => lead.stage === stage).length,
  }));
  const response = {
    newLeads: leads.filter((lead) => lead.stage === "New").length,
    qualified: leads.filter((lead) => ["Qualified", "Viewing booked", "Offer"].includes(lead.stage)).length,
    appointments: appointmentRows.filter((row) => row.startsAt >= now).length,
    pipelineValue: leads
      .filter((lead) => OPEN_STAGES.includes(lead.stage))
      .reduce((sum, lead) => sum + (lead.revenueEstimate ?? 0), 0),
    revenueWon: leads.reduce((sum, lead) => sum + (lead.revenueWon ?? 0), 0),
    followUpsDue: leads.filter((lead) => lead.nextAction && !["Won", "Lost"].includes(lead.stage)).length,
    stageCounts,
    upcomingAppointments,
  };
  res.json(GetCrmDashboardResponse.parse(response));
});

router.get("/crm/leads", async (req, res): Promise<void> => {
  const { userId: ownerId, workspaceId } = crmWorkspaceContext(res);
  await ensureSeeded(ownerId, workspaceId);
  const parsed = ListCrmLeadsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const filters = [eq(crmLeadsTable.workspaceId, workspaceId)];
  if (parsed.data.segment) filters.push(eq(crmLeadsTable.segment, parsed.data.segment));
  if (parsed.data.stage) filters.push(eq(crmLeadsTable.stage, parsed.data.stage));
  const search = parsed.data.search?.trim();
  if (search) {
    filters.push(
      or(
        ilike(crmLeadsTable.firstName, `%${search}%`),
        ilike(crmLeadsTable.lastName, `%${search}%`),
        ilike(crmLeadsTable.email, `%${search}%`),
        ilike(crmLeadsTable.phone, `%${search}%`),
        ilike(crmLeadsTable.city, `%${search}%`),
        ilike(crmLeadsTable.source, `%${search}%`),
      )!,
    );
  }
  const leads = await db
    .select()
    .from(crmLeadsTable)
    .where(and(...filters))
    .orderBy(desc(crmLeadsTable.createdAt));
  res.json(ListCrmLeadsResponse.parse(leads.map(toPublicLead)));
});

router.post("/crm/leads", requireCrmWorkspaceCapability("write"), async (req, res): Promise<void> => {
  const { userId: ownerId, workspaceId } = crmWorkspaceContext(res);
  await ensureSeeded(ownerId, workspaceId);
  const parsed = CreateCrmLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const values = parsed.data;
  const [lead] = await db
    .insert(crmLeadsTable)
    .values({
      ownerId,
      workspaceId,
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email ?? null,
      phone: values.phone ?? null,
      segment: values.segment,
      intent: values.intent,
      source: values.source,
      stage: values.stage ?? "New",
      city: values.city,
      province: values.province,
      budgetMin: values.budgetMin ?? null,
      budgetMax: values.budgetMax ?? null,
      score: values.score ?? 35,
      revenueEstimate: values.revenueEstimate ?? null,
      revenueWon: values.revenueWon ?? null,
      consent: values.consent,
      nextAction: values.nextAction ?? "Review enquiry and assign first contact",
    })
    .returning();
  if (!lead) {
    res.status(500).json({ error: "Could not create lead" });
    return;
  }
  await db.insert(crmActivitiesTable).values({
    ownerId,
    workspaceId,
    leadId: lead.id,
    kind: "capture",
    title: "Lead captured",
    detail: values.consent
      ? "Consent recorded. Any marketing outreach must still respect the recorded preference."
      : "No direct-marketing consent recorded; do not send marketing messages.",
  });
  res.status(201).json(CreateCrmLeadResponse.parse(toPublicLead(lead)));
});

router.patch("/crm/leads/:id", requireCrmWorkspaceCapability("write"), async (req, res): Promise<void> => {
  const { userId: ownerId, workspaceId } = crmWorkspaceContext(res);
  const params = UpdateCrmLeadParams.safeParse(req.params);
  const body = UpdateCrmLeadBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [before] = await db
    .select()
    .from(crmLeadsTable)
    .where(and(eq(crmLeadsTable.id, params.data.id), eq(crmLeadsTable.workspaceId, workspaceId)))
    .limit(1);
  if (!before) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const [updated] = await db
    .update(crmLeadsTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(and(eq(crmLeadsTable.id, params.data.id), eq(crmLeadsTable.workspaceId, workspaceId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  if (body.data.stage && body.data.stage !== before.stage) {
    await db.insert(crmActivitiesTable).values({
      ownerId,
      workspaceId,
      leadId: updated.id,
      kind: "pipeline",
      title: `Moved to ${body.data.stage}`,
      detail: `Pipeline stage changed from ${before.stage} to ${body.data.stage}.`,
    });
  }
  res.json(UpdateCrmLeadResponse.parse(toPublicLead(updated)));
});

router.get("/crm/leads/:id/activities", async (req, res): Promise<void> => {
  const { workspaceId } = crmWorkspaceContext(res);
  const params = ListLeadActivitiesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const activities = await db
    .select({
      id: crmActivitiesTable.id,
      leadId: crmActivitiesTable.leadId,
      kind: crmActivitiesTable.kind,
      title: crmActivitiesTable.title,
      detail: crmActivitiesTable.detail,
      createdAt: crmActivitiesTable.createdAt,
    })
    .from(crmActivitiesTable)
    .innerJoin(
      crmLeadsTable,
      and(
        eq(crmActivitiesTable.leadId, crmLeadsTable.id),
        eq(crmLeadsTable.workspaceId, workspaceId),
      ),
    )
    .where(
      and(
        eq(crmActivitiesTable.leadId, params.data.id),
        eq(crmActivitiesTable.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(crmActivitiesTable.createdAt));
  res.json(ListLeadActivitiesResponse.parse(activities.map(toPublicActivity)));
});

router.post("/crm/leads/:id/activities", requireCrmWorkspaceCapability("write"), async (req, res): Promise<void> => {
  const { userId: ownerId, workspaceId } = crmWorkspaceContext(res);
  const params = CreateLeadActivityParams.safeParse(req.params);
  const body = CreateLeadActivityBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [lead] = await db
    .select({ id: crmLeadsTable.id })
    .from(crmLeadsTable)
    .where(and(eq(crmLeadsTable.id, params.data.id), eq(crmLeadsTable.workspaceId, workspaceId)))
    .limit(1);
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const [activity] = await db
    .insert(crmActivitiesTable)
    .values({
      ownerId,
      workspaceId,
      leadId: params.data.id,
      kind: body.data.kind,
      title: body.data.title,
      detail: body.data.detail,
    })
    .returning();
  if (!activity) {
    res.status(500).json({ error: "Could not record activity" });
    return;
  }
  res.status(201).json(CreateLeadActivityResponse.parse(toPublicActivity(activity)));
});

router.get("/crm/appointments", async (req, res): Promise<void> => {
  const { userId: ownerId, workspaceId } = crmWorkspaceContext(res);
  await ensureSeeded(ownerId, workspaceId);
  const rows = await db
    .select({
      id: crmAppointmentsTable.id,
      leadId: crmAppointmentsTable.leadId,
      title: crmAppointmentsTable.title,
      startsAt: crmAppointmentsTable.startsAt,
      type: crmAppointmentsTable.type,
      status: crmAppointmentsTable.status,
      location: crmAppointmentsTable.location,
      firstName: crmLeadsTable.firstName,
      lastName: crmLeadsTable.lastName,
    })
    .from(crmAppointmentsTable)
    .innerJoin(crmLeadsTable, eq(crmAppointmentsTable.leadId, crmLeadsTable.id))
    .where(
      and(
        eq(crmAppointmentsTable.workspaceId, workspaceId),
        eq(crmLeadsTable.workspaceId, workspaceId),
        ne(crmAppointmentsTable.status, "Cancelled"),
      ),
    )
    .orderBy(crmAppointmentsTable.startsAt);
  const appointments = rows.map((row) => ({
    id: row.id,
    leadId: row.leadId,
    leadName: `${row.firstName} ${row.lastName}`,
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    type: row.type,
    status: row.status,
    location: row.location,
  }));
  res.json(ListCrmAppointmentsResponse.parse(appointments));
});

router.post("/crm/appointments", requireCrmWorkspaceCapability("write"), async (req, res): Promise<void> => {
  const { userId: ownerId, workspaceId } = crmWorkspaceContext(res);
  const parsed = CreateCrmAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const startsAt = parsed.data.startsAt;
  const [lead] = await db
    .select()
    .from(crmLeadsTable)
    .where(and(eq(crmLeadsTable.id, parsed.data.leadId), eq(crmLeadsTable.workspaceId, workspaceId)))
    .limit(1);
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const [appointment] = await db
    .insert(crmAppointmentsTable)
    .values({
      ownerId,
      workspaceId,
      leadId: lead.id,
      title: parsed.data.title,
      startsAt,
      type: parsed.data.type,
      status: "Confirmed",
      location: parsed.data.location,
    })
    .returning();
  if (!appointment) {
    res.status(500).json({ error: "Could not book appointment" });
    return;
  }
  await db.insert(crmActivitiesTable).values({
    ownerId,
    workspaceId,
    leadId: lead.id,
    kind: "appointment",
    title: `${parsed.data.type} booked`,
    detail: `Appointment saved for ${startsAt.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}. Reminder delivery is not active until a messaging provider is connected.`,
  });
  res.status(201).json(
    CreateCrmAppointmentResponse.parse({
      id: appointment.id,
      leadId: appointment.leadId,
      leadName: `${lead.firstName} ${lead.lastName}`,
      title: appointment.title,
      startsAt: appointment.startsAt.toISOString(),
      type: appointment.type,
      status: appointment.status,
      location: appointment.location,
    }),
  );
});

router.get("/crm/automations", async (req, res): Promise<void> => {
  const { userId: ownerId, workspaceId } = crmWorkspaceContext(res);
  await ensureSeeded(ownerId, workspaceId);
  const automations = await db
    .select()
    .from(crmAutomationsTable)
    .where(eq(crmAutomationsTable.workspaceId, workspaceId))
    .orderBy(crmAutomationsTable.id);
  res.json(ListCrmAutomationsResponse.parse(automations));
});

router.patch("/crm/automations/:id", requireCrmWorkspaceCapability("manage"), async (req, res): Promise<void> => {
  const { workspaceId } = crmWorkspaceContext(res);
  const params = UpdateCrmAutomationParams.safeParse(req.params);
  const body = UpdateCrmAutomationBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [automation] = await db
    .select()
    .from(crmAutomationsTable)
    .where(
      and(
        eq(crmAutomationsTable.id, params.data.id),
        eq(crmAutomationsTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!automation) {
    res.status(404).json({ error: "Automation not found" });
    return;
  }
  const [updated] = await db
    .update(crmAutomationsTable)
    .set({ active: body.data.active })
    .where(
      and(
        eq(crmAutomationsTable.id, params.data.id),
        eq(crmAutomationsTable.workspaceId, workspaceId),
      ),
    )
    .returning();
  res.json(UpdateCrmAutomationResponse.parse(updated));
});

router.get("/crm/reports", async (req, res): Promise<void> => {
  const { userId: ownerId, workspaceId } = crmWorkspaceContext(res);
  await ensureSeeded(ownerId, workspaceId);
  const leads = await db.select().from(crmLeadsTable).where(eq(crmLeadsTable.workspaceId, workspaceId));
  const sourceCounts = new Map<string, number>();
  const monthly = new Map<string, number>();
  for (const lead of leads) {
    sourceCounts.set(lead.source, (sourceCounts.get(lead.source) ?? 0) + 1);
    if (lead.stage === WON_STAGE && lead.revenueWon != null) {
      const month = lead.updatedAt.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }).slice(0, 7);
      monthly.set(month, (monthly.get(month) ?? 0) + lead.revenueWon);
    }
  }
  const monthLabels = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    return date.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }).slice(0, 7);
  });
  const wonCount = leads.filter((lead) => lead.stage === WON_STAGE).length;
  const response = {
    monthlyRevenue: monthLabels.map((month) => ({ month, revenue: monthly.get(month) ?? 0 })),
    leadSources: [...sourceCounts.entries()]
      .map(([source, count]) => ({ source, leads: count }))
      .sort((a, b) => b.leads - a.leads),
    funnel: PIPELINE_STAGES.map((stage) => ({
      stage,
      leads: leads.filter((lead) => lead.stage === stage).length,
    })),
    totalLeads: leads.length,
    conversionRate: leads.length ? Math.round((wonCount / leads.length) * 1000) / 10 : 0,
  };
  res.json(GetCrmReportsResponse.parse(response));
});

router.post("/crm/qualify", async (req, res): Promise<void> => {
  const parsed = QualifyCrmLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const leadBrief = {
    segment: parsed.data.segment,
    intent: parsed.data.intent,
    source: parsed.data.source,
    city: parsed.data.city,
    province: parsed.data.province,
    budgetMin: parsed.data.budgetMin,
    budgetMax: parsed.data.budgetMax,
    notes: parsed.data.notes.slice(0, 3000),
  };
  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 8192,
      stream: true,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You qualify South African real-estate leads. Evaluate only stated intent, timeframe, budget clarity, and request context; never infer affordability, ethnicity, or protected traits. Return only JSON with score (integer 0-100), summary (one sentence), recommendedStage (one of New, Contacted, Qualified, Viewing booked, Offer, Won, Lost), nextAction (one concrete action for an agent), and draftMessage (a concise, polite English follow-up draft that does not claim to have been sent). Keep POPIA in mind: this is an internal draft, not permission to market.",
        },
        {
          role: "user",
          content: JSON.stringify(leadBrief),
        },
      ],
    });
    let content = "";
    for await (const chunk of stream) content += chunk.choices[0]?.delta?.content ?? "";
    const qualification = QualifyCrmLeadResponse.parse(JSON.parse(content));
    res.json(qualification);
  } catch (error) {
    req.log.error({ err: error }, "AI lead qualification failed");
    res.status(502).json({ error: "AI qualification is temporarily unavailable. Please try again." });
  }
});

export default router;