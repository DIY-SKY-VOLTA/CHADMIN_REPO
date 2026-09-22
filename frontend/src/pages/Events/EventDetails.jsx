import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  CalendarDays,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  Pencil,
  Users,
  Calendar,
  HelpCircle,
  Ticket,
  ClipboardList,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';

const STATUS_CONFIG = {
  published: { label: 'Published', bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/15' },
  draft:     { label: 'Draft',     bg: 'bg-neutral-500/10', text: 'text-neutral-500 dark:text-neutral-400', border: 'border-neutral-500/15' },
  cancelled: { label: 'Cancelled', bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/15' },
  archived:  { label: 'Archived',  bg: 'bg-neutral-500/10', text: 'text-neutral-500 dark:text-neutral-400', border: 'border-neutral-500/15' },
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
};

const Thumb = ({ src, alt }) => {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = src?.backup?.url || src?.primary?.url;
  if (!url || error) {
    return (
      <div className="w-9 h-9 rounded-lg border border-neutral-200/60 dark:border-white/10 bg-neutral-100 dark:bg-neutral-900/50 flex items-center justify-center">
        <CalendarDays size={13} className="text-neutral-400" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-lg border border-neutral-200/60 dark:border-white/10 bg-neutral-100 dark:bg-neutral-900/50 overflow-hidden relative">
      {!loaded && <div className="absolute inset-0 bg-neutral-100 dark:bg-neutral-900/50 animate-pulse" />}
      <img
        src={url}
        alt={alt || ''}
        className={`w-full h-full object-cover ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  );
};

// Count each detail group; renders a chip when the group has content
const DetailChips = ({ event }) => {
  const groups = [
    { key: 'speakers', label: 'Speakers', icon: Users, count: event.speakers?.length || 0 },
    { key: 'agenda', label: 'Agenda', icon: Calendar, count: event.agenda?.length || 0 },
    { key: 'faqs', label: 'FAQ', icon: HelpCircle, count: event.faqs?.length || 0 },
    { key: 'pricing', label: 'Pricing', icon: Ticket, count: event.pricing?.length || 0 },
    { key: 'preparation', label: 'Prep', icon: ClipboardList, count:
      (event.preparation?.prerequisites?.length || 0) +
      (event.preparation?.materialsProvided?.length || 0) +
      (event.preparation?.materialsRequired?.length || 0) },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1">
      {groups.map(({ label, icon: Icon, count }) => (
        <span
          key={label}
          title={`${count} ${label.toLowerCase()} ${count === 1 ? 'entry' : 'entries'}`}
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
            count > 0
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/15'
              : 'bg-neutral-100 dark:bg-neutral-800/40 text-neutral-400 dark:text-neutral-600 border-neutral-200/50 dark:border-white/5'
          }`}
        >
          <Icon size={9} />
          {count > 0 ? count : '–'}
        </span>
      ))}
    </div>
  );
};

