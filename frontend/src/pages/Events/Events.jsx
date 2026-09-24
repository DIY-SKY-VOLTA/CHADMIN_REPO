import { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays,
  Plus,
  Edit3,
  Trash2,
  RefreshCw,
  Search,
  X,
  Loader2,
  AlertTriangle,
  Star,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { listEvents, getEventStats, archiveEvent, deleteEventHard } from '@/api/eventAPI';
import { adminListEventTypes } from '@/api/eventTypeAPI';
import EventFormDrawer from './EventFormDrawer';

const PAGE_SIZE = 20;

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'archived', label: 'Archived' },
];

const SORT_OPTIONS = [
  { value: 'updatedAt:desc', label: 'Last Updated' },
  { value: 'startDate:asc', label: 'Start Date ↑' },
  { value: 'startDate:desc', label: 'Start Date ↓' },
  { value: 'createdAt:desc', label: 'Newest Added' },
  { value: 'title:asc', label: 'Title A–Z' },
];

const MODE_LABELS = {
  'in-person': 'In-person',
  online: 'Online',
  hybrid: 'Hybrid',
  offline: 'Offline',
};

const STATUS_STYLES = {
  published: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  draft: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  cancelled: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  archived: 'bg-neutral-200/60 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border-neutral-300/50 dark:border-white/5',
};

const STAT_CARDS = [
  { key: 'total', label: 'Total Events', icon: CalendarDays, tone: 'text-neutral-500' , bg: 'bg-neutral-100 dark:bg-neutral-800/50' },
  { key: 'published', label: 'Published', icon: CheckCircle2, tone: 'text-emerald-600 dark:text-emerald-500', bg: 'bg-emerald-500/10' },
  { key: 'upcoming', label: 'Upcoming Live', icon: Clock, tone: 'text-blue-600 dark:text-blue-500', bg: 'bg-blue-500/10' },
  { key: 'featured', label: 'Featured', icon: Star, tone: 'text-amber-600 dark:text-amber-500', bg: 'bg-amber-500/10' },
];

