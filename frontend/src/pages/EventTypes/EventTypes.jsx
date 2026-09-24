import { useState, useEffect } from 'react';
import { useNestedForm } from '@/hooks/useNestedForm';
import {
  CalendarDays,
  Plus,
  Edit3,
  Trash2,
  Save,
  AlertTriangle,
  Loader2,
  X,
  GripVertical,
  RefreshCw,
  Layers,
  Palette,
  Tag
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';

const presetColors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#0ea5e9', '#f59e0b', '#f97316', '#ef4444', '#14b8a6', '#ec4899', '#22c55e', '#e11d48'];

export default function EventTypesPage() {
  const [types, setTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form & Drawer states
  const [editingId, setEditingId] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // Shared form hook (contest forms + events drawer) — flat keys today, dot-path safe if the form grows
  const { form: editForm, setForm: setEditForm } = useNestedForm({ name: '', description: '', color: '#3b82f6', isActive: true });
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Archive confirmation modal
  const [archiveTarget, setArchiveTarget] = useState(null);

  // Drag and drop sorting states
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  useEffect(() => {
    fetchTypes();
  }, []);

  const fetchTypes = async () => {
    setIsLoading(true);
    try {
      const res = await adminAPI.get('/event-types');
      if (res.success) {
        setTypes(res.types);
      }
    } catch {
      toast.error('Failed to load event types');
    } finally {
      setIsLoading(false);
    }
  };

  const startEditing = (t) => {
    setEditingId(t._id);
    setIsCreating(false);
    setEditForm({
      name: t.name,
      description: t.description || '',
      color: t.color || '#3b82f6',
      isActive: t.isActive !== false,
    });
    setIsDrawerOpen(true);
  };

  const startCreating = () => {
    setIsCreating(true);
    setEditingId(null);
    setEditForm({
      name: '',
      description: '',
      color: '#3b82f6',
      isActive: true,
    });
    setIsDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!editForm.name.trim()) return toast.error('Name is required');
    setIsSaving(true);
    try {
      if (isCreating) {
        const res = await adminAPI.post('/event-types', editForm);
        if (res.success) {
          toast.success(res.message);
          setTypes(prev => [...prev, res.type].sort((a, b) => a.sortOrder - b.sortOrder));
          setIsDrawerOpen(false);
        }
      } else if (editingId) {
        const res = await adminAPI.put(`/event-types/${editingId}`, editForm);
        if (res.success) {
          toast.success(res.message);
          setTypes(prev => prev.map(t => t._id === editingId ? { ...res.type, eventCount: t.eventCount } : t));
          setIsDrawerOpen(false);
          setEditingId(null);
        }
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setIsSaving(true);
    try {
      const res = await adminAPI.delete(`/event-types/${archiveTarget._id}`);
      if (res.success) {
        toast.success(res.message);
        setTypes(prev => prev.map(t => t._id === archiveTarget._id ? { ...t, isActive: false } : t));
        setArchiveTarget(null);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to archive');
    } finally {
      setIsSaving(false);
    }
  };

  // HTML5 Drag handlers
  const handleDragStart = (idx) => setDraggedIdx(idx);

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDragEnd = async () => {
    if (draggedIdx === null || dragOverIdx === null || draggedIdx === dragOverIdx) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }
    const newOrder = [...types];
    const [moved] = newOrder.splice(draggedIdx, 1);
    newOrder.splice(dragOverIdx, 0, moved);

    setTypes(newOrder);
    setDraggedIdx(null);
    setDragOverIdx(null);

    try {
      await adminAPI.put('/event-types/reorder', {
        order: newOrder.map(t => ({ _id: t._id })),
      });
      toast.success('Event type sort order updated');
    } catch {
      toast.error('Failed to save order');
      fetchTypes();
    }
  };

  // Dynamic statistics
  const totalTypes = types.length;
  const totalEvents = types.reduce((sum, t) => sum + (t.eventCount || 0), 0);
  const activeCount = types.filter(t => t.isActive !== false).length;
  const uniqueColorsCount = new Set(types.map(t => t.color)).size;

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-400/40">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <CalendarDays size={16} strokeWidth={1.5} className="text-neutral-400" />
            Event Type Manager
          </h1>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            {types.length > 0
              ? `Manage ${types.length} event types`
              : 'Add the canonical event types'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              fetchTypes();
              toast.success('Event types refreshed');
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
            <Plus size={13} /> Add Type
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="shrink-0 p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Total Types</span>
            <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{totalTypes}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800/50 flex items-center justify-center">
            <Tag size={15} strokeWidth={1.5} className="text-neutral-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Live Events</span>
            <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{totalEvents}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-500">
            <Layers size={15} strokeWidth={1.5} />
          </div>
        </div>

        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Active Types</span>
            <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{activeCount}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-500">
            <CalendarDays size={15} strokeWidth={1.5} />
          </div>
        </div>

        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Visual Palettes</span>
            <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{uniqueColorsCount}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-500">
            <Palette size={15} strokeWidth={1.5} />
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl p-4 divide-y divide-neutral-150 dark:divide-white/5 animate-pulse space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <div className="w-4 h-4 bg-neutral-200/50 dark:bg-neutral-800 rounded" />
                <div className="w-8 h-8 bg-neutral-200/50 dark:bg-neutral-800 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-neutral-200/50 dark:bg-neutral-800 rounded w-1/4" />
                  <div className="h-2 bg-neutral-200/50 dark:bg-neutral-800 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : types.length === 0 ? (
          <div className="bg-white dark:bg-[#151518]/40 border border-neutral-200/40 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center py-20 shadow-sm">
            <CalendarDays size={28} strokeWidth={1.5} className="text-neutral-350 dark:text-neutral-600 mb-3" />
            <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-300">No event types found</p>
            <p className="text-[11px] text-neutral-400 mt-1">Create types to structure your event content.</p>
            <button
              onClick={startCreating}
              className="mt-4 px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-[10px] font-bold uppercase hover:opacity-90 transition-all shadow-sm"
            >
              Create First Type
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            <div className="min-w-full divide-y divide-neutral-200/50 dark:divide-white/5">
              {/* Column headers */}
              <div className="bg-neutral-50/50 dark:bg-neutral-900/30 px-5 py-2.5 flex items-center text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider select-none">
                <div className="w-[8%]">Sort</div>
                <div className="w-[30%]">Type Tag</div>
                <div className="w-[18%]">Slug / Value</div>
                <div className="w-[10%]">Usage</div>
                <div className="w-[24%]">Description</div>
                <div className="w-[10%] text-right">Actions</div>
              </div>

              <div className="divide-y divide-neutral-150 dark:divide-white/5">
                {types.map((t, idx) => (
                  <div
                    key={t._id}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`px-5 py-3 flex items-center hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors text-xs ${
                      draggedIdx === idx ? 'opacity-40 bg-neutral-100/50 dark:bg-neutral-900/40 border-dashed border-neutral-300' : ''
                    } ${dragOverIdx === idx ? 'border-t-2 border-neutral-450 dark:border-neutral-700 bg-neutral-100/30 dark:bg-white/5' : ''}`}
                  >
                    <div className="w-[8%] pr-4 cursor-grab active:cursor-grabbing text-neutral-300 dark:text-neutral-600 hover:text-neutral-500 dark:hover:text-neutral-300 transition-colors">
                      <GripVertical size={14} />
                    </div>

                    <div className="w-[30%] pr-4 flex items-center gap-2">
                      <span
                        className="px-2 py-0.5 rounded text-[11px] font-semibold border"
                        style={{
                          backgroundColor: (t.color || '#3b82f6') + '15',
                          color: t.color || '#3b82f6',
                          borderColor: (t.color || '#3b82f6') + '30',
                        }}
                      >
                        {t.name}
                      </span>
                      {t.isActive === false && (
                        <span className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-400 rounded text-[7px] font-bold tracking-wide">
                          ARCHIVED
                        </span>
                      )}
                    </div>

                    <div className="w-[18%] pr-4 truncate font-mono text-[10px] text-neutral-450 dark:text-neutral-500">
                      {t.slug || '—'}
                    </div>

                    <div className="w-[10%] pr-4">
                      <span className="inline-flex px-1.5 py-0.5 bg-neutral-50 dark:bg-[#18181b] border border-neutral-200/40 dark:border-white/5 rounded text-[10px] font-semibold text-neutral-500">
                        {t.eventCount ?? 0} events
                      </span>
                    </div>

                    <div className="w-[24%] pr-4 truncate text-neutral-400 dark:text-neutral-550">
                      {t.description || <span className="italic">No description</span>}
                    </div>

                    <div className="w-[10%] text-right flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => startEditing(t)}
                        className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-750 dark:hover:text-white transition-colors"
                        title="Edit event type"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => setArchiveTarget(t)}
                        className="p-1.5 rounded hover:bg-red-500/10 text-neutral-400 hover:text-red-650 dark:hover:text-red-400 transition-colors"
                        title="Archive event type (soft)"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Slide-over Drawer Editor/Creator */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 z-45 bg-black/30 dark:bg-black/60 backdrop-blur-[2px]"
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white dark:bg-[#151518] border-l border-neutral-200/50 dark:border-white/5 shadow-2xl flex flex-col justify-between overflow-hidden text-xs"
            >
              <div className="shrink-0 p-4 border-b border-neutral-200/50 dark:border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                  {isCreating ? 'Create Event Type' : 'Modify Event Type'}
                </span>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-750 dark:hover:text-white transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                <div className="space-y-2">
                  <span className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
                    Live Component Preview
                  </span>
                  <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/35 dark:border-white/5 rounded-xl p-6 flex flex-col items-center justify-center min-h-[90px] shadow-inner space-y-2">
                    <span
                      className="px-2.5 py-1 rounded text-[11px] font-semibold border transition-all duration-300"
                      style={{
                        backgroundColor: editForm.color + '15',
                        color: editForm.color,
                        borderColor: editForm.color + '30',
                      }}
                    >
                      {editForm.name || 'Pill Preview'}
                    </span>
                    {editForm.description && (
                      <p className="text-[9px] text-neutral-400 text-center max-w-[200px] truncate">
                        {editForm.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
                      Type Name
                    </label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Conference, Summit, Workshop"
                      className="w-full px-3 py-2 bg-white dark:bg-[#1b1b1e] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-[#2b2b30] transition-all shadow-sm"
                    />
                    <p className="text-[9px] text-neutral-400">
                      Slug is generated snake_case (e.g. &quot;Trade Show&quot; → trade_show) to match the pipeline enum.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
                      Type Description
                    </label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Provide a short description of events matching this type..."
                      rows={3}
                      className="w-full px-3 py-2 bg-white dark:bg-[#1b1b1e] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-[#2b2b30] transition-all shadow-sm resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
                      Visual Palette Highlight
                    </label>
                    <div className="grid grid-cols-11 gap-2">
                      {presetColors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setEditForm(f => ({ ...f, color }))}
                          className={`w-6 h-6 rounded-full border-2 transition-all shrink-0 hover:scale-105 ${
                            editForm.color === color
                              ? 'border-neutral-400 dark:border-neutral-500 scale-110 shadow-md ring-2 ring-neutral-200 dark:ring-neutral-800'
                              : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color }}
                          title={`Select color ${color}`}
                        />
                      ))}
                    </div>
                  </div>

                  {!isCreating && (
                    <div className="flex items-center justify-between rounded-lg border border-neutral-200/50 dark:border-white/5 px-3 py-2.5">
                      <div>
                        <p className="text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">Active</p>
                        <p className="text-[9px] text-neutral-400">Hidden from the public listing when off</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={editForm.isActive}
                        onClick={() => setEditForm(f => ({ ...f, isActive: !f.isActive }))}
                        className={`relative w-9 h-5 rounded-full transition-colors ${
                          editForm.isActive ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-700'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                            editForm.isActive ? 'left-[18px]' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 p-4 border-t border-neutral-200/50 dark:border-white/5 bg-neutral-50/50 dark:bg-neutral-900/30 flex justify-between gap-3">
                <button
                  onClick={handleSave}
                  disabled={isSaving || !editForm.name.trim()}
                  className="flex-1 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                >
                  {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {isCreating ? 'Create Type' : 'Save Details'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="px-4 py-2 border border-neutral-200 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors shadow-sm"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Archive confirmation dialog */}
      <AnimatePresence>
        {archiveTarget && (
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
                      Archive Event Type
                    </h3>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                      Hide <strong className="text-neutral-850 dark:text-white">{archiveTarget.name}</strong> from the
                      public listing? Events keep their type — you can re-activate anytime.
                    </p>
                  </div>
                </div>

                {(archiveTarget.eventCount ?? 0) > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/10 text-amber-650 dark:text-amber-400 space-y-1">
                    <p className="text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
                      <AlertTriangle size={10} /> {archiveTarget.eventCount} live event(s) use this type
                    </p>
                    <p className="text-[10px] leading-relaxed">
                      Archiving hides the type from the public listing, but the events keep their type string and
                      remain listed. Deactivate only if this type is being retired.
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setArchiveTarget(null)}
                    className="flex-1 py-2 border border-neutral-200 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors shadow-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleArchive}
                    disabled={isSaving}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-650 disabled:opacity-40 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                  >
                    {isSaving ? <Loader2 size={13} className="animate-spin" /> : <><Trash2 size={12} /> Archive</>}
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
