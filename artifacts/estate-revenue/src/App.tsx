import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, ArrowRight, BarChart3, Bell, CalendarDays, Check, ChevronDown, CircleAlert, CircleCheck,
  Clock3, Filter, Gauge, House, LayoutDashboard, Loader2, LogOut, Mail, MapPin, Menu, MessageSquare,
  MoreHorizontal, Phone, Plus, RefreshCw, Search, Settings2, SlidersHorizontal, Sparkles, Target,
  ToggleLeft, TrendingUp, UserRound, Users, X,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import {
  CrmLeadIntent, CrmLeadSegment, getGetCrmDashboardQueryKey, getGetCrmReportsQueryKey,
  getListCrmAppointmentsQueryKey, getListCrmAutomationsQueryKey, getListCrmLeadsQueryKey,
  getListCrmWorkspaceMembersQueryKey,
  getListLeadActivitiesQueryKey, useCreateCrmAppointment, useCreateCrmLead, useCreateLeadActivity,
  useAcceptCrmWorkspaceInvitation, useCreateCrmWorkspace, useInviteCrmWorkspaceMember,
  useListCrmWorkspaceMembers, useRemoveCrmWorkspaceMember, useUpdateCrmWorkspaceMember,
  useGetCrmDashboard, useGetCrmReports, useListCrmAppointments, useListCrmAutomations,
  useListCrmLeads, useListLeadActivities, useQualifyCrmLead, useUpdateCrmAutomation,
  useUpdateCrmLead,
  type CrmAppointment, type CrmLead, type CrmLeadInput,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { useWorkspace, WorkspaceProvider } from '@/components/workspace-provider';
import { WorkspaceSettingsContent } from '@/components/workspace-settings';
import NotFound from '@/pages/not-found';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in the environment.');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#0079d8',
    colorForeground: '#0d1b2a',
    colorMutedForeground: '#5f6f80',
    colorDanger: '#b6403b',
    colorBackground: '#f7f9fb',
    colorInput: '#ffffff',
    colorInputForeground: '#0d1b2a',
    colorNeutral: '#10243b',
    fontFamily: "'Instrument Sans', sans-serif",
    borderRadius: '3px',
  },
  elements: {
    rootBox: 'flex w-full justify-center',
    cardBox: 'w-[440px] max-w-full overflow-hidden rounded-sm border border-[#d7dee6] bg-[#ffffff] shadow-[0_24px_60px_rgba(13,27,42,.10)]',
    card: '!rounded-none !border-0 !bg-transparent !shadow-none',
    footer: '!rounded-none !border-0 !bg-transparent !shadow-none',
    headerTitle: 'font-display text-3xl text-[#0d1b2a]',
    headerSubtitle: 'text-[#5f6f80]',
    socialButtonsBlockButtonText: 'font-medium text-[#0d1b2a]',
    formFieldLabel: 'font-medium text-[#26384b]',
    footerActionLink: 'font-semibold text-[#0079d8]',
    footerActionText: 'text-[#5f6f80]',
    dividerText: 'text-[#5f6f80]',
    identityPreviewEditButton: 'font-medium text-[#0079d8]',
    formFieldSuccessText: 'text-[#0079d8]',
    alertText: 'text-[#b6403b]',
    logoBox: 'mb-3',
    logoImage: 'h-9 w-9',
    socialButtonsBlockButton: 'border-[#d7dee6] bg-[#f7f9fb] hover:bg-[#edf4f8]',
    formButtonPrimary: 'bg-[#0079d8] text-white hover:bg-[#0068bd]',
    formFieldInput: 'border-[#c8d0d9] bg-white text-[#0d1b2a] placeholder:text-[#8290a0] focus:border-[#0079d8]',
    footerAction: 'text-[#5f6f80]',
    dividerLine: 'bg-[#d7dee6]',
    alert: 'border-[#ebc8c5] bg-[#fff7f6]',
    otpCodeFieldInput: 'border-[#c8d0d9] bg-white text-[#0d1b2a]',
    formFieldRow: 'text-[#26384b]',
    main: 'text-[#0d1b2a]',
  },
};

const stageList = ['New', 'Contacted', 'Qualified', 'Viewing booked', 'Offer', 'Won', 'Lost'];
const navItems = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/appointments', label: 'Appointments', icon: CalendarDays },
  { href: '/automations', label: 'Automations', icon: SlidersHorizontal },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
];