const EventDetails = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const searchTimerRef = useRef(null);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  const fetchEvents = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25', status: statusFilter });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await adminAPI.get(`/events/details?${params.toString()}`);
      if (res.success) {
        setEvents(res.events || []);
        setPagination(res.pagination || { total: 0, pages: 1 });
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to load event details');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const totalPages = Math.max(1, pagination.pages || 1);

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-400/40">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Event Details
          </h1>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
            {pagination.total > 0
              ? `${pagination.total} event${pagination.total === 1 ? '' : 's'} — speakers, agenda, FAQ, pricing & preparation rendered on the live page`
              : 'Edit the detail groups that power the public event page'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchEvents(); toast.success('Refreshed'); }}
            className="p-2 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-xs font-medium"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => navigate('/events')}
            className="px-3 py-2 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-xs font-medium"
          >
            <CalendarDays size={13} strokeWidth={1.5} />
            All Events
          </button>
        </div>
      </div>

      {/* Control Bar */}
      <div className="shrink-0 px-6 py-3 flex flex-col md:flex-row gap-3 items-center justify-between border-b border-neutral-200/30 dark:border-white/[0.04]">
        <div className="w-full md:w-72 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, slug…"
            className="w-full pl-9 pr-8 py-2 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 rounded-lg text-[13px] text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
          />
          {search && (
            <button onClick={() => { setSearch(''); setDebouncedSearch(''); setPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-800 dark:hover:text-white">
              <X size={12} />
            </button>
          )}
        </div>

        <div className="w-full md:w-auto flex items-center gap-2 justify-end">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-2.5 py-2 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-300 focus:outline-none cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 animate-pulse">
            {[...Array(8)].map((_, i) => <div key={i} className="h-14 bg-neutral-200/50 dark:bg-neutral-800 rounded-xl" />)}
          </div>
        ) : events.length === 0 ? (
          <div className="bg-white dark:bg-[#151518]/40 border border-neutral-200/40 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center py-20 shadow-sm">
            <CalendarDays size={32} strokeWidth={1.25} className="text-neutral-300 dark:text-neutral-700" />
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-300 mt-3">
              {debouncedSearch || statusFilter !== 'all'
                ? 'No matching events found'
                : 'No events yet'}
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              {debouncedSearch
                ? 'Try adjusting your search or filters'
                : 'Events created by the pipeline or the Events page will appear here'}
            </p>
            {!debouncedSearch && (
              <button
                onClick={() => navigate('/events')}
                className="mt-4 px-3 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 transition-all shadow-sm flex items-center gap-1.5 text-xs font-semibold"
              >
                <CalendarDays size={13} strokeWidth={2} />
                Go to Events
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            {/* Header */}
            <div className="bg-neutral-50/50 dark:bg-neutral-900/30 px-5 py-2.5 flex items-center text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
              <div className="w-[32%]">Event</div>
              <div className="w-[10%]">Type</div>
              <div className="w-[10%]">Status</div>
              <div className="w-[33%]">Detail Groups</div>
              <div className="w-[15%] text-right">Actions</div>
            </div>
            {/* Rows */}
            <div className="divide-y divide-neutral-200/50 dark:divide-white/5">
              {events.map((event) => {
                const statusCfg = STATUS_CONFIG[event.status] || STATUS_CONFIG.draft;
                const startDate = event.eventDates?.start
                  ? formatDate(event.eventDates.start)
                  : '—';
                return (
                  <div
                    key={event._id}
                    onClick={() => navigate(`/events/${event._id}/details`)}
                    className={`px-5 py-3 flex items-center hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-pointer text-[13px] text-neutral-700 dark:text-neutral-300 ${event.status === 'archived' ? 'opacity-55' : ''}`}
                  >
                    {/* Title */}
                    <div className="w-[32%] flex items-center gap-3 pr-4 min-w-0">
                      <Thumb src={event.image} alt={event.image?.alt} />
                      <div className="min-w-0">
                        <span className="truncate font-semibold text-neutral-900 dark:text-white block text-[13px]">
                          {event.title}
                        </span>
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate block">
                          {startDate} · /{event.slug || '—'}
                        </span>
                      </div>
                    </div>

                    {/* Type */}
                    <div className="w-[10%] pr-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 dark:bg-neutral-800/50 text-neutral-500 dark:text-neutral-400 border border-neutral-200/50 dark:border-white/5 truncate inline-block max-w-full">
                        {event.eventType || 'event'}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="w-[10%] pr-3">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                        {statusCfg.label}
                      </span>
                    </div>

                    {/* Detail groups */}
                    <div className="w-[33%] pr-3 min-w-0">
                      <DetailChips event={event} />
                    </div>

                    {/* Actions */}
                    <div className="w-[15%] flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => navigate(`/events/${event._id}/details`)}
                        className="p-1.5 rounded hover:bg-emerald-500/10 text-neutral-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        title="Edit event details"
                      >
                        <Pencil size={13} />
                      </button>
                      {event.slug && (
                        <a
                          href={`https://www.contesthopper.live/events/${event.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-blue-500/10 text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          title="Open live event page"
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 px-4 py-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#151518] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[11px] font-medium text-neutral-500">
              Page {page} of {totalPages} · {pagination.total} total
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#151518] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EventDetails;
