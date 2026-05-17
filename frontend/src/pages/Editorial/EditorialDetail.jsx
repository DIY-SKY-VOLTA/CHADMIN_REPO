import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  CheckCircle, 
  XCircle, 
  Save, 
  Eye,
  Globe,
  Clock,
  Tag,
  User,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import adminAPI from '@/api/adminAPI';
import BlockEditor from '../../components/Editor/BlockEditor';
import './writeBlogEditor.css';
import './blogdetails.css';

const EditorialDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [showRejectionPanel, setShowRejectionPanel] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const editorRef = useRef(null);

  useEffect(() => {
    fetchPost();
  }, [id]);

  const fetchPost = async () => {
    try {
      const response = await adminAPI.get(`/blogs/submissions/${id}`);
      if (response.success && response.submission) {
        setPost(response.submission);
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

  const handleAction = async (action) => {
    setIsProcessing(true);
    try {
      const endpoint = `/blogs/submissions/${id}/${action}`;
      const response = await adminAPI.post(endpoint, { 
        ...post,
        feedback: feedback || (action === 'approve' ? 'Approved' : '')
      });
      
      if (response.success) {
        toast.success(`${action}d`);
        navigate('/editorial');
      }
    } catch {
      toast.error(`Failed to ${action}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00f0ff] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top Bar - Responsive layout */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 px-4 py-3 bg-white dark:bg-[#18181a] border-b border-gray-200 dark:border-white/10 transition-colors">
        <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/editorial')} className="p-2.5 rounded-[8px] text-gray-500 dark:text-[#a8b3cf] hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all">
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[#00f0ff] uppercase tracking-wider">{post.category || 'General'}</span>
              {hasChanges ? (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ffa502]/10 border border-[#ffa502]/20 text-[9px] font-bold text-[#ffa502]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ffa502] animate-pulse"></span>
                  Unsaved Changes
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#10b981]/10 border border-[#10b981]/20 text-[9px] font-bold text-[#10b981]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]"></span>
                  Saved
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons - Compact grid/segment on mobile, compact list on desktop */}
        <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2.5 w-full sm:w-auto">
          <button 
            onClick={() => setShowSidebar(!showSidebar)}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-2.5 py-2 sm:px-3.5 sm:py-2 rounded-[8px] text-[10px] sm:text-xs font-bold uppercase transition-all ${
              showSidebar 
                ? 'bg-[#00f0ff]/15 border border-[#00f0ff]/20 text-[#00f0ff]' 
                : 'bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white border border-transparent hover:bg-gray-200 dark:hover:bg-white/15'
            }`}
          >
            <User size={13} />
            <span>Details</span>
          </button>
          <button 
            onClick={() => handleAction('save')} 
            disabled={!hasChanges} 
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-2.5 py-2 sm:px-3.5 sm:py-2 bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white border border-transparent rounded-[8px] text-[10px] sm:text-xs font-bold uppercase hover:bg-gray-200 dark:hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Save size={13} />
            <span>Save</span>
          </button>
          <button 
            onClick={() => setShowRejectionPanel(true)} 
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-2.5 py-2 sm:px-3.5 sm:py-2 border border-[#ff4757]/30 text-[#ff4757] rounded-[8px] text-[10px] sm:text-xs font-bold uppercase hover:bg-[#ff4757]/10 transition-all"
          >
            <XCircle size={13} />
            <span>Reject</span>
          </button>
          <button 
            onClick={() => handleAction('approve')} 
            disabled={isProcessing} 
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-2.5 py-2 sm:px-4 sm:py-2 bg-[#00f0ff] text-[#0d0d0f] rounded-[8px] text-[10px] sm:text-xs font-bold uppercase hover:opacity-90 transition-all"
          >
            {isProcessing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
            <span>Publish</span>
          </button>
        </div>
      </div>

      {/* Content Area - Always Row to allow right sidebar positioning on all screens */}
      <div className="flex-1 flex flex-row overflow-hidden relative transition-colors">
        {/* Editor - Scrollable */}
        <div className="flex-1 overflow-y-auto h-full">
          <div className="max-w-3xl mx-auto py-3 md:py-6">
            {/* Seamless, Frameless Document Canvas */}
            <div className="p-4 md:p-8">
              <BlockEditor 
                title={post.title}
                onTitleChange={(title) => handleUpdate({ title })}
                coverImage={post.coverImage}
                onCoverImageChange={(url) => handleUpdate({ coverImage: url })}
                content={post.content}
                onChange={(content) => handleUpdate({ content })}
                onEditorReady={(editor) => editorRef.current = editor}
                author={post.author}
                hideHeader={false}
              />
            </div>
          </div>
        </div>

        {/* Backdrop overlay for mobile screen drawer */}
        {showSidebar && (
          <div 
            onClick={() => setShowSidebar(false)} 
            className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-all duration-300"
          />
        )}

        {/* Sidebar - Collapsible sliding drawer on mobile, inline panel on desktop */}
        {showSidebar && (
          <aside className="fixed md:relative inset-y-0 right-0 z-50 md:z-auto w-72 md:w-56 shrink-0 h-full bg-white dark:bg-[#18181a] md:bg-gray-100 dark:md:bg-[#18181a] border-l border-gray-200 dark:border-white/10 overflow-y-auto shadow-2xl md:shadow-none transition-all duration-300">
            {/* Header for mobile sidebar overlay */}
            <div className="flex md:hidden items-center justify-between p-4 border-b border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-[#0d0d0f]">
              <span className="text-[10px] font-bold text-gray-500 dark:text-[#a8b3cf] uppercase tracking-wider">Submission Info</span>
              <button 
                onClick={() => setShowSidebar(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors"
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="p-4 grid grid-cols-1 gap-3">
              {/* Author */}
              <div className="bg-white dark:bg-[#0d0d0f] rounded-[10px] p-3.5 border border-gray-200 dark:border-white/5 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <User size={12} className="text-gray-500 dark:text-[#a8b3cf]" />
                  <span className="text-[9px] font-bold text-gray-500 dark:text-[#a8b3cf] uppercase">Author</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <img src={post.author?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin'} alt="" className="w-8 h-8 rounded-[6px] border border-gray-200 dark:border-white/10" />
                  <div>
                    <p className="text-xs font-semibold text-gray-900 dark:text-white transition-colors">{post.author?.name}</p>
                    <p className="text-[9px] text-gray-500 dark:text-[#a8b3cf] transition-colors">{post.author?.email}</p>
                  </div>
                </div>
              </div>

              {/* Slug */}
              <div className="bg-white dark:bg-[#0d0d0f] rounded-[10px] p-3.5 border border-gray-200 dark:border-white/5 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <Globe size={12} className="text-gray-500 dark:text-[#a8b3cf]" />
                  <span className="text-[9px] font-bold text-gray-500 dark:text-[#a8b3cf] uppercase">Slug</span>
                </div>
                <p className="text-[10px] text-gray-900 dark:text-white font-mono truncate transition-colors">{post.slug}</p>
              </div>

              {/* Date */}
              <div className="bg-white dark:bg-[#0d0d0f] rounded-[10px] p-3.5 border border-gray-200 dark:border-white/5 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={12} className="text-gray-500 dark:text-[#a8b3cf]" />
                  <span className="text-[9px] font-bold text-gray-500 dark:text-[#a8b3cf] uppercase">Submitted</span>
                </div>
                <p className="text-xs text-gray-900 dark:text-white transition-colors">{new Date(post.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>

              {/* Tags */}
              {post.tags?.length > 0 && (
                <div className="bg-white dark:bg-[#0d0d0f] rounded-[10px] p-3.5 border border-gray-200 dark:border-white/5 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <Tag size={12} className="text-gray-500 dark:text-[#a8b3cf]" />
                    <span className="text-[9px] font-bold text-gray-500 dark:text-[#a8b3cf] uppercase">Tags</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {post.tags.map(tag => (
                      <span key={tag} className="px-2 py-1 bg-gray-100 dark:bg-white/5 rounded text-[9px] text-gray-600 dark:text-[#a8b3cf]">{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* View Live */}
              {post.status === 'approved' && post.sanityUrl && (
                <a href={post.sanityUrl} target="_blank" rel="noopener" className="flex items-center justify-center gap-2 w-full py-3 bg-[#00f0ff]/15 text-[#00f0ff] rounded-[10px] text-xs font-bold uppercase hover:bg-[#00f0ff]/25 transition-all">
                  <Eye size={14} />
                  View Live
                </a>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showRejectionPanel && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="w-full max-w-md bg-white dark:bg-[#18181a] rounded-[12px] p-5 border border-black/5 dark:border-white/10 transition-colors">
              <div className="flex items-center gap-3 text-[#ff4757] mb-4">
                <AlertTriangle size={20} />
                <span className="text-base font-bold text-gray-900 dark:text-white uppercase transition-colors">Reject Submission</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-[#a8b3cf] mb-4 transition-colors">Feedback will be sent to the author.</p>
              <textarea 
                value={feedback} 
                onChange={(e) => setFeedback(e.target.value)} 
                placeholder="Reason for rejection..." 
                className="w-full h-32 bg-gray-50 dark:bg-[#0d0d0f] rounded-[10px] p-4 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#a8b3cf]/50 border border-black/5 dark:border-white/10 resize-none focus:border-[#ff4757]/50 focus:outline-none transition-colors" 
              />
              <div className="flex gap-3 mt-4">
                <button 
                  onClick={() => setShowRejectionPanel(false)} 
                  className="flex-1 py-3 border border-black/5 dark:border-white/10 rounded-[10px] text-sm font-bold uppercase text-gray-500 dark:text-[#a8b3cf] hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleAction('reject')} 
                  disabled={!feedback} 
                  className="flex-1 py-3 bg-[#ff4757] text-white rounded-[10px] text-sm font-bold uppercase disabled:opacity-40 transition-all"
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