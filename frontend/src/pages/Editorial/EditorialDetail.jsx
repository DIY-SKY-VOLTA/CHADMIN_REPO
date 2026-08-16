import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  CheckCircle, 
  XCircle, 
  Save, 
  Eye, EyeOff,
  Globe, Clock, Tag, User, AlertTriangle, Loader2,
  FileText, BookOpen, Hash, Type, Edit3,
  Monitor
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import adminAPI from '@/api/adminAPI';
import BlockEditor from '../../components/Editor/BlockEditor';
import './writeBlogEditor.css';
import './blogdetails.css';

const formatSavedTime = (value) => {
  if (!value) return 'Not saved yet';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not saved yet';
  return `Saved ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const normalizeContent = (content) => {
  if (!content) return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
  if (typeof content === 'object') return content;
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
};

const countWordsInDoc = (content) => {
  if (!content) return 0;
  const doc = typeof content === 'object' ? content : {};
  let count = 0;
  const walk = (node) => {
    if (!node) return;
    if (node.text && typeof node.text === 'string') {
      count += node.text.trim().split(/\s+/).filter(Boolean).length;
    }
    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
  };
  walk(doc);
  return count;
};

const estimateReadTime = (wordCount) => {
  const minutes = Math.max(1, Math.round(wordCount / 200));
  return `${minutes} min read`;
};

const EditorialDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [showRejectionPanel, setShowRejectionPanel] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showSidebar, setShowSidebar] = useState(() => window.innerWidth >= 1024);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [categories, setCategories] = useState([]);
  const editorRef = useRef(null);
  const autoSaveRef = useRef(null);
  const draftSnapshotRef = useRef('');

  useEffect(() => {
    fetchPost();
    fetchCategories();
  }, [id]);

  useEffect(() => {
    if (post) {
      draftSnapshotRef.current = JSON.stringify(post);
    }
  }, [post?.title, post?.content, post?.excerpt, post?.coverImage, post?.coverImageAlt, post?.coverImageCaption, post?.slug, post?.metaTitle, post?.metaDescription, post?.category, post?.tags, post?.readTime]);

  useEffect(() => {
    if (!hasChanges || isPreviewMode) return;
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await adminAPI.post(`/blogs/submissions/${id}/save`, {
          title: post.title,
          content: typeof post.content === 'object' ? JSON.stringify(post.content) : post.content,
          excerpt: post.excerpt,
          coverImage: post.coverImage,
          coverImageAlt: post.coverImageAlt,
          coverImageCaption: post.coverImageCaption,
          slug: post.slug,
          metaTitle: post.metaTitle,
          metaDescription: post.metaDescription,
          category: post.category,
          tags: post.tags,
          readTime: post.readTime,
        });
        setHasChanges(false);
        setLastSaved(new Date());
        draftSnapshotRef.current = JSON.stringify(post);
      } catch {
        // silent — auto-save failures shouldn't bother the admin
      } finally {
        setIsSaving(false);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [hasChanges, post, id, isPreviewMode]);

  const fetchCategories = async () => {
    try {
      const res = await adminAPI.get('/categories');
      if (res.success && res.categories) {
        setCategories(res.categories);
      }
    } catch {
      // silent
    }
  };

  const fetchPost = async () => {
    try {
      const response = await adminAPI.get(`/blogs/submissions/${id}`);
      if (response.success && response.submission) {
        setPost(response.submission);
        setHasChanges(false);
        setLastSaved(response.submission.updatedAt || response.submission.createdAt || Date.now());
      } else {
        toast.error('Submission not found');
        navigate('/editorial');
      }
    } catch {
      toast.error('Failed to load');
      navigate('/editorial');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = (updates) => {
    setPost(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const togglePreview = () => {
    setIsPreviewMode((prev) => {
      const next = !prev;
      if (next) setShowSidebar(false);
      return next;
    });
  };

  const previewBlog = async () => {
    try {
      toast.loading('Generating preview...', { id: 'preview' });
      const res = await adminAPI.get(`/preview/${id}`);
      if (res.success && res.preview) {
        const blob = new Blob([res.preview], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        toast.success('Preview ready', { id: 'preview' });
      } else {
        toast.error('Preview generation failed', { id: 'preview' });
      }
    } catch {
      toast.error('Failed to generate preview', { id: 'preview' });
    }
  };

  const handleAction = async (action) => {
    setIsProcessing(true);
    try {
      const endpoint = `/blogs/submissions/${id}/${action}`;
      const body = {
        title: post.title,
        content: typeof post.content === 'object' ? JSON.stringify(post.content) : post.content,
        excerpt: post.excerpt,
        coverImage: post.coverImage,
        coverImageAlt: post.coverImageAlt,
        coverImageCaption: post.coverImageCaption,
        slug: post.slug,
        metaTitle: post.metaTitle,
        metaDescription: post.metaDescription,
        category: post.category,
        tags: post.tags,
        readTime: post.readTime,
        feedback: feedback || (action === 'approve' ? 'Approved' : ''),
      };
      const response = await adminAPI.post(endpoint, body);
      if (response.success) {
        toast.success(`${action}d`);
        if (action === 'save') {
          setHasChanges(false);
          setLastSaved(new Date());
        } else {
          navigate('/editorial');
        }
      }
    } catch {
      toast.error(`Failed to ${action}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const wordCount = useMemo(() => countWordsInDoc(post?.content), [post?.content]);
  const autoReadTime = useMemo(() => estimateReadTime(wordCount), [wordCount]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-neutral-50/30 dark:bg-[#0d0d0f]/20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={22} className="animate-spin text-neutral-450 dark:text-neutral-500" />
          <span className="text-xs text-neutral-450 font-mono tracking-widest uppercase">Loading submission...</span>
        </div>
      </div>
    );
  }

  const activeAuthor = post?.author || {
    name: 'Admin Reviewer',
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(post?.author?.name || 'Admin Reviewer')}`,
  };

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-400/40">
      {/* Status Bar */}
      <header className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-2.5 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div className="flex items-center justify-between sm:justify-start gap-4 min-w-0 flex-1">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/editorial')}
              className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-550 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm"
              title="Back to queue"
            >
              <ArrowLeft size={14} />
            </button>
            <div className="min-w-0">
              <span className="text-[9.5px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider font-mono block">
                {post.category || 'General'}
              </span>
              <h2 className="text-xs font-bold text-neutral-805 dark:text-white truncate max-w-[240px] leading-tight">
                {post.title || 'Untitled Submission'}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-neutral-450 dark:text-neutral-500 font-mono shrink-0">
            <span className="hidden sm:flex items-center gap-1">
              <FileText size={10} />
              {wordCount.toLocaleString()} words
            </span>
            <span className="hidden sm:flex items-center gap-1">
              <BookOpen size={10} />
              {autoReadTime}
            </span>
            <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold ${
              isSaving
                ? 'bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500'
                : hasChanges
                  ? 'bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500'
                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isSaving ? 'bg-amber-500 animate-pulse' : hasChanges ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              {isSaving ? 'Saving...' : hasChanges ? 'Unsaved' : formatSavedTime(lastSaved)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => previewBlog()}
            className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-550 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-semibold"
            title="Open Sanity preview"
          >
            <Monitor size={12} />
            <span>Sanity View</span>
          </button>
          <button
            onClick={() => setShowSidebar((prev) => !prev)}
            className={`p-1.5 rounded-lg border text-[11px] font-semibold transition-all shadow-sm flex items-center gap-1.5 ${
              showSidebar
                ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-neutral-900 dark:border-white'
                : 'bg-white dark:bg-[#18181b] border-neutral-200/50 dark:border-white/5 text-neutral-550 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-white/5'
            }`}
          >
            <Edit3 size={12} />
            <span>Meta</span>
          </button>
          <button
            onClick={togglePreview}
            className={`p-1.5 rounded-lg border text-[11px] font-semibold transition-all shadow-sm flex items-center gap-1.5 ${
              isPreviewMode
                ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-neutral-900 dark:border-white'
                : 'bg-white dark:bg-[#18181b] border-neutral-200/50 dark:border-white/5 text-neutral-550 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-white/5'
            }`}
          >
            {isPreviewMode ? <EyeOff size={12} /> : <Eye size={12} />}
            <span>Preview</span>
          </button>
          <button
            onClick={() => handleAction('save')}
            disabled={!hasChanges || isProcessing}
            className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-550 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 text-[11px] font-semibold"
          >
            <Save size={12} />
            <span>{isProcessing ? 'Saving' : 'Save'}</span>
          </button>
          <button
            onClick={() => setShowRejectionPanel(true)}
            className="p-1.5 rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-550/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-655 dark:text-red-400 transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-semibold"
          >
            <XCircle size={12} />
            <span>Reject</span>
          </button>
          <button
            onClick={() => handleAction('approve')}
            disabled={isProcessing}
            className="p-1.5 rounded-lg bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 text-white transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5 text-[11px] font-semibold"
          >
            {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            <span>Publish</span>
          </button>
        </div>
      </header>

      {/* Editor + Sidebar */}
      <div className="flex-1 flex flex-row overflow-hidden relative">
        <div className={`flex-1 overflow-y-auto ${isPreviewMode ? 'p-10 max-w-4xl mx-auto' : ''}`}>
          <div className="h-full bg-white dark:bg-[#151518]/30 border border-neutral-200/40 dark:border-white/5 rounded-2xl m-6 overflow-y-auto p-6 shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
            <BlockEditor
              title={post.title}
              onTitleChange={(title) => handleUpdate({ title })}
              coverImage={post.coverImage}
              onCoverImageChange={(url) => handleUpdate({ coverImage: url })}
              content={normalizeContent(post.content)}
              onChange={(content) => handleUpdate({ content })}
              onEditorReady={(editor) => editorRef.current = editor}
              isPreviewMode={isPreviewMode}
              author={activeAuthor}
              hideHeader={false}
              blogId={post.id || post._id || ''}
            />
          </div>
        </div>

        {/* SEO Metadata Sidebar */}
        {showSidebar && (
          <aside className="w-72 shrink-0 border-l border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#151518]/80 backdrop-blur-md overflow-y-auto p-4 space-y-4">
            <div className="bg-neutral-50 dark:bg-[#0c0c0e]/30 rounded-xl p-3.5 border border-neutral-200/40 dark:border-white/5">
              <div className="flex items-center gap-1.5 mb-2 text-neutral-400 dark:text-neutral-500">
                <User size={12} />
                <span className="text-[9px] font-bold uppercase tracking-wider">Author</span>
              </div>
              <div className="flex items-center gap-2.5">
                <img src={activeAuthor.avatar} alt="" className="w-8 h-8 rounded-lg border border-neutral-200 dark:border-white/10" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-neutral-800 dark:text-white truncate">{activeAuthor.name}</p>
                  <p className="text-[9px] text-neutral-450 truncate mt-0.5">{post.author?.email}</p>
                </div>
              </div>
            </div>

            <div className="bg-neutral-50 dark:bg-[#0c0c0e]/30 rounded-xl p-3.5 border border-neutral-200/40 dark:border-white/5">
              <div className="flex items-center gap-1.5 mb-2 text-neutral-400 dark:text-neutral-500">
                <Globe size={12} />
                <span className="text-[9px] font-bold uppercase tracking-wider">Slug</span>
              </div>
              <div className="text-[10px] text-neutral-500 font-mono truncate mb-1">contesthopper.live/blog/</div>
              <input
                type="text"
                value={post.slug || ''}
                onChange={(e) => handleUpdate({ slug: e.target.value })}
                className="w-full bg-white dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors font-mono"
              />
            </div>

            <div className="bg-neutral-50 dark:bg-[#0c0c0e]/30 rounded-xl p-3.5 border border-neutral-200/40 dark:border-white/5">
              <div className="flex items-center gap-1.5 mb-2 text-neutral-400 dark:text-neutral-500">
                <Clock size={12} />
                <span className="text-[9px] font-bold uppercase tracking-wider">Read Time</span>
              </div>
              <input
                type="text"
                value={post.readTime || autoReadTime}
                onChange={(e) => handleUpdate({ readTime: e.target.value })}
                className="w-full bg-white dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors"
              />
            </div>

            <div className="bg-neutral-50 dark:bg-[#0c0c0e]/30 rounded-xl p-3.5 border border-neutral-200/40 dark:border-white/5">
              <div className="flex items-center gap-1.5 mb-2 text-neutral-400 dark:text-neutral-500">
                <Hash size={12} />
                <span className="text-[9px] font-bold uppercase tracking-wider">Category</span>
              </div>
              <select
                value={post.category || ''}
                onChange={(e) => handleUpdate({ category: e.target.value })}
                className="w-full bg-white dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors"
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat.name || cat._id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div className="bg-neutral-50 dark:bg-[#0c0c0e]/30 rounded-xl p-3.5 border border-neutral-200/40 dark:border-white/5">
              <div className="flex items-center gap-1.5 mb-2 text-neutral-400 dark:text-neutral-500">
                <Tag size={12} />
                <span className="text-[9px] font-bold uppercase tracking-wider">Tags</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(post.tags || []).map((tag, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 rounded-full text-[9px] font-semibold border border-neutral-200/30 dark:border-white/5">
                    {tag}
                    <button
                      onClick={() => handleUpdate({ tags: (post.tags || []).filter((_, j) => j !== i) })}
                      className="hover:text-red-500 transition-colors"
                    >
                      <XCircle size={8} />
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                placeholder="Type tag and press Enter"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    const newTag = e.target.value.trim().toLowerCase();
                    if ((post.tags || []).length >= 5) {
                      toast.error('Max 5 tags');
                      return;
                    }
                    if (!(post.tags || []).includes(newTag)) {
                      handleUpdate({ tags: [...(post.tags || []), newTag] });
                    }
                    e.target.value = '';
                  }
                }}
                className="w-full bg-white dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors"
              />
            </div>

            <div className="bg-neutral-50 dark:bg-[#0c0c0e]/30 rounded-xl p-3.5 border border-neutral-200/40 dark:border-white/5">
              <div className="flex items-center gap-1.5 mb-2 text-neutral-400 dark:text-neutral-500">
                <Type size={12} />
                <span className="text-[9px] font-bold uppercase tracking-wider">Excerpt</span>
              </div>
              <textarea
                value={post.excerpt || ''}
                onChange={(e) => handleUpdate({ excerpt: e.target.value })}
                rows={3}
                className="w-full bg-white dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors resize-none"
              />
            </div>

            <div className="bg-neutral-50 dark:bg-[#0c0c0e]/30 rounded-xl p-3.5 border border-neutral-200/40 dark:border-white/5">
              <div className="flex items-center gap-1.5 mb-2 text-neutral-400 dark:text-neutral-500">
                <Type size={12} />
                <span className="text-[9px] font-bold uppercase tracking-wider">Meta Title</span>
              </div>
              <input
                type="text"
                value={post.metaTitle || ''}
                onChange={(e) => handleUpdate({ metaTitle: e.target.value })}
                className="w-full bg-white dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors"
              />
            </div>

            <div className="bg-neutral-50 dark:bg-[#0c0c0e]/30 rounded-xl p-3.5 border border-neutral-200/40 dark:border-white/5">
              <div className="flex items-center gap-1.5 mb-2 text-neutral-400 dark:text-neutral-500">
                <Type size={12} />
                <span className="text-[9px] font-bold uppercase tracking-wider">Meta Description</span>
              </div>
              <textarea
                value={post.metaDescription || ''}
                onChange={(e) => handleUpdate({ metaDescription: e.target.value })}
                rows={3}
                className="w-full bg-white dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors resize-none"
              />
            </div>

            <div className="bg-neutral-50 dark:bg-[#0c0c0e]/30 rounded-xl p-3.5 border border-neutral-200/40 dark:border-white/5">
              <div className="flex items-center gap-1.5 mb-2 text-neutral-400 dark:text-neutral-500">
                <Clock size={12} />
                <span className="text-[9px] font-bold uppercase tracking-wider">Submitted</span>
              </div>
              <p className="text-xs text-neutral-700 dark:text-neutral-300">
                {new Date(post.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {post.status === 'approved' && post.sanityUrl && (
              <a
                href={post.sanityUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-100 text-white dark:text-neutral-900 rounded-xl text-xs font-bold uppercase transition-all shadow-sm"
              >
                <Eye size={12} />
                View Live Link
              </a>
            )}
          </aside>
        )}
      </div>

      {/* Rejection Modal */}
      <AnimatePresence>
        {showRejectionPanel && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-md bg-white dark:bg-[#151518] rounded-2xl p-5 border border-neutral-200/40 dark:border-white/5 shadow-2xl"
            >
              <div className="flex items-center gap-2.5 text-red-655 dark:text-red-500 mb-3">
                <AlertTriangle size={18} />
                <span className="text-xs font-bold text-neutral-850 dark:text-white uppercase tracking-wider">Reject Submission</span>
              </div>
              <p className="text-[11px] text-neutral-450 dark:text-neutral-500 mb-4 leading-relaxed">
                Provide constructive review feedback explaining the reason for rejection. This will be sent to the author.
              </p>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Write specific reviewer comments..."
                className="w-full h-32 bg-neutral-50 dark:bg-[#0c0c0e]/30 rounded-xl p-3.5 text-xs text-neutral-800 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 border border-neutral-200/60 dark:border-white/5 resize-none focus:border-neutral-450 dark:focus:border-white/20 focus:outline-none transition-colors shadow-inner"
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setShowRejectionPanel(false)}
                  className="flex-1 py-2.5 border border-neutral-250 dark:border-white/5 rounded-xl text-xs font-bold uppercase text-neutral-550 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleAction('reject')}
                  disabled={!feedback}
                  className="flex-1 py-2.5 bg-red-655 dark:bg-red-500 text-white rounded-xl text-xs font-bold uppercase disabled:opacity-40 transition-all shadow-sm"
                >
                  Confirm Reject
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default EditorialDetail;