export default function EventsPage() {
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  const [query, setQuery] = useState({ search: '', status: 'all', eventType: 'all', sort: 'updatedAt:desc' });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [eventTypes, setEventTypes] = useState([]);

  // Drawer states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [currentEvent, setCurrentEvent] = useState(null);

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(query.search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [query.search]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await getEventStats();
      if (res.success) setStats(res.stats);
    } catch {
      // stats are optional
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await listEvents({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        status: query.status,
        eventType: query.eventType,
        sortBy: query.sort,
      });
      if (res.success) {
        setEvents(res.events);
        setPagination(res.pagination);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to load events');
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, query.status, query.eventType, query.sort]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    fetchStats();
    const loadTypes = async () => {
      try {
        const res = await adminListEventTypes();
        if (res.success) setEventTypes(res.types.filter((t) => t.isActive !== false));
      } catch {
        // filter options are optional
      }
    };
    loadTypes();
  }, [fetchStats]);

  const startEditing = (ev) => {
    setCurrentEvent(ev);
    setIsCreating(false);
    setIsDrawerOpen(true);
  };

  const startCreating = () => {
    setCurrentEvent(null);
    setIsCreating(true);
    setIsDrawerOpen(true);
  };

  const handleSaved = () => {
    fetchEvents();
    fetchStats();
  };

  const handleArchive = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await archiveEvent(deleteTarget._id);
      if (res.success) {
        toast.success(res.message);
        setDeleteTarget(null);
        handleSaved();
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to archive');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleHardDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await deleteEventHard(deleteTarget._id);
      if (res.success) {
        toast.success(res.message);
        setDeleteTarget(null);
        handleSaved();
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  const typeInfo = (slug) => eventTypes.find((t) => t.slug === slug);

  const fmtRange = (ev) => {
    if (ev.displayDate) return ev.displayDate;
    if (!ev.eventDates?.start) return '—';
    return new Date(ev.eventDates.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const locationLabel = (ev) => {
    if (ev.locationLabel) return ev.locationLabel;
    if (ev.venue?.mode && MODE_LABELS[ev.venue.mode]) return MODE_LABELS[ev.venue.mode];
    return '—';
  };

  const thumbUrl = (ev) => ev.imageUrl || ev.image?.backup?.url || ev.image?.primary?.url || null;

  const updateFilter = (key, value) => {
    setQuery((q) => ({ ...q, [key]: value }));
    if (key !== 'search') setPage(1);
  };

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-400/40">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <CalendarDays size={16} strokeWidth={1.5} className="text-neutral-400" />
            Events Manager
          </h1>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            {pagination.total > 0
              ? `Manage ${pagination.total} event${pagination.total === 1 ? '' : 's'} — powers the live /events pages`
              : 'Manage the events shown on the live site'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              fetchEvents();
              fetchStats();
              toast.success('Events refreshed');
            }}
            className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-medium"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={startCreating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:opacity-90 transition-all shadow-sm"
          >
            <Plus size={13} /> Add Event
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="shrink-0 p-6 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(({ key, label, icon: Icon, tone, bg }) => (
          <div
            key={key}
            className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all"
          >
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">{label}</span>
              <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">
                {stats ? stats[key] : '—'}
              </p>
            </div>
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center ${tone}`}>
              <Icon size={15} strokeWidth={1.5} />
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="shrink-0 px-6 pb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            value={query.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            placeholder="Search title, slug…"
            className="pl-7 pr-7 py-1.5 w-60 bg-white dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-[#2b2b30] transition-all shadow-sm"
          />
          {query.search && (
            <button
              onClick={() => updateFilter('search', '')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              <X size={11} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 p-0.5 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#18181b] shadow-sm">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => updateFilter('status', t.value)}
              className={`px-2.5 py-1 rounded-[6px] text-[11px] font-medium transition-all ${
                query.status === t.value
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <select
          value={query.eventType}
          onChange={(e) => updateFilter('eventType', e.target.value)}
          className="py-1.5 pl-2.5 pr-6 bg-white dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-700 dark:text-neutral-300 focus:outline-none focus:border-neutral-400 transition-all shadow-sm"
        >
          <option value="all">All Types</option>
          {eventTypes.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>

        <select
          value={query.sort}
          onChange={(e) => updateFilter('sort', e.target.value)}
          className="py-1.5 pl-2.5 pr-6 bg-white dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-700 dark:text-neutral-300 focus:outline-none focus:border-neutral-400 transition-all shadow-sm"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl p-4 space-y-3 animate-pulse">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-3">
                <div className="w-9 h-9 bg-neutral-200/50 dark:bg-neutral-800 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-neutral-200/50 dark:bg-neutral-800 rounded w-1/3" />
                  <div className="h-2 bg-neutral-200/50 dark:bg-neutral-800 rounded w-1/5" />
                </div>
                <div className="h-2.5 bg-neutral-200/50 dark:bg-neutral-800 rounded w-24" />
                <div className="h-2.5 bg-neutral-200/50 dark:bg-neutral-800 rounded w-28 hidden lg:block" />
                <div className="h-5 bg-neutral-200/50 dark:bg-neutral-800 rounded-full w-16" />
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="bg-white dark:bg-[#151518]/40 border border-neutral-200/40 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center py-20 shadow-sm">
            <CalendarDays size={28} strokeWidth={1.5} className="text-neutral-350 dark:text-neutral-600 mb-3" />
            <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-300">No events found</p>
            <p className="text-[11px] text-neutral-400 mt-1">
              {debouncedSearch || query.status !== 'all' || query.eventType !== 'all'
                ? 'Try clearing the search or filters.'
                : 'Create an event or let the pipeline ingest some.'}
            </p>
            <button
              onClick={startCreating}
              className="mt-4 px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-[10px] font-bold uppercase hover:opacity-90 transition-all shadow-sm"
            >
              Add First Event
            </button>
          </div>
        ) : (
          <>
            <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
              <div className="min-w-full divide-y divide-neutral-200/50 dark:divide-white/5">
                {/* Column headers */}
                <div className="bg-neutral-50/50 dark:bg-neutral-900/30 px-5 py-2.5 flex items-center text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider select-none">
                  <div className="w-[32%]">Event</div>
                  <div className="w-[10%]">Type</div>
                  <div className="w-[15%]">Dates</div>
                  <div className="w-[16%]">Location</div>
                  <div className="w-[10%]">Status</div>
                  <div className="w-[8%]">Flags</div>
                  <div className="w-[9%] text-right">Actions</div>
                </div>

                <div className="divide-y divide-neutral-150 dark:divide-white/5">
                  {events.map((ev) => {
                    const ti = typeInfo(ev.eventType);
                    const url = thumbUrl(ev);
                    return (
                      <div
                        key={ev._id}
                        onClick={() => startEditing(ev)}
                        className="px-5 py-3 flex items-center hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-pointer text-xs"
                      >
                        {/* Event */}
                        <div className="w-[32%] pr-4 flex items-center gap-3 min-w-0">
                          {url ? (
                            <img
                              src={url}
                              alt=""
                              className="w-9 h-9 rounded-lg object-cover border border-neutral-200/60 dark:border-white/5 shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.visibility = 'hidden';
                              }}
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-[11px] font-bold text-neutral-400 shrink-0">
                              {(ev.title || '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-neutral-800 dark:text-neutral-200 truncate leading-tight">
                              {ev.title || 'Untitled event'}
                            </p>
                            <p className="text-[10px] font-mono text-neutral-400 truncate mt-0.5">
                              {ev.slug || ev.eventId || '—'}
                            </p>
                          </div>
                        </div>

                        {/* Type */}
                        <div className="w-[10%] pr-4">
                          {ev.eventType ? (
                            <span
                              className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold border truncate max-w-full"
                              style={{
                                backgroundColor: (ti?.color || '#3b82f6') + '15',
                                color: ti?.color || '#3b82f6',
                                borderColor: (ti?.color || '#3b82f6') + '30',
                              }}
                            >
                              {ti?.name || ev.eventType}
                            </span>
                          ) : (
                            <span className="text-neutral-300 dark:text-neutral-600">—</span>
                          )}
                        </div>

                        {/* Dates */}
                        <div className="w-[15%] pr-4 truncate text-neutral-500 dark:text-neutral-400">
                          {fmtRange(ev)}
                        </div>

                        {/* Location */}
                        <div className="w-[16%] pr-4 truncate text-neutral-500 dark:text-neutral-400">
                          {locationLabel(ev)}
                        </div>

                        {/* Status */}
                        <div className="w-[10%] pr-4">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold capitalize ${
                              STATUS_STYLES[ev.status] || STATUS_STYLES.draft
                            }`}
                          >
                            {ev.status}
                          </span>
                        </div>

                        {/* Flags */}
                        <div className="w-[8%] pr-4 flex items-center gap-1">
                          {ev.featured && (
                            <span title="Featured" className="text-amber-500">
                              <Star size={12} fill="currentColor" strokeWidth={0} />
                            </span>
                          )}
                          {ev.heroBanner && (
                            <span className="px-1.5 py-0.5 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded text-[8px] font-bold tracking-wide">
                              HERO
                            </span>
                          )}
                          {!ev.featured && !ev.heroBanner && (
                            <span className="text-neutral-300 dark:text-neutral-600">—</span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="w-[9%] text-right flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => startEditing(ev)}
                            className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-750 dark:hover:text-white transition-colors"
                            title="Edit event"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(ev)}
                            className="p-1.5 rounded hover:bg-red-500/10 text-neutral-400 hover:text-red-650 dark:hover:text-red-400 transition-colors"
                            title="Archive or delete event"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Pagination */}
            <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-400">
              <span>
                Page {page} of {pagination.pages} · {pagination.total} event{pagination.total === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] disabled:opacity-30 hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 transition-all shadow-sm"
                >
                  <ChevronLeft size={13} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                  disabled={page >= pagination.pages}
                  className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] disabled:opacity-30 hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 transition-all shadow-sm"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create/Edit drawer */}
      <EventFormDrawer
        isOpen={isDrawerOpen}
        isCreating={isCreating}
        eventData={currentEvent}
        eventTypes={eventTypes}
        onClose={() => setIsDrawerOpen(false)}
        onSaved={handleSaved}
      />

      {/* Archive / Delete confirmation dialog */}
      <AnimatePresence>
        {deleteTarget && (
          <>
            <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-[2px]" />
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm bg-white dark:bg-[#151518] rounded-xl border border-neutral-200/50 dark:border-white/5 p-5 shadow-2xl space-y-4"
              >
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center text-red-650 shrink-0">
                    <AlertTriangle size={18} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wide">
                      Archive or Delete
                    </h3>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                      <strong className="text-neutral-850 dark:text-white">{deleteTarget.title || 'This event'}</strong> will be
                      removed from the live listing. Archiving keeps the record for history; deleting is permanent.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={handleArchive}
                    disabled={isDeleting}
                    className="w-full py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                  >
                    {isDeleting ? <Loader2 size={12} className="animate-spin" /> : null}
                    Archive (soft)
                  </button>
                  <button
                    onClick={handleHardDelete}
                    disabled={isDeleting}
                    className="w-full py-2 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-650 disabled:opacity-40 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                  >
                    {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={12} />}
                    Delete Permanently
                  </button>
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className="w-full py-2 border border-neutral-200 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors shadow-sm"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