const zar = (value?: number | null) => value == null ? '—' : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value);
const compactZar = (value: number) => `R${new Intl.NumberFormat('en-ZA', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`;
const reportChartColors = ['#0079D8', '#00B8D9', '#345E8B', '#59CBE8', '#638AA1'] as const;
const dateLabel = (value?: string) => value ? new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date(value)) : '—';
const timeLabel = (value?: string) => value ? new Intl.DateTimeFormat('en-ZA', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' }).format(new Date(value)) : '—';
const initials = (lead: Pick<CrmLead, 'firstName' | 'lastName'>) => `${lead.firstName[0] ?? ''}${lead.lastName[0] ?? ''}`.toUpperCase();

function IconMark() {
  return <div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-[3px] bg-[#0d1b2a] text-white" aria-label="Estate Revenue Platform logo"><span className="absolute bottom-1 left-1.5 h-px w-5 bg-[#38d8f1]" /><span className="font-display text-[22px] leading-none">E</span></div>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();
  const { workspaces, currentWorkspace, selectWorkspace } = useWorkspace();
  const displayName = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'Workspace member';
  const shortName = user?.firstName ?? displayName.split(' ')[0];
  const userInitials = displayName.split(/[ @]/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return (
    <div className="min-h-[100dvh] bg-background">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[274px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[84px] items-center gap-3 border-b border-sidebar-border px-6">
          <IconMark />
          <div className="min-w-0">
             <div className="font-display text-[16px] tracking-tight text-sidebar-accent-foreground">Estate Revenue Platform</div>
             <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.19em] text-sidebar-foreground/45">Revenue intelligence</div>
          </div>
          <button className="ml-auto rounded p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent md:hidden" onClick={() => setMobileOpen(false)} data-testid="button-close-navigation" aria-label="Close navigation"><X size={16} /></button>
        </div>
        <div className="px-4 pt-7">
             <div className="mb-5 rounded-[3px] border border-sidebar-border bg-sidebar-accent/55 p-3.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/45">Current workspace</span>
              <span className="h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
            </div>
            <select
              aria-label="Current workspace"
              data-testid="select-current-workspace"
              value={currentWorkspace?.id ?? ''}
              onChange={(event) => void selectWorkspace(Number(event.target.value))}
              className="mt-2 w-full truncate rounded-sm border border-sidebar-border bg-sidebar px-2 py-2 text-xs text-sidebar-foreground"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
            <div className="mt-1 text-[10px] capitalize text-sidebar-foreground/50">
              {currentWorkspace?.role ?? 'Member'} · {currentWorkspace?.memberCount ?? 0} members
            </div>
          </div>
          <p className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/40">Workday</p>
           <nav className="space-y-0.5">
            {navItems.map(({ href, label, icon: NavIcon }) => {
              const active = href === '/overview' ? location === '/overview' || location === '/' : location.startsWith(href);
               return <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-sm px-3 py-3 text-[13px] font-medium transition-colors ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground'}`} data-testid={`link-nav-${label.toLowerCase()}`}>
                <NavIcon size={16} strokeWidth={active ? 2.3 : 1.7} /><span>{label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
              </Link>;
            })}
          </nav>
        </div>
        <div className="mt-auto px-4 pb-6">
          <div className="mb-4 flex items-center gap-2 px-3 text-[10px] text-sidebar-foreground/45"><Clock3 size={12} /><span>Local time</span><span className="ml-auto font-mono text-sidebar-foreground/70">{new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' }).format(new Date())} SAST</span></div>
           <div className="mb-4 rounded-[3px] border border-sidebar-border bg-sidebar-accent/50 p-3">
            <div className="mb-2 flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-wider text-sidebar-foreground/50">Workspace note</span><span className="h-1.5 w-1.5 rounded-full bg-sidebar-primary" /></div>
            <div className="text-xs leading-relaxed text-sidebar-foreground/75">Keep consent visible before the next touch.</div>
          </div>
          <Link href="/workspace" onClick={() => setMobileOpen(false)} className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-xs text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="button-workspace-settings"><Settings2 size={15} />Workspace & members</Link>
          <div className="mt-4 flex items-center gap-3 border-t border-sidebar-border pt-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/25 font-mono text-[11px] text-sidebar-accent-foreground">{userInitials || 'ER'}</div>
            <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium text-sidebar-accent-foreground">{displayName}</div><div className="text-[10px] text-sidebar-foreground/45">Workspace member</div></div>
            <button onClick={() => void signOut({ redirectUrl: basePath || '/' })} className="rounded-sm p-1.5 text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" aria-label="Sign out" title="Sign out" data-testid="button-sign-out"><LogOut size={14} /></button>
          </div>
        </div>
      </aside>
      {mobileOpen && <button aria-label="Close menu" className="fixed inset-0 z-30 bg-foreground/20 md:hidden" onClick={() => setMobileOpen(false)} data-testid="button-dismiss-menu" />}
       <main className="md:pl-[274px]">
         <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border bg-background/90 px-5 backdrop-blur-xl md:px-9">
          <div className="flex items-center gap-3"><button className="rounded-lg p-2 text-muted-foreground hover:bg-secondary md:hidden" onClick={() => setMobileOpen(true)} data-testid="button-open-navigation" aria-label="Open navigation"><Menu size={19} /></button><div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground md:flex"><span className="h-1.5 w-1.5 rounded-full bg-primary" />South Africa <span className="text-border">/</span> revenue operations</div></div>
          <div className="flex items-center gap-4"><div className="hidden max-w-[240px] items-center gap-2 truncate rounded-full border border-border bg-card px-3 py-1.5 text-[10px] text-muted-foreground sm:flex"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /><span className="truncate">{currentWorkspace?.name ?? 'Workspace'} · {currentWorkspace?.role ?? 'member'}</span></div><button className="relative rounded-lg p-2 text-muted-foreground hover:bg-secondary" data-testid="button-notifications" aria-label="Notifications"><Bell size={17} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" /></button><div className="hidden h-5 w-px bg-border sm:block" /><div className="hidden items-center gap-2 sm:flex"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/70 font-mono text-[10px] text-foreground">{userInitials || 'ER'}</div><span className="max-w-[160px] truncate text-xs font-semibold">{shortName}</span></div></div>
        </header>
        {children}
      </main>
    </div>
  );
}

function PageHead({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 border-b border-border pb-7 md:flex-row md:items-end"><div className="desk-rule pl-4"><div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">{eyebrow}</div><h1 className="font-display text-5xl leading-[.95] tracking-[-0.045em] text-foreground md:text-[58px]">{title}</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{detail}</p></div>{action}</div>;
}

function Button({ children, onClick, variant = 'primary', className = '', type = 'button', disabled = false, testId }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'outline' | 'quiet'; className?: string; type?: 'button' | 'submit'; disabled?: boolean; testId?: string }) {
  const styles = variant === 'primary' ? 'bg-primary text-primary-foreground shadow-sm hover:-translate-y-0.5 hover:shadow-md' : variant === 'outline' ? 'border border-border bg-card text-foreground hover:-translate-y-0.5 hover:bg-secondary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground';
  return <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-2 rounded-[3px] px-3.5 py-2.5 text-xs font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`} data-testid={testId}>{children}</button>;
}

function MetricCard({ label, value, note, icon: MetricIcon, accent = false }: { label: string; value: string; note: string; icon: typeof TrendingUp; accent?: boolean }) {
  return <div className={`metric-signal relative overflow-hidden border border-border p-5 transition-transform duration-200 ${accent ? 'border-primary/55 bg-primary/10' : ''}`} data-testid={`metric-${label.toLowerCase().replace(/\s/g, '-')}`}><div className="flex items-start justify-between"><span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</span><MetricIcon size={16} className={accent ? 'text-accent' : 'text-muted-foreground'} strokeWidth={1.7} /></div><div className="mt-4 font-display text-[32px] tracking-tight">{value}</div><div className="mt-1 text-xs text-muted-foreground">{note}</div>{accent && <div className="absolute -bottom-5 -right-4 h-20 w-20 rounded-full border-[10px] border-primary/20" />}</div>;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-secondary ${className}`} />;
}

function QueryState({ loading, error, onRetry, children }: { loading: boolean; error: unknown; onRetry: () => void; children: ReactNode }) {
  if (loading) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-44 w-full" /></div>;
  if (error) return <div className="flex items-center justify-between rounded-sm border border-destructive/25 bg-destructive/5 p-4 text-sm"><span className="flex items-center gap-2 text-destructive"><CircleAlert size={16} />Could not load this workspace view.</span><Button variant="outline" onClick={onRetry} testId="button-retry"><RefreshCw size={14} />Retry</Button></div>;
  return <>{children}</>;
}

function Dashboard() {
  const dashboard = useGetCrmDashboard();
  const { user } = useUser();
  const data = dashboard.data;
  const maxStage = Math.max(...(data?.stageCounts?.map((s) => s.count) ?? [1]));
  const today = new Intl.DateTimeFormat('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date());
  return <Shell><div className="hairline-grid min-h-[calc(100dvh-76px)] px-5 py-8 md:px-9 md:py-10"><div className="mx-auto max-w-[1400px]"><PageHead eyebrow={`${today} · Johannesburg`} title={`Welcome back, ${user?.firstName ?? 'there'}.`} detail="The revenue desk is clear on the next best move. Here is how the portfolio is moving today." action={<Link href="/leads" className="inline-flex items-center gap-2 rounded-sm bg-foreground px-4 py-2.5 text-xs font-semibold text-background hover:opacity-90" data-testid="link-dashboard-leads">Open lead desk <ArrowRight size={14} /></Link>} /><QueryState loading={dashboard.isLoading} error={dashboard.error} onRetry={() => dashboard.refetch()}>{data && <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><MetricCard label="New leads" value={String(data.newLeads)} note="since yesterday" icon={Users} /><MetricCard label="Qualified" value={String(data.qualified)} note="ready for human follow-up" icon={Target} accent /><MetricCard label="Appointments" value={String(data.appointments)} note="next 7 days" icon={CalendarDays} /><MetricCard label="Pipeline value" value={zar(data.pipelineValue)} note="active opportunities" icon={TrendingUp} /><MetricCard label="Revenue won" value={zar(data.revenueWon)} note="this financial year" icon={BarChart3} /><MetricCard label="Follow-ups due" value={String(data.followUpsDue)} note="needs attention today" icon={Clock3} /></div><div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><section className="rounded-sm border border-border bg-card p-5 md:p-6"><div className="mb-7 flex items-start justify-between"><div><div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Funnel health</div><h2 className="mt-1 font-display text-lg font-bold">Where value is sitting</h2></div><Link href="/reports" className="text-xs font-semibold text-accent hover:underline" data-testid="link-dashboard-reports">View reports <ArrowRight className="ml-1 inline" size={13} /></Link></div><div className="space-y-4">{data.stageCounts.map((stage, index) => <div className="grid grid-cols-[112px_1fr_42px] items-center gap-3" key={stage.stage} data-testid={`funnel-stage-${index}`}><span className="truncate text-xs text-muted-foreground">{stage.stage}</span><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${index === 2 ? 'bg-primary' : 'bg-accent/70'}`} style={{ width: `${Math.max(5, (stage.count / maxStage) * 100)}%` }} /></div><span className="font-mono text-xs text-right">{stage.count}</span></div>)}</div><div className="mt-8 grid grid-cols-3 gap-3 border-t border-border pt-5"><div><div className="font-mono text-[10px] text-muted-foreground">QUALIFICATION RATE</div><div className="mt-1 font-display text-lg font-bold">{data.newLeads ? Math.round((data.qualified / data.newLeads) * 100) : 0}%</div></div><div><div className="font-mono text-[10px] text-muted-foreground">BOOKING RATE</div><div className="mt-1 font-display text-lg font-bold">{data.qualified ? Math.round((data.appointments / data.qualified) * 100) : 0}%</div></div><div><div className="font-mono text-[10px] text-muted-foreground">ACTIVE TOUCHES</div><div className="mt-1 font-display text-lg font-bold">{data.followUpsDue}</div></div></div></section><section className="rounded-sm border border-border bg-card p-5 md:p-6"><div className="mb-6 flex items-start justify-between"><div><div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Coming up</div><h2 className="mt-1 font-display text-lg font-bold">Appointments</h2></div><Link href="/appointments" className="rounded-sm p-1.5 text-muted-foreground hover:bg-secondary" data-testid="link-dashboard-appointments"><ArrowRight size={16} /></Link></div><div className="space-y-1">{data.upcomingAppointments.length ? data.upcomingAppointments.slice(0, 5).map((item) => <AppointmentRow key={item.id} item={item} compact />) : <EmptyState icon={CalendarDays} title="No upcoming viewings" detail="Booked appointments will appear here." />}</div></section></div></>}</QueryState></div></div></Shell>;
}

function AppointmentRow({ item, compact = false }: { item: CrmAppointment; compact?: boolean }) {
  const localDate = new Intl.DateTimeFormat('en-ZA', { month: 'short', day: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date(item.startsAt)).split(' ');
  return <div className={`flex gap-3 border-b border-border/70 py-3 last:border-0 ${compact ? '' : 'rounded-xl border px-4'}`} data-testid={`appointment-row-${item.id}`}><div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/20 text-accent"><span className="font-mono text-[9px] uppercase">{localDate[0]}</span><span className="font-display text-sm font-bold leading-3">{localDate[1]}</span></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{item.title}</div><div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground"><UserRound size={11} />{item.leadName} <span className="text-border">·</span> {item.location}</div><div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-muted-foreground"><Clock3 size={10} />{timeLabel(item.startsAt)}</div></div><span className={`h-fit rounded-full px-2 py-1 font-mono text-[9px] uppercase tracking-wider ${item.status === 'confirmed' ? 'bg-primary/20 text-accent' : 'bg-secondary text-muted-foreground'}`}>{item.status}</span></div>;
}

function EmptyState({ icon: EmptyIcon, title, detail }: { icon: typeof CalendarDays; title: string; detail: string }) {
  return <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-border px-6 py-12 text-center"><EmptyIcon size={23} className="text-muted-foreground/60" /><h3 className="mt-3 text-sm font-semibold">{title}</h3><p className="mt-1 max-w-xs text-xs text-muted-foreground">{detail}</p></div>;
}

function Leads() {
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<string>('');
  const [stage, setStage] = useState<string>('');
  const [selected, setSelected] = useState<CrmLead | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const params = useMemo(() => ({ search: search || undefined, segment: (segment || undefined) as 'B2C' | 'B2B' | undefined, stage: stage || undefined }), [search, segment, stage]);
  const leads = useListCrmLeads(params);
  return <Shell><div className="min-h-[calc(100dvh-84px)] px-5 py-8 md:px-9 md:py-10"><div className="mx-auto max-w-[1450px]"><PageHead eyebrow="Revenue desk / pipeline" title="Leads" detail="One focused queue for buyer, seller, tenant, landlord, developer and partner conversations across South Africa." action={<Button onClick={() => setCaptureOpen(true)} testId="button-open-capture"><Plus size={15} />Capture lead</Button>} /><div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 soft-shadow md:flex-row"><div className="relative min-w-0 flex-1"><Search size={15} className="absolute left-3 top-3 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search names, email, city or source…" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-xs outline-none ring-accent focus:ring-2" data-testid="input-search-leads" /></div><div className="flex gap-2"><select value={segment} onChange={(e) => setSegment(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-xs outline-none" data-testid="select-lead-segment"><option value="">All segments</option><option value="B2C">B2C</option><option value="B2B">B2B</option></select><select value={stage} onChange={(e) => setStage(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-xs outline-none" data-testid="select-lead-stage"><option value="">All stages</option>{stageList.map((item) => <option key={item}>{item}</option>)}</select><Button variant="quiet" className="rounded-lg px-2" testId="button-filter-leads"><Filter size={15} /></Button></div></div><QueryState loading={leads.isLoading} error={leads.error} onRetry={() => leads.refetch()}>{<div className="grid gap-5 xl:grid-cols-[1fr_390px]"><div className="overflow-hidden rounded-xl border border-border bg-card soft-shadow"><div className="flex items-center justify-between border-b border-border px-4 py-3"><span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{leads.data?.length ?? 0} active records</span><span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><CircleCheck size={13} className="text-accent" />Consent visible</span></div>{leads.data?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-secondary/50 font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Lead</th><th className="px-4 py-3 font-medium">Intent</th><th className="px-4 py-3 font-medium">Stage</th><th className="px-4 py-3 font-medium">Value band</th><th className="px-4 py-3 font-medium">Score</th><th className="px-4 py-3 font-medium">Consent</th></tr></thead><tbody>{leads.data.map((lead) => <tr key={lead.id} onClick={() => setSelected(lead)} className={`cursor-pointer border-t border-border/70 transition-colors hover:bg-primary/10 ${selected?.id === lead.id ? 'bg-primary/10' : ''}`} data-testid={`row-lead-${lead.id}`}><td className="px-4 py-3.5"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 font-mono text-[10px] font-medium">{initials(lead)}</div><div><div className="text-xs font-semibold">{lead.firstName} {lead.lastName}</div><div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground"><MapPin size={10} />{lead.city}, {lead.province}</div></div></div></td><td className="px-4 py-3.5"><div className="text-xs font-medium">{lead.intent}</div><div className="mt-0.5 font-mono text-[9px] text-muted-foreground">{lead.segment} · {lead.source}</div></td><td className="px-4 py-3.5"><span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-medium">{lead.stage}</span></td><td className="px-4 py-3.5 font-mono text-[11px] text-muted-foreground">{lead.budgetMax ? `${zar(lead.budgetMin)} – ${zar(lead.budgetMax)}` : 'Not set'}</td><td className="px-4 py-3.5"><span className={`font-mono text-xs font-medium ${lead.score >= 70 ? 'text-accent' : 'text-foreground'}`}>{lead.score}</span></td><td className="px-4 py-3.5">{lead.consent ? <span className="flex items-center gap-1 text-[10px] text-accent"><Check size={13} />Opted in</span> : <span className="flex items-center gap-1 text-[10px] text-destructive"><X size={13} />Opted out</span>}</td></tr>)}</tbody></table></div> : <EmptyState icon={Users} title="No leads match this view" detail="Adjust your filters or capture a new conversation." />}</div>{selected ? <LeadDetail lead={selected} onClose={() => setSelected(null)} /> : <div className="hidden xl:block"><EmptyState icon={ArrowRight} title="Select a lead" detail="Activity, qualification and next action will appear here." /></div>}</div>}</QueryState></div></div>{captureOpen && <CaptureLead onClose={() => setCaptureOpen(false)} />}</Shell>;
}

function LeadDetail({ lead, onClose }: { lead: CrmLead; onClose: () => void }) {
  const activities = useListLeadActivities(lead.id);
  const qualify = useQualifyCrmLead();
  const updateLead = useUpdateCrmLead();
  const createActivity = useCreateLeadActivity();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [qual, setQual] = useState<{ summary: string; nextAction: string; draftMessage: string; score: number } | null>(null);
  const runQualification = () => qualify.mutate({ data: { firstName: lead.firstName, lastName: lead.lastName, segment: lead.segment, intent: lead.intent, source: lead.source, city: lead.city, province: lead.province, budgetMin: lead.budgetMin, budgetMax: lead.budgetMax, notes: lead.nextAction ?? '' } }, { onSuccess: (result) => setQual(result) }); 
  const advance = () => { const index = stageList.indexOf(lead.stage); const next = stageList[Math.min(index + 1, stageList.length - 1)]; updateLead.mutate({ id: lead.id, data: { stage: next } }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListCrmLeadsQueryKey() }) }); };
  const addNote = (event: FormEvent) => { event.preventDefault(); if (!note.trim()) return; createActivity.mutate({ id: lead.id, data: { kind: 'note', title: 'Desk note', detail: note.trim() } }, { onSuccess: () => { setNote(''); qc.invalidateQueries({ queryKey: getListLeadActivitiesQueryKey(lead.id) }); } }); };
  return <aside className="rounded-sm border border-border bg-card xl:sticky xl:top-[100px] xl:h-[calc(100dvh-120px)] xl:overflow-y-auto" data-testid={`panel-lead-${lead.id}`}><div className="flex items-start justify-between border-b border-border p-5"><div><div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d9f4f8] font-mono text-xs text-[#0d5f75]">{initials(lead)}</div><div><h2 className="font-display text-lg font-bold">{lead.firstName} {lead.lastName}</h2><div className="font-mono text-[10px] text-muted-foreground">LEAD #{String(lead.id).padStart(4, '0')}</div></div></div></div><button onClick={onClose} className="rounded-sm p-1 text-muted-foreground hover:bg-secondary" data-testid="button-close-lead"><X size={16} /></button></div><div className="space-y-5 p-5"><div className="grid grid-cols-2 gap-2"><div className="rounded-sm bg-secondary/70 p-3"><div className="font-mono text-[9px] uppercase text-muted-foreground">Score</div><div className="mt-1 font-display text-xl font-bold text-accent">{lead.score}<span className="font-sans text-xs font-normal text-muted-foreground"> / 100</span></div></div><div className="rounded-sm bg-secondary/70 p-3"><div className="font-mono text-[9px] uppercase text-muted-foreground">Consent</div><div className={`mt-2 flex items-center gap-1 text-xs font-semibold ${lead.consent ? 'text-accent' : 'text-destructive'}`}>{lead.consent ? <><Check size={14} />Opted in</> : <><X size={14} />Opted out</>}</div></div></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium">{lead.intent}</span><span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium">{lead.segment}</span><span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium">{lead.stage}</span></div><div className="grid gap-2 text-xs"><div className="flex justify-between gap-3 border-b border-border/70 pb-2"><span className="text-muted-foreground">Contact</span><span className="text-right">{lead.email ?? lead.phone ?? 'No contact detail'}</span></div><div className="flex justify-between gap-3 border-b border-border/70 pb-2"><span className="text-muted-foreground">Location</span><span>{lead.city}, {lead.province}</span></div><div className="flex justify-between gap-3 border-b border-border/70 pb-2"><span className="text-muted-foreground">Budget</span><span className="font-mono">{zar(lead.budgetMin)} – {zar(lead.budgetMax)}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Source</span><span>{lead.source}</span></div></div><div className="flex gap-2"><Button className="flex-1" onClick={advance} disabled={updateLead.isPending || lead.stage === 'Won'} testId="button-advance-lead"><ArrowRight size={14} />{lead.stage === 'Won' ? 'Closed won' : 'Advance stage'}</Button><Button variant="outline" onClick={runQualification} disabled={qualify.isPending} testId="button-qualify-lead">{qualify.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Qualify</Button></div>{qual && <div className="rounded-sm border border-primary/50 bg-[#e9f7fb] p-3.5" data-testid="panel-qualification"><div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-accent"><Sparkles size={12} />AI qualification</span><span className="font-mono text-xs font-bold">{qual.score}/100</span></div><p className="text-xs leading-relaxed">{qual.summary}</p><div className="mt-3 border-t border-primary/20 pt-3 text-xs"><strong>Next move:</strong> {qual.nextAction}</div><button className="mt-3 text-[11px] font-semibold text-accent hover:underline" onClick={() => navigator.clipboard?.writeText(qual.draftMessage)} data-testid="button-copy-draft">Copy draft message</button></div>}<div><div className="mb-3 flex items-center justify-between"><h3 className="font-display text-sm font-bold">Activity</h3><span className="font-mono text-[10px] text-muted-foreground">{activities.data?.length ?? 0} events</span></div><form onSubmit={addNote} className="mb-4 flex gap-2"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a desk note…" className="min-w-0 flex-1 rounded-sm border border-input bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-accent" data-testid="input-lead-note" /><button className="rounded-sm bg-secondary px-2.5 text-muted-foreground hover:bg-primary hover:text-primary-foreground" type="submit" data-testid="button-add-note"><Plus size={14} /></button></form><div className="space-y-0">{activities.isLoading ? <Skeleton className="h-20 w-full" /> : activities.data?.length ? activities.data.map((item) => <div className="relative border-l border-border py-2 pl-4" key={item.id} data-testid={`activity-${item.id}`}><span className="absolute -left-[4px] top-3 h-1.5 w-1.5 rounded-full bg-accent" /><div className="text-xs font-semibold">{item.title}</div><div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{item.detail}</div><div className="mt-1 font-mono text-[9px] uppercase text-muted-foreground/70">{dateLabel(item.createdAt)} · {item.kind}</div></div>) : <p className="text-xs text-muted-foreground">No activity recorded yet.</p>}</div></div></div></aside>;
}

function CaptureLead({ onClose }: { onClose: () => void }) {
  const create = useCreateCrmLead();
  const qualify = useQualifyCrmLead();
  const qc = useQueryClient();
  const [form, setForm] = useState<CrmLeadInput>({ firstName: '', lastName: '', email: '', phone: '', segment: 'B2C', intent: 'Buyer', source: 'Website', city: 'Johannesburg', province: 'Gauteng', budgetMin: null, budgetMax: null, consent: true, nextAction: '' });
  const [qualification, setQualification] = useState<{ score: number; summary: string; nextAction: string } | null>(null);
  const set = (key: keyof CrmLeadInput, value: string | number | boolean | null) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); create.mutate({ data: form }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListCrmLeadsQueryKey() }); qc.invalidateQueries({ queryKey: getGetCrmDashboardQueryKey() }); onClose(); } }); };
  const aiQualify = () => qualify.mutate({ data: { firstName: form.firstName, lastName: form.lastName, segment: form.segment, intent: form.intent, source: form.source, city: form.city, province: form.province, budgetMin: form.budgetMin, budgetMax: form.budgetMax, notes: form.nextAction ?? '' } }, { onSuccess: setQualification });
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/25 sm:items-center" data-testid="dialog-capture-lead"><div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-md border border-border bg-card p-6 shadow-xl sm:max-w-[620px] sm:rounded-sm"><div className="mb-6 flex items-start justify-between"><div><div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">New conversation</div><h2 className="mt-1 font-display text-2xl font-bold">Capture a lead</h2><p className="mt-1 text-xs text-muted-foreground">Record the minimum context your team needs to move quickly.</p></div><button onClick={onClose} className="rounded-sm p-1 text-muted-foreground hover:bg-secondary" data-testid="button-close-capture"><X size={17} /></button></div><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-medium">First name<input required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} className="mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-accent" data-testid="input-lead-first-name" /></label><label className="text-xs font-medium">Last name<input required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} className="mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-accent" data-testid="input-lead-last-name" /></label><label className="text-xs font-medium">Email<input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} className="mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-accent" data-testid="input-lead-email" /></label><label className="text-xs font-medium">Phone<input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="+27 82 000 0000" className="mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-accent" data-testid="input-lead-phone" /></label><label className="text-xs font-medium">Segment<select value={form.segment} onChange={(e) => set('segment', e.target.value)} className="mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-xs outline-none" data-testid="select-capture-segment"><option>B2C</option><option>B2B</option></select></label><label className="text-xs font-medium">Intent<select value={form.intent} onChange={(e) => set('intent', e.target.value)} className="mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-xs outline-none" data-testid="select-capture-intent">{Object.values(CrmLeadIntent).map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-medium">City<input value={form.city} onChange={(e) => set('city', e.target.value)} className="mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-accent" data-testid="input-lead-city" /></label><label className="text-xs font-medium">Province<input value={form.province} onChange={(e) => set('province', e.target.value)} className="mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-accent" data-testid="input-lead-province" /></label><label className="text-xs font-medium">Budget from (ZAR)<input type="number" value={form.budgetMin ?? ''} onChange={(e) => set('budgetMin', e.target.value ? Number(e.target.value) : null)} className="mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-accent" data-testid="input-lead-budget-min" /></label><label className="text-xs font-medium">Budget to (ZAR)<input type="number" value={form.budgetMax ?? ''} onChange={(e) => set('budgetMax', e.target.value ? Number(e.target.value) : null)} className="mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-accent" data-testid="input-lead-budget-max" /></label><label className="sm:col-span-2 text-xs font-medium">Source<input value={form.source} onChange={(e) => set('source', e.target.value)} className="mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-accent" data-testid="input-lead-source" /></label><label className="sm:col-span-2 text-xs font-medium">Context / next action<textarea value={form.nextAction ?? ''} onChange={(e) => set('nextAction', e.target.value)} rows={3} placeholder="What did they ask for? What should happen next?" className="mt-1.5 w-full rounded-sm border border-input bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-accent" data-testid="textarea-lead-context" /></label><label className="sm:col-span-2 flex cursor-pointer items-start gap-2 rounded-sm border border-border bg-secondary/50 p-3 text-xs"><input type="checkbox" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} className="mt-0.5 accent-[hsl(var(--primary))]" data-testid="checkbox-lead-consent" /><span><strong>Consent recorded</strong><span className="mt-0.5 block text-muted-foreground">This contact may receive relevant follow-up. Respect opt-out requests.</span></span></label>{qualification && <div className="sm:col-span-2 rounded-sm bg-[#f3f6e6] p-3 text-xs" data-testid="capture-qualification"><div className="flex justify-between font-semibold"><span>Suggested qualification</span><span className="font-mono text-accent">{qualification.score}/100</span></div><p className="mt-1 text-muted-foreground">{qualification.summary}</p><p className="mt-2"><strong>Next:</strong> {qualification.nextAction}</p></div>}<div className="sm:col-span-2 flex items-center justify-between border-t border-border pt-4"><Button variant="quiet" onClick={aiQualify} disabled={qualify.isPending || !form.firstName || !form.lastName} testId="button-ai-qualify-capture"><Sparkles size={14} />{qualify.isPending ? 'Scoring…' : 'Score with AI'}</Button><div className="flex gap-2"><Button variant="outline" onClick={onClose} testId="button-cancel-capture">Cancel</Button><Button type="submit" disabled={create.isPending} testId="button-submit-capture">{create.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Save lead</Button></div></div></form></div></div>;
}

function Appointments() {
  const appointments = useListCrmAppointments();
  const leads = useListCrmLeads();
  const create = useCreateCrmAppointment();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ leadId: '', title: 'Property viewing', startsAt: '', type: 'Viewing', location: 'TBC' });
  const submit = (event: FormEvent) => { event.preventDefault(); create.mutate({ data: { ...form, leadId: Number(form.leadId) } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListCrmAppointmentsQueryKey() }); qc.invalidateQueries({ queryKey: getGetCrmDashboardQueryKey() }); setOpen(false); } }); };
  const grouped = useMemo(() => { const list = appointments.data ?? []; return { upcoming: list.filter((item) => new Date(item.startsAt) >= new Date()), past: list.filter((item) => new Date(item.startsAt) < new Date()) }; }, [appointments.data]);
  return <Shell><div className="min-h-[calc(100dvh-76px)] px-5 py-8 md:px-9 md:py-10"><div className="mx-auto max-w-[1200px]"><PageHead eyebrow="Revenue desk / calendar" title="Appointments" detail="Protect the handoff from intent to in-person. Every booking has an owner, place and next reminder." action={<Button onClick={() => setOpen(true)} testId="button-open-appointment"><Plus size={15} />Book appointment</Button>} /><QueryState loading={appointments.isLoading} error={appointments.error} onRetry={() => appointments.refetch()}><div className="grid gap-5 lg:grid-cols-[1fr_330px]"><section className="rounded-sm border border-border bg-card p-5 md:p-6"><div className="mb-5 flex items-center justify-between"><div><div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Next 7 days</div><h2 className="mt-1 font-display text-lg font-bold">{grouped.upcoming.length} booked appointments</h2></div><div className="flex items-center gap-1.5 text-xs text-accent"><span className="h-2 w-2 rounded-full bg-primary" />Reminders monitored</div></div>{grouped.upcoming.length ? <div>{grouped.upcoming.map((item) => <AppointmentRow item={item} key={item.id} />)}</div> : <EmptyState icon={CalendarDays} title="Calendar is clear" detail="Book a viewing, valuation or developer meeting to keep momentum." />}<div className="mt-8 border-t border-border pt-5"><div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Recently completed</div>{grouped.past.slice(0, 4).map((item) => <AppointmentRow item={item} key={item.id} />)}{!grouped.past.length && <p className="text-xs text-muted-foreground">No completed appointments in this workspace.</p>}</div></section><aside className="space-y-4"><div className="rounded-sm border border-border bg-foreground p-5 text-background"><div className="flex items-center justify-between"><CalendarDays size={18} className="text-primary" /><span className="font-mono text-[10px] uppercase tracking-wider text-background/50">Booking hygiene</span></div><div className="mt-6 font-display text-4xl font-bold">{grouped.upcoming.length ? '100%' : '—'}</div><p className="mt-1 text-xs text-background/65">of upcoming appointments have a logged location</p><div className="mt-5 border-t border-background/15 pt-4 text-[11px] text-background/60">Outbound reminders are not connected. Use the activity timeline to record calls and confirmations.</div></div><div className="rounded-sm border border-border bg-card p-5"><div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Appointment types</div><div className="mt-4 space-y-3">{['Viewing', 'Valuation', 'Developer meeting'].map((type) => <div className="flex justify-between text-xs" key={type}><span>{type}</span><span className="font-mono text-muted-foreground">{(appointments.data ?? []).filter((item) => item.type === type).length}</span></div>)}</div></div></aside></div></QueryState></div></div>{open && <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/25 sm:items-center"><form onSubmit={submit} className="w-full rounded-t-md border border-border bg-card p-6 sm:max-w-[500px] sm:rounded-sm" data-testid="dialog-book-appointment"><div className="mb-6 flex items-start justify-between"><div><div className="font-mono text-[10px] uppercase tracking-wider text-accent">New booking</div><h2 className="mt-1 font-display text-2xl font-bold">Book appointment</h2></div><button type="button" onClick={() => setOpen(false)} className="p-1 text-muted-foreground" data-testid="button-close-appointment"><X size={17} /></button></div><div className="space-y-4"><label className="block text-xs font-medium">Lead<select required value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })} className="mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-xs" data-testid="select-appointment-lead"><option value="">Select lead</option>{(leads.data ?? []).map((lead) => <option value={lead.id} key={lead.id}>{lead.firstName} {lead.lastName} · {lead.city}</option>)}</select></label><label className="block text-xs font-medium">Title<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-xs" data-testid="input-appointment-title" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-medium">Date & time<input required type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-xs" data-testid="input-appointment-time" /></label><label className="text-xs font-medium">Type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-xs" data-testid="select-appointment-type"><option>Viewing</option><option>Valuation</option><option>Developer meeting</option></select></label></div><label className="block text-xs font-medium">Location<input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. 14 Park Lane, Sandton" className="mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-xs" data-testid="input-appointment-location" /></label></div><div className="mt-6 flex justify-end gap-2 border-t border-border pt-4"><Button variant="outline" onClick={() => setOpen(false)} testId="button-cancel-appointment">Cancel</Button><Button type="submit" disabled={create.isPending} testId="button-submit-appointment">{create.isPending ? 'Booking…' : 'Confirm booking'}</Button></div></form></div>}</Shell>;
}

function Automations() {
  const automations = useListCrmAutomations();
  const update = useUpdateCrmAutomation();
  const qc = useQueryClient();
  const toggle = (id: number, active: boolean) => update.mutate({ id, data: { active: !active } }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListCrmAutomationsQueryKey() }) });
  return <Shell><div className="min-h-[calc(100dvh-76px)] px-5 py-8 md:px-9 md:py-10"><div className="mx-auto max-w-[1200px]"><PageHead eyebrow="Revenue desk / orchestration" title="Automations" detail="Consent-aware plays for the moments that usually leak revenue. Review state before anything leaves the workspace." /><QueryState loading={automations.isLoading} error={automations.error} onRetry={() => automations.refetch()}><div className="mb-5 flex items-center gap-3 rounded-sm border border-primary/30 bg-[#f0f5d8] p-4 text-xs"><CircleCheck size={17} className="shrink-0 text-accent" /><span><strong>Delivery guardrail:</strong> outbound SMS and email integrations are not connected. Active means the workflow is ready, not that a message was sent.</span></div><div className="grid gap-4">{automations.data?.length ? automations.data.map((item) => <div className="grid gap-4 rounded-sm border border-border bg-card p-5 md:grid-cols-[1fr_160px_130px_96px] md:items-center" key={item.id} data-testid={`card-automation-${item.id}`}><div><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${item.active ? 'bg-primary' : 'bg-muted-foreground/40'}`} /><h2 className="font-display text-base font-bold">{item.name}</h2></div><p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">{item.description}</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-secondary px-2 py-1 font-mono text-[9px] uppercase tracking-wider">{item.category}</span><span className="rounded-full bg-secondary px-2 py-1 font-mono text-[9px] uppercase tracking-wider">{item.trigger}</span></div></div><div><div className="font-mono text-[9px] uppercase text-muted-foreground">Channel</div><div className="mt-1 flex items-center gap-1.5 text-xs font-medium">{item.channel === 'SMS' ? <Phone size={13} /> : <Mail size={13} />}{item.channel}</div></div><div><div className="font-mono text-[9px] uppercase text-muted-foreground">Activity</div><div className="mt-1 font-display text-lg font-bold">{item.sentCount.toLocaleString('en-ZA')}</div><div className="text-[10px] text-muted-foreground">attempts logged</div></div><Button variant={item.active ? 'primary' : 'outline'} onClick={() => toggle(item.id, item.active)} disabled={update.isPending} testId={`button-toggle-automation-${item.id}`}>{item.active ? <ToggleLeft size={14} /> : <ToggleLeft size={14} />}{item.active ? 'Active' : 'Paused'}</Button></div>) : <EmptyState icon={SlidersHorizontal} title="No automations configured" detail="Your nurture and recovery plays will appear here." />}</div></QueryState></div></div></Shell>;
}

function Reports() {
  const reports = useGetCrmReports();
  const data = reports.data;
  const monthlyRevenue = data?.monthlyRevenue ?? [];
  const leadSources = [...(data?.leadSources ?? [])].sort((a, b) => b.leads - a.leads);
  const funnel = data?.funnel ?? [];
  const sourceLeads = leadSources.reduce((total, source) => total + source.leads, 0);
  const stageLeads = funnel.reduce((total, stage) => total + stage.leads, 0);
  const totalWonValue = monthlyRevenue.reduce((total, month) => total + month.revenue, 0);
  const bestMonth = [...monthlyRevenue].sort((a, b) => b.revenue - a.revenue)[0];
  const reportWindow = monthlyRevenue.length
    ? monthlyRevenue.length === 1
      ? monthlyRevenue[0].month
      : `${monthlyRevenue[0].month} – ${monthlyRevenue.at(-1)?.month}`
    : 'No monthly data';
  const maxSource = Math.max(1, ...leadSources.map((source) => source.leads));

  return (
    <Shell>
      <div className="min-h-[calc(100dvh-76px)] px-5 py-8 md:px-9 md:py-10">
        <div className="mx-auto max-w-[1300px]">
          <PageHead
            eyebrow="Revenue desk / analytics"
            title="Reports"
            detail="Won value, lead sources and pipeline mix across the latest reported period."
            action={
              <Button
                variant="outline"
                onClick={() => reports.refetch()}
                disabled={reports.isFetching}
                testId="button-refresh-reports"
              >
                <RefreshCw size={14} className={reports.isFetching ? 'animate-spin' : ''} />
                {reports.isFetching ? 'Refreshing…' : 'Refresh data'}
              </Button>
            }
          />

          <QueryState loading={reports.isLoading} error={reports.error} onRetry={() => reports.refetch()}>
            {data ? (
              <>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-xs">
                    <CalendarDays size={14} className="text-accent" />
                    <span className="text-muted-foreground">Reporting window</span>
                    <span className="font-semibold text-foreground">{reportWindow}</span>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Monetary values in ZAR
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Total leads"
                    value={data.totalLeads.toLocaleString('en-ZA')}
                    note="all captured conversations"
                    icon={Users}
                  />
                  <MetricCard
                    label="Conversion rate"
                    value={`${data.conversionRate}%`}
                    note="lead to won"
                    icon={TrendingUp}
                    accent
                  />
                  <MetricCard
                    label="Won value · reported months"
                    value={zar(totalWonValue)}
                    note={`${monthlyRevenue.length} month${monthlyRevenue.length === 1 ? '' : 's'} in this report`}
                    icon={Gauge}
                  />
                  <MetricCard
                    label="Highest-value month"
                    value={bestMonth?.month ?? '—'}
                    note={bestMonth ? zar(bestMonth.revenue) : 'no monthly revenue data'}
                    icon={BarChart3}
                  />
                </div>

                <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
                  <section
                    id="revenue-trend"
                    className="min-w-0 rounded-sm border border-border bg-card p-5 md:p-6"
                    data-testid="panel-revenue-trend"
                  >
                    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                          Revenue performance
                        </div>
                        <h2 className="mt-1 font-display text-lg font-bold">Won value by month</h2>
                      </div>
                      <span className="rounded-full border border-border px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
                        {monthlyRevenue.length} periods
                      </span>
                    </div>

                    {monthlyRevenue.length ? (
                      <div className="h-[280px] w-full sm:h-[320px]" role="img" aria-label="Monthly won value in South African rand">
                        <ResponsiveContainer width="100%" height="100%" debounce={0}>
                          <AreaChart data={monthlyRevenue} margin={{ top: 10, right: 10, left: 2, bottom: 0 }}>
                            <defs>
                              <linearGradient id="reportsRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={reportChartColors[1]} stopOpacity={0.34} />
                                <stop offset="100%" stopColor={reportChartColors[1]} stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 5" />
                            <XAxis
                              dataKey="month"
                              tickFormatter={(month) => String(month).slice(0, 3)}
                              tick={{ fontSize: 11, fill: '#68726f' }}
                              axisLine={false}
                              tickLine={false}
                              dy={10}
                            />
                            <YAxis
                              tickFormatter={compactZar}
                              tick={{ fontSize: 11, fill: '#68726f' }}
                              axisLine={false}
                              tickLine={false}
                              width={66}
                            />
                            <ChartTooltip
                              isAnimationActive={false}
                              cursor={{ stroke: reportChartColors[1], strokeDasharray: '3 3' }}
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                return (
                                  <div className="rounded-md border border-border bg-card px-3 py-2 shadow-md">
                                    <div className="text-xs text-muted-foreground">{String(label ?? '')}</div>
                                    <div className="mt-1 font-mono text-sm font-semibold text-foreground">
                                      {zar(Number(payload[0].value ?? 0))}
                                    </div>
                                  </div>
                                );
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="revenue"
                              name="Won value"
                              stroke={reportChartColors[1]}
                              strokeWidth={2.5}
                              fill="url(#reportsRevenueGradient)"
                              activeDot={{ r: 5, fill: reportChartColors[0], stroke: '#fffef9', strokeWidth: 2 }}
                              isAnimationActive={false}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="flex h-[280px] items-center justify-center rounded-sm bg-secondary/45 px-5 text-center text-sm text-muted-foreground">
                        No monthly revenue data is available for this report.
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
                      <span className="h-2 w-2 rounded-full bg-accent" />
                      Won value recorded in each month
                    </div>
                  </section>

                  <section
                    id="lead-sources"
                    className="rounded-sm border border-border bg-card p-5 md:p-6"
                    data-testid="panel-lead-sources"
                  >
                    <div className="mb-5">
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        Demand generation
                      </div>
                      <h2 className="mt-1 font-display text-lg font-bold">Lead sources</h2>
                      <p className="mt-1 text-xs text-muted-foreground">Ranked by captured lead count</p>
                    </div>

                    {leadSources.length ? (
                      <div className="space-y-5">
                        {leadSources.map((source, index) => {
                          const share = sourceLeads ? Math.round((source.leads / sourceLeads) * 100) : 0;
                          return (
                            <div key={source.source} data-testid={`source-row-${index}`}>
                              <div className="mb-2 flex items-baseline justify-between gap-3">
                                <span className="truncate text-sm font-medium" title={source.source}>
                                  {source.source}
                                </span>
                                <span className="shrink-0 font-mono text-xs">
                                  {source.leads.toLocaleString('en-ZA')}
                                  <span className="ml-2 text-[10px] text-muted-foreground">{share}%</span>
                                </span>
                              </div>
                              <div
                                className="h-2 overflow-hidden rounded-full bg-secondary"
                                role="img"
                                aria-label={`${source.source}: ${source.leads} leads, ${share}% of tracked source leads`}
                              >
                                <div
                                  className="h-full rounded-full transition-[width]"
                                  style={{
                                    width: `${(source.leads / maxSource) * 100}%`,
                                    backgroundColor: reportChartColors[index % reportChartColors.length],
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex min-h-[190px] items-center justify-center rounded-sm bg-secondary/45 px-5 text-center text-sm text-muted-foreground">
                        No lead-source data is available for this report.
                      </div>
                    )}

                    <p className="mt-5 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
                      Share is calculated from leads with a recorded source.
                    </p>
                  </section>
                </div>

                <section
                  id="pipeline-mix"
                  className="mt-5 rounded-sm border border-border bg-card p-5 md:p-6"
                  data-testid="panel-pipeline-mix"
                >
                  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        Pipeline overview
                      </div>
                      <h2 className="mt-1 font-display text-lg font-bold">Current stage mix</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Lead count by CRM stage, with each stage shown as a share of reported stage records.
                      </p>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {stageLeads.toLocaleString('en-ZA')} stage records
                    </span>
                  </div>

                  {funnel.length ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {funnel.map((stage, index) => {
                        const share = stageLeads ? Math.round((stage.leads / stageLeads) * 100) : 0;
                        return (
                          <div
                            className="rounded-sm border border-border bg-background/60 p-4"
                            key={stage.stage}
                            data-testid={`funnel-report-${index}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                                {stage.stage}
                              </span>
                              <span className="font-mono text-[10px] text-muted-foreground">{share}%</span>
                            </div>
                            <div className="mt-3 flex items-end justify-between gap-2">
                              <span className="font-display text-3xl font-semibold tracking-tight">
                                {stage.leads.toLocaleString('en-ZA')}
                              </span>
                              <span className="pb-1 text-[10px] text-muted-foreground">leads</span>
                            </div>
                            <div
                              className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"
                              role="progressbar"
                              aria-label={`${stage.stage} share of reported stage records`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={share}
                            >
                              <div
                                className="h-full rounded-full bg-accent"
                                style={{ width: `${share}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex min-h-[120px] items-center justify-center rounded-sm bg-secondary/45 px-5 text-center text-sm text-muted-foreground">
                      No pipeline-stage data is available for this report.
                    </div>
                  )}
                </section>
              </>
            ) : (
              <div className="rounded-sm border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                No report data is available yet.
              </div>
            )}
          </QueryState>
        </div>
      </div>
    </Shell>
  );
}

function PublicLanding() {
  return <main className="landing-page min-h-[100dvh] overflow-hidden bg-background text-foreground">
    <header className="relative z-10 mx-auto flex max-w-[1380px] items-center justify-between border-b border-border/70 bg-background px-5 py-5 md:px-10 md:py-7">
      <Link href="/" className="flex items-center gap-3" data-testid="link-public-home"><IconMark /><span className="font-display text-[15px] font-semibold tracking-tight">Estate Revenue Platform</span></Link>
      <div className="flex items-center gap-2 sm:gap-4"><span className="hidden font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">South Africa · private workspaces</span><Link href="/sign-in" className="rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground" data-testid="link-public-sign-in">Sign in</Link><Link href="/sign-up" className="rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm hover:-translate-y-0.5" data-testid="link-public-sign-up">Create workspace <ArrowRight className="ml-1 inline" size={13} /></Link></div>
    </header>
    <section className="landing-hero landing-grid relative mx-auto grid max-w-[1380px] gap-14 px-5 pb-20 pt-14 text-white md:grid-cols-[1.05fr_.95fr] md:items-center md:px-10 md:pb-28 md:pt-24">
      <div className="signal-line right-[8%] top-[24%] w-[38%]" />
      <div className="signal-line right-[2%] top-[64%] w-[32%] opacity-60" />
      <div className="relative">
        <div className="mb-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#55d9ef]"><span className="h-2 w-2 rounded-full bg-[#55d9ef]" />Property operations, grounded in SA</div>
        <h1 className="max-w-3xl font-display text-6xl leading-[.9] tracking-[-0.055em] text-white sm:text-7xl md:text-[88px]">The next move should never be <span className="text-[#55d9ef]">a guess.</span></h1>
        <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-white/70">Estate Revenue is the trusted desk for agents and agency operators moving real conversations from enquiry to a clear next step — with a shared pipeline, consent and rand value in view.</p>
        <div className="mt-9 flex flex-wrap gap-3"><Link href="/sign-up" className="inline-flex items-center gap-2 rounded-[3px] bg-[#55d9ef] px-5 py-3.5 text-sm font-semibold text-[#0d1b2a] shadow-sm hover:-translate-y-0.5" data-testid="button-landing-create-workspace">Create your workspace <ArrowRight size={15} /></Link><Link href="/sign-in" className="inline-flex items-center gap-2 rounded-[3px] border border-white/30 bg-white/5 px-5 py-3.5 text-sm font-semibold text-white hover:bg-white/10" data-testid="button-landing-sign-in">Sign in</Link></div>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-white/60"><span className="flex items-center gap-2"><Check size={13} className="text-[#55d9ef]" />ZAR-native revenue view</span><span className="flex items-center gap-2"><Check size={13} className="text-[#55d9ef]" />Shared agency pipeline</span><span className="flex items-center gap-2"><Check size={13} className="text-[#55d9ef]" />Consent visible at the desk</span></div>
      </div>
      <div className="relative md:pt-4">
        <div className="absolute -inset-4 rotate-2 rounded-[3px] border border-[#55d9ef]/45 bg-[#55d9ef]/10" />
        <div className="paper-shadow relative rounded-[3px] border border-white/20 bg-white p-5 text-foreground md:p-7">
          <div className="flex items-start justify-between border-b border-border pb-5"><div><div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Your desk / today</div><h2 className="mt-2 font-display text-2xl font-semibold">A day with fewer loose ends.</h2></div><span className="rounded-full bg-accent/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-accent">08:42 SAST</span></div>
          <div className="mt-5 grid grid-cols-3 gap-2">{[['01', 'Capture'], ['02', 'Qualify'], ['03', 'Follow through']].map(([step, label]) => <div key={step} className="rounded-xl border border-border bg-background p-3.5"><div className="font-mono text-[9px] text-accent">{step}</div><div className="mt-4 font-display text-sm font-semibold">{label}</div></div>)}</div>
          <div className="mt-5 rounded-[3px] bg-[#0d1b2a] p-5 text-white"><div className="flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">Pipeline focus</span><Activity size={15} className="text-[#55d9ef]" /></div><div className="mt-5 space-y-4">{[['New enquiry', 'Capture the brief'], ['Qualified', 'Agree the next action'], ['Viewing booked', 'Keep it visible']].map(([stage, task], index) => <div key={stage} className="flex items-center gap-3"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[9px] ${index === 1 ? 'bg-[#55d9ef] text-[#0d1b2a]' : 'bg-white/10 text-white/75'}`}>{index + 1}</span><span className="flex-1 text-xs font-medium">{stage}</span><span className="text-right text-[10px] text-white/45">{task}</span></div>)}</div></div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 text-[11px] text-muted-foreground"><div className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />Rand-denominated pipeline</div><div className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />Consent-aware follow-up</div></div>
        </div>
      </div>
    </section>
    <section className="border-y border-border bg-card/55"><div className="mx-auto grid max-w-[1380px] gap-0 px-5 md:grid-cols-3 md:px-10">{[['See the whole conversation', 'Lead detail, stage, budget, source and consent stay together so the next action is obvious.'], ['Make the right human move', 'Qualify intent, add context and book the appointment while the conversation is warm.'], ['Keep value honest', 'Pipeline value, revenue won and source performance stay in rand — not vanity metrics.']].map(([title, detail], index) => <div key={title} className={`px-0 py-8 md:px-8 md:py-11 ${index > 0 ? 'border-t border-border md:border-l md:border-t-0' : ''}`}><div className="font-mono text-[10px] text-accent">0{index + 1}</div><h2 className="mt-3 font-display text-xl font-semibold">{title}</h2><p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{detail}</p></div>)}</div></section>
    <section className="mx-auto grid max-w-[1380px] gap-10 px-5 py-20 md:grid-cols-[.8fr_1.2fr] md:px-10 md:py-28"><div><div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">Built for the South African day</div><h2 className="mt-4 max-w-lg font-display text-4xl font-semibold leading-tight tracking-[-.04em]">Busy desks need useful signals, not more noise.</h2><p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">From Johannesburg to Cape Town, keep local context close: cities, provinces, ZAR, consent and the time zone your conversations actually run in.</p></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-border bg-card p-5"><Target size={20} className="text-accent" /><h3 className="mt-8 font-display text-lg font-semibold">Prioritised work</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Scores, stages and follow-ups surface what deserves attention now.</p></div><div className="rounded-2xl border border-border bg-primary/15 p-5"><CircleCheck size={20} className="text-accent" /><h3 className="mt-8 font-display text-lg font-semibold">Trust in the record</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Opt-in and opt-out state stays visible wherever a lead is reviewed.</p></div><div className="rounded-2xl border border-border bg-card p-5"><TrendingUp size={20} className="text-accent" /><h3 className="mt-8 font-display text-lg font-semibold">Source-aware value</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Understand which sources create real demand and won revenue.</p></div><div className="rounded-2xl border border-border bg-card p-5"><Clock3 size={20} className="text-accent" /><h3 className="mt-8 font-display text-lg font-semibold">No false promises</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Outbound SMS and email are clearly marked as not connected.</p></div></div></section>
    <footer className="border-t border-border bg-sidebar text-sidebar-foreground"><div className="mx-auto flex max-w-[1380px] flex-col gap-5 px-5 py-8 md:flex-row md:items-center md:justify-between md:px-10"><div><div className="font-display text-sm font-semibold text-sidebar-accent-foreground">Estate Revenue Platform</div><div className="mt-1 text-[11px] text-sidebar-foreground/50">A shared revenue desk for South African property teams.</div></div><div className="flex items-center gap-4 text-[11px] text-sidebar-foreground/55"><span>Private to your workspace</span><Link href="/sign-in" className="font-semibold text-sidebar-primary hover:underline" data-testid="link-footer-sign-in">Sign in</Link></div></div></footer>
  </main>;
}

function SignInPage() {
  return <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-8">
    <Link href="/" className="mb-7 flex items-center gap-3" data-testid="link-sign-in-home"><IconMark /><span className="font-display text-sm font-bold">Estate Revenue Platform</span></Link>
    <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    <p className="mt-5 max-w-sm text-center text-[11px] leading-relaxed text-muted-foreground">Use your workspace account. CRM records are protected behind sign-in.</p>
  </main>;
}

function SignUpPage() {
  return <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-8">
    <Link href="/" className="mb-7 flex items-center gap-3" data-testid="link-sign-up-home"><IconMark /><span className="font-display text-sm font-bold">Estate Revenue Platform</span></Link>
    <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    <p className="mt-5 max-w-sm text-center text-[11px] leading-relaxed text-muted-foreground">Start with a private workspace, then create an agency workspace or join your team with an invitation.</p>
  </main>;
}

function HomeRedirect() {
  return <>
    <Show when="signed-in"><Redirect to="/overview" /></Show>
    <Show when="signed-out"><PublicLanding /></Show>
  </>;
}

function ProtectedView({ children }: { children: ReactNode }) {
  return <>
    <Show when="signed-in"><WorkspaceProvider>{children}</WorkspaceProvider></Show>
    <Show when="signed-out"><Redirect to="/" /></Show>
  </>;
}

function ProtectedOverview() {
  return <ProtectedView><Dashboard /></ProtectedView>;
}

function ProtectedLeads() {
  return <ProtectedView><Leads /></ProtectedView>;
}

function ProtectedAppointments() {
  return <ProtectedView><Appointments /></ProtectedView>;
}

function ProtectedAutomations() {
  return <ProtectedView><Automations /></ProtectedView>;
}

function ProtectedReports() {
  return <ProtectedView><Reports /></ProtectedView>;
}

function ProtectedWorkspaceSettings() {
  return <ProtectedView><Shell><WorkspaceSettingsContent /></Shell></ProtectedView>;
}
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const cache = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        cache.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, cache]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  const stripBase = (path: string) => basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;

  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to your revenue workspace.' } },
      signUp: { start: { title: 'Create your workspace', subtitle: 'A clearer way to move property conversations forward.' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <ClerkQueryClientCacheInvalidator />
      <ErrorBoundary resetKey={window.location.pathname}>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/overview" component={ProtectedOverview} />
          <Route path="/leads" component={ProtectedLeads} />
          <Route path="/appointments" component={ProtectedAppointments} />
          <Route path="/automations" component={ProtectedAutomations} />
          <Route path="/reports" component={ProtectedReports} />
          <Route path="/workspace" component={ProtectedWorkspaceSettings} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
      <Toaster />
    </QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  return <TooltipProvider><WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter></TooltipProvider>;
}

export default App;
