import { useState, useMemo } from 'react';
import {
  ScrollText,
  Copy,
  Check,
  Search,
  X,
  ChevronDown,
  FileText,
  Sparkles,
  ListChecks,
  RefreshCw,
  Cpu,
  Zap,
  Layers,
  FileCode,
  Calendar,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// Vite `?raw` imports — always bundle the exact prompt text from disk
import promptsTxt from '@/prompts/Prompts.txt?raw';
import promptsHackathonsTxt from '@/prompts/Prompts-hackathons.txt?raw';
import promptsEventsTxt from '@/prompts/Prompts-events.txt?raw';
import promptsBackfillTxt from '@/prompts/Prompts-backfill.txt?raw';
import hackathonPromptTxt from '@/prompts/HackathonPrompt.txt?raw';

const PROMPTS = [
  {
    id: 'contests',
    title: 'Contest Extraction',
    version: 'v4.1',
    icon: FileText,
    accent: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/15',
    description:
      'Main pipeline prompt — raw scraped contest data + URL context → one normalized contest document for the Contests collection.',
    text: promptsTxt,
  },
  {
    id: 'hackathons',
    title: 'Hackathon Extraction',
    version: 'v1.1',
    icon: Cpu,
    accent: 'text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/15',
    description:
      'Structured hackathon data (tracks, judging, resources) from raw webpage content using AI web search + URL grounding. Outputs to Contests (type: hackathon) + contest_details.',
    text: promptsHackathonsTxt,
  },
  {
    id: 'events',
    title: 'Event Extraction',
    version: 'v1.1',
    icon: Calendar,
    accent: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/15',
    description:
      'Strict event/conference extraction — speakers, agenda, ticket tiers & venue from subpages. One normalized event document per the Events schema.',
    text: promptsEventsTxt,
  },
  {
    id: 'backfill',
    title: 'Contest Backfill',
    version: 'v3.2',
    icon: RefreshCw,
    accent: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/15',
    description:
      'Computed-field backfill for existing contests: description, prizeSummary, feeConfidence, eligibilityLabel, primarySkillLevel. Outputs a JSON diff/patch, not a full doc.',
    text: promptsBackfillTxt,
  },
  {
    id: 'hackathon-details',
    title: 'Hackathon Details',
    version: 'v3.0',
    icon: Sparkles,
    accent: 'text-pink-600 dark:text-pink-400 bg-pink-500/10 border-pink-500/15',
    description:
      'Hackathon data normalization engine — extract, normalize and return ONE hackathon document strictly following the schema (docs/HackathonPrompt.txt).',
    text: hackathonPromptTxt,
  },
].map((p) => ({
  ...p,
  lines: p.text.split('\n').length,
  chars: p.text.length,
}));

const countWords = (text) => text.trim().split(/\s+/).length;

const Prompts = () => {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null); // prompt id
  const [copiedId, setCopiedId] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return PROMPTS;
    return PROMPTS.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.version.toLowerCase().includes(q)
    );
  }, [search]);

  const handleCopy = async (prompt, e) => {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(prompt.text);
      setCopiedId(prompt.id);
      toast.success(`"${prompt.title}" prompt copied to clipboard`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Copy failed — clipboard not available');
    }
  };

  const totalLines = PROMPTS.reduce((sum, p) => sum + p.lines, 0);
  const totalChars = PROMPTS.reduce((sum, p) => sum + p.chars, 0);

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-800/50">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <ScrollText size={16} strokeWidth={1.5} className="text-neutral-400" />
            Pipeline Prompts
          </h1>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            {PROMPTS.length} prompts · {totalLines.toLocaleString()} lines ·{' '}
            {(totalChars / 1024).toFixed(1)} KB — copy any prompt for the automation pipeline
          </p>
        </div>
        <div className="w-72 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts..."
            className="w-full pl-9 pr-8 py-1.5 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-800 dark:hover:text-white"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="shrink-0 px-6 py-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Prompts', value: PROMPTS.length, icon: Layers, color: 'text-neutral-500', bg: 'bg-neutral-100 dark:bg-neutral-800/50' },
          { label: 'Total Lines', value: totalLines.toLocaleString(), icon: ListChecks, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Total Size', value: `${(totalChars / 1024).toFixed(1)} KB`, icon: FileCode, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10' },
          { label: 'Schemas', value: '5', icon: Zap, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between"
          >
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                {stat.label}
              </span>
              <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{stat.value}</p>
            </div>
            <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center ${stat.color}`}>
              <stat.icon size={15} strokeWidth={1.5} />
            </div>
          </div>
        ))}
      </div>

      {/* Prompt cards */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6 space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white dark:bg-[#151518]/40 border border-neutral-200/40 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center py-20 shadow-sm">
            <ScrollText size={28} strokeWidth={1.25} className="text-neutral-300 dark:text-neutral-700" />
            <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-300 mt-3">No prompts found</p>
            <p className="text-[11px] text-neutral-400 mt-1">Try a different search term</p>
          </div>
        ) : (
          filtered.map((prompt) => {
            const isOpen = expanded === prompt.id;
            const isCopied = copiedId === prompt.id;
            return (
              <div
                key={prompt.id}
                className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
              >
                {/* Card header — div wrapper (not a button) so the Copy button isn't nested inside a button */}
                <div className="flex items-center justify-between gap-3 group">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : prompt.id)}
                    className="flex-1 min-w-0 flex items-center gap-3 px-5 py-3.5 text-left hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors"
                  >
                    <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${prompt.accent}`}>
                      <prompt.icon size={16} strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">{prompt.title}</h3>
                        <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[9px] font-semibold text-neutral-500 dark:text-neutral-400 border border-neutral-200/50 dark:border-white/5 font-mono">
                          {prompt.version}
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5 truncate max-w-[520px]">
                        {prompt.description}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0 pr-3">
                    <span className="hidden md:inline text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">
                      {prompt.lines.toLocaleString()} lines
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleCopy(prompt, e)}
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all shadow-sm flex items-center gap-1.5 ${
                        isCopied
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 hover:text-neutral-900 dark:hover:text-white'
                      }`}
                    >
                      {isCopied ? <Check size={12} /> : <Copy size={12} />}
                      {isCopied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : prompt.id)}
                      className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
                      title={isOpen ? 'Collapse' : 'Expand'}
                    >
                      <ChevronDown
                        size={15}
                        className={`text-neutral-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>
                </div>

                {/* Expanded preview */}
                {isOpen && (
                  <div className="border-t border-neutral-200/40 dark:border-white/5">
                    <div className="px-5 py-3 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-900/30">
                      <span className="text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
                        {prompt.lines.toLocaleString()} lines · {countWords(prompt.text).toLocaleString()} words ·{' '}
                        {(prompt.chars / 1024).toFixed(1)} KB
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => handleCopy(prompt, e)}
                          className={`px-2.5 py-1 rounded-md border text-[10px] font-semibold transition-all flex items-center gap-1.5 ${
                            isCopied
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 hover:text-neutral-900 dark:hover:text-white'
                          }`}
                        >
                          {isCopied ? <Check size={11} /> : <Copy size={11} />}
                          {isCopied ? 'Copied' : 'Copy Full Prompt'}
                        </button>
                      </div>
                    </div>
                    <div className="px-5 py-4">
                      <pre className="text-[10.5px] leading-relaxed font-mono text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words max-h-[520px] overflow-y-auto custom-scrollbar bg-neutral-50/50 dark:bg-[#1b1b1e]/40 border border-neutral-200/30 dark:border-white/5 rounded-lg p-4">
                        {prompt.text}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Prompts;
