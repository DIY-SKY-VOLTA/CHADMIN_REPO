import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Clock,
  Loader2,
  Inbox,
  Wrench,
  Eye,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getReviewQueue } from '@/api/reviewQueueAPI';

const PROBLEM_LABELS = {
  'eventDates.start missing': 'Missing start date',
  'eventType not in enum': 'Unknown event type',
  'title missing/empty': 'Missing title',
  'eventDates.start not ISO': 'Malformed start date',
  'venue.mode not in enum': 'Missing venue mode',
  'venue.address.city required for offline/hybrid mode': 'Missing city',
  'webinar missing venue.virtualPlatform': 'Webinar missing platform',
};

const label = (p) => PROBLEM_LABELS[p] || p;

const ProblemChip = ({ children }) => (
  <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
    {children}
  </span>
);

const WarnChip = ({ children }) => (
  <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
    {children}
  </span>
);

export default function ReviewQueue() {
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getReviewQueue();
      setQueue(res?.data || null);
    } catch (err) {
      setError(
        err?.details || err?.message || 'Failed to load the review queue'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Review Queue
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Pipeline records blocked by the ingest gate — a human decision
            (fix or archive) unblocks them on the next pipeline re-run.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {queue && (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {queue.count} waiting
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Meta strip */}
      {queue?.generatedAt && (
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <Clock className="h-3.5 w-3.5" />
          Exported by the pipeline{' '}
          {new Date(queue.generatedAt).toLocaleString()}
        </div>
      )}

      {/* States */}
      {loading && !queue ? (
        <div className="flex items-center justify-center gap-2 py-24 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading queue…
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500" />
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
        </div>
      ) : queue?.count === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 py-16 text-center">
          <Inbox className="h-8 w-8 text-emerald-500" />
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            Queue is empty — every structured record passed the ingest gate.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {queue?.items?.map((item) => (
              <motion.div
                key={item.identity}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-medium text-gray-900 dark:text-white">
                        {item.title || '(untitled)'}
                      </h3>
                      {item.eventType ? (
                        <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                          {item.eventType}
                        </span>
                      ) : (
                        <ProblemChip>no type</ProblemChip>
                      )}
                    </div>
                    {item.sourceUrl && (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 truncate text-xs text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {item.sourceUrl.length > 70
                          ? `${item.sourceUrl.slice(0, 70)}…`
                          : item.sourceUrl}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.problems?.map((p) => (
                        <ProblemChip key={p}>{label(p)}</ProblemChip>
                      ))}
                      {item.warnings?.map((w) => (
                        <WarnChip key={w}>{w}</WarnChip>
                      ))}
                    </div>
                  </div>
                  {item.bannerUrl && (
                    <img
                      src={item.bannerUrl}
                      alt=""
                      className="h-14 w-24 rounded-lg border border-gray-200 object-cover dark:border-gray-700"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                  <button
                    onClick={() => setSelected(item)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <Eye className="h-3.5 w-3.5" /> How to fix
                  </button>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    identity: {String(item.identity).slice(0, 50)}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Detail drawer */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-end bg-black/40 p-4 sm:items-stretch sm:p-0"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl dark:bg-gray-900"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {selected.title || '(untitled)'}
                </h2>
                <button
                  onClick={() => setSelected(null)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" /> Blocking problems
                </h3>
                <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                  {selected.problems?.map((p) => (
                    <li key={p} className="rounded bg-red-500/5 px-2 py-1">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-5 space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  <Wrench className="h-4 w-4" /> Suggested actions
                </h3>
                <ul className="space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
                  {selected.suggestedActions?.map((a, i) => (
                    <li key={i} className="rounded bg-emerald-500/5 px-2 py-1">
                      {a}
                    </li>
                  ))}
                </ul>
              </div>

              {selected.warnings?.length > 0 && (
                <div className="mt-5 space-y-2">
                  <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                    Warnings (non-blocking)
                  </h3>
                  <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                    {selected.warnings.map((w) => (
                      <li key={w}>• {w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selected.rawLocation && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Raw location (from source)
                  </h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {selected.rawLocation}
                  </p>
                </div>
              )}

              {selected.sourceUrl && (
                <a
                  href={selected.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
                >
                  Open source page <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
