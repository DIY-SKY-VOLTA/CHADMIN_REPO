import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Typography from '@tiptap/extension-typography';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import {
  Bold, Italic, Link as LinkIcon, Heading1, Heading2, Heading3, Quote,
  List, ListOrdered, Code, Image as ImageIcon,
  Trash2, CheckCircle2, Sigma, Bookmark, Undo, Redo, Send,
  Calendar, Clock
} from 'lucide-react';
import { toast } from 'sonner';

import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import gsap from 'gsap';

import { SlashCommand } from './SlashCommand';
import CommandList from './CommandList';
import { MathExtension } from './extensions/MathExtension';
import { Citation } from './extensions/Citation';
import { CustomImage } from './extensions/CustomImage';
import './BlockEditor.css';

const lowlight = createLowlight(common);

const CitationToast = ({ t, editor, range }) => {
  const [val, setVal] = useState(editor.getAttributes('citation').source || '');

  const submit = () => {
    if (!val) {
      toast.dismiss(t);
      return;
    }
    if (range) {
      // For slash commands: insert the citation text with the mark
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'text',
        text: `[${val}]`,
        marks: [{ type: 'citation', attrs: { source: val } }]
      }).run();
    } else {
      // For bubble menu/selection: just set the mark
      editor.chain().focus().setCitation({ source: val }).run();
    }
    toast.dismiss(t);
  };

  return (
    <div className="citation-popup-toast" onClick={(e) => e.stopPropagation()}>
      <div className="citation-popup-header">
        <Bookmark className="icon-small" />
        <span>Add Citation</span>
      </div>
      <div className="citation-popup-input-wrap">
        <input
          autoFocus
          type="text"
          value={val}
          placeholder="Author, Year (e.g. Smith, 2024)"
          className="citation-popup-input"
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="citation-popup-btn" onClick={(e) => { e.preventDefault(); submit(); }}>
          <Send className="icon-small" />
        </button>
      </div>
    </div>
  );
};

export default function BlockEditor({
  content,
  onChange,
  onTitleChange,
  onCoverImageChange,
  onEditorReady,
  isPreviewMode,
  title,
  coverImage,
  author,
  hideHeader = false
}) {
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const [onImageSelected, setOnImageSelected] = useState(null);

  const [linkUrl, setLinkUrl] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [showAltInput, setShowAltInput] = useState(false);
  const [altText, setAltText] = useState('');
  const [showHeadingLevels, setShowHeadingLevels] = useState(false);
  const [showCoverInput, setShowCoverInput] = useState(false);
  const [coverUrl, setCoverUrl] = useState('');

  const PRESET_COVERS = [
    { name: 'Landscape', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Abstract', url: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Architecture', url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Minimal', url: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&q=80&w=1000' },
  ];

  // GSAP Animation for Cover Input Panel
  useEffect(() => {
    if (showCoverInput && coverInputRef.current) {
      gsap.fromTo(
        coverInputRef.current,
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' }
      );
    }
  }, [showCoverInput]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && onImageSelected) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result;
        onImageSelected(src);
        setOnImageSelected(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: ({ node, editor }) => {
          if (node.type.name === 'heading') return 'Heading...';
          if (editor.isEmpty) {
            return "Type '/' for commands, or start writing your masterpiece...";
          }
          return "Press '/' for commands...";
        },
      }),
      CustomImage,
      Typography,
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight }),
      MathExtension,
      Citation,
      SlashCommand.configure({
        suggestion: {
          items: ({ query }) => {
            return [
              {
                title: 'Bold',
                description: 'Make text bold',
                icon: <Bold className="icon-small" />,
                command: ({ editor, range }) => {
                  editor.chain().focus().deleteRange(range).setMark('bold').run();
                },
              },
              {
                title: 'Italic',
                description: 'Make text italic',
                icon: <Italic className="icon-small" />,
                command: ({ editor, range }) => {
                  editor.chain().focus().deleteRange(range).setMark('italic').run();
                },
              },
              {
                title: 'Link',
                description: 'Add a hyperlink',
                icon: <LinkIcon className="icon-small" />,
                command: ({ editor, range }) => {
                  const url = window.prompt('Enter URL');
                  if (url) {
                    editor.chain().focus().deleteRange(range).setLink({ href: url }).run();
                  }
                },
              },
              {
                title: 'Heading 1',
                description: 'Large title block',
                icon: <Heading1 className="icon-small" />,
                command: ({ editor, range }) => {
                  editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
                },
              },
              {
                title: 'Heading 2',
                description: 'Medium section heading',
                icon: <Heading2 className="icon-small" />,
                command: ({ editor, range }) => {
                  editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
                },
              },
              {
                title: 'Heading 3',
                description: 'Small section heading',
                icon: <Heading3 className="icon-small" />,
                command: ({ editor, range }) => {
                  editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
                },
              },
              {
                title: 'Bullet List',
                description: 'Create a simple list',
                icon: <List className="icon-small" />,
                command: ({ editor, range }) => {
                  editor.chain().focus().deleteRange(range).toggleBulletList().run();
                },
              },
              {
                title: 'Ordered List',
                description: 'Number your points',
                icon: <ListOrdered className="icon-small" />,
                command: ({ editor, range }) => {
                  editor.chain().focus().deleteRange(range).toggleOrderedList().run();
                },
              },
              {
                title: 'Quote',
                description: 'Insert a blockquote',
                icon: <Quote className="icon-small" />,
                command: ({ editor, range }) => {
                  editor.chain().focus().deleteRange(range).toggleBlockquote().run();
                },
              },
              {
                title: 'Code Block',
                description: 'Capture a code snippet',
                icon: <Code className="icon-small" />,
                command: ({ editor, range }) => {
                  editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
                },
              },
              {
                title: 'Math Block',
                description: 'Insert LaTeX mathematics',
                icon: <Sigma className="icon-small" />,
                command: ({ editor, range }) => {
                  editor.chain().focus().deleteRange(range).setMath().run();
                },
              },
              {
                title: 'Citation',
                description: 'Reference a source',
                icon: <Bookmark className="icon-small" />,
                command: ({ editor, range }) => {
                  toast.custom((t) => <CitationToast t={t} editor={editor} range={range} />, { duration: 10000 });
                },
              },
              {
                title: 'Image',
                description: 'Upload from your computer',
                icon: <ImageIcon className="icon-small" />,
                command: ({ editor, range }) => {
                  setOnImageSelected(() => (src) => {
                    editor.chain().focus().deleteRange(range).setImage({ src }).run();
                  });
                  setTimeout(() => fileInputRef.current?.click(), 0);
                },
              },
              {
                title: 'Task List',
                description: 'Track progress with tasks',
                icon: <CheckCircle2 className="icon-small" />,
                command: ({ editor, range }) => {
                  editor.chain().focus().deleteRange(range).toggleTaskList().run();
                },
              },
            ].filter(item => item.title.toLowerCase().startsWith(query.toLowerCase()));
          },
          render: () => {
            let component;
            let popup;

            return {
              onStart: (props) => {
                component = new ReactRenderer(CommandList, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) return;

                const tippyInstance = tippy(document.body, {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                });
                popup = Array.isArray(tippyInstance) ? tippyInstance[0] : tippyInstance;
              },

              onUpdate(props) {
                component?.updateProps(props);
                if (!props.clientRect || !popup) return;
                popup.setProps({ getReferenceClientRect: props.clientRect });
              },

              onKeyDown(props) {
                if (props.event.key === 'Escape') {
                  if (popup) popup.hide();
                  return true;
                }
                return component?.ref?.onKeyDown(props);
              },

              onExit() {
                if (popup) {
                  popup.destroy();
                  popup = null;
                }
                if (component) {
                  component.destroy();
                  component = null;
                }
              },
            };
          },
        },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    onCreate: ({ editor }) => {
      onEditorReady?.(editor);
    },
    editorProps: {
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
              const src = e.target?.result;
              const { schema } = view.state;
              const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (coordinates) {
                const node = schema.nodes.image.create({ src });
                const transaction = view.state.tr.insert(coordinates.pos, node);
                view.dispatch(transaction);
              }
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              const reader = new FileReader();
              reader.onload = (e) => {
                const src = e.target?.result;
                const node = view.state.schema.nodes.image.create({ src });
                const transaction = view.state.tr.replaceSelectionWith(node);
                view.dispatch(transaction);
              };
              reader.readAsDataURL(file);
              return true;
            }
          }
        }
        return false;
      },
      attributes: {
        class: `prose-editor ${isPreviewMode ? 'blog-details-article-prose prose-preview' : ''}`,
      },
    },
    editable: !isPreviewMode,
  });

  useEffect(() => {
    if (editor) {
      editor.setEditable(!isPreviewMode);
    }
  }, [isPreviewMode, editor]);

  // Sync content when it changes from outside (e.g. switching modes)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  const setLink = useCallback(() => {
    if (editor) {
      if (linkUrl === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
      } else {
        editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
      }
      setLinkUrl('');
      setShowLinkInput(false);
    }
  }, [editor, linkUrl]);

  const setAlt = useCallback(() => {
    editor.chain().focus().updateAttributes('image', { alt: altText }).run();
    setShowAltInput(false);
  }, [editor, altText]);

  if (!editor) return null;

  return (
    <div
      className="editor-wrapper"
      onClick={(e) => {
        // Only focus if we clicked the wrapper directly or the content area
        // Avoid focusing if we clicked an input, button, or existing node view
        if (e.target === e.currentTarget || e.target.classList.contains('editor-wrapper')) {
          editor.chain().focus().run();
        }
      }}
    >
      {/* Cover Image Area */}
      {!hideHeader && (coverImage || !isPreviewMode) ? (
        <div className="cover-section">
          {coverImage ? (
            <div className={`cover-image-container ${!isPreviewMode ? 'editable' : ''} ${isPreviewMode ? 'blog-details-hero-image-wrapper' : ''}`}>
              <img src={coverImage} alt="Cover" className={isPreviewMode ? "blog-details-hero-image" : "cover-image"} />
              {!isPreviewMode && (
                <div className="cover-actions-overlay">
                  <button
                    onClick={() => setShowCoverInput(true)}
                    className="btn-change-cover"
                  >
                    Change Image
                  </button>
                  <button
                    onClick={() => onCoverImageChange?.('')}
                    className="btn-remove-cover"
                  >
                    <Trash2 className="icon-small" />
                  </button>
                </div>
              )}
              {isPreviewMode && <div className="blog-details-hero-overlay" />}
            </div>
          ) : (
            <div className="cover-setup-container">
              {!showCoverInput ? (
                <button
                  onClick={() => setShowCoverInput(true)}
                  className="btn-add-cover"
                >
                  <ImageIcon className="icon-large mb-2" />
                  <span>Add Cover Image</span>
                </button>
              ) : (
                <div ref={coverInputRef} className="cover-input-panel">
                  <div className="panel-header">
                    <span className="panel-title">Cover Image Library</span>
                    <button onClick={() => setShowCoverInput(false)} className="wb-btn-close">
                      <Trash2 className="icon-xs" />
                    </button>
                  </div>

                  {/* Preset Gallery */}
                  <div className="preset-grid">
                    {PRESET_COVERS.map((preset) => (
                      <button
                        key={preset.url}
                        onClick={() => {
                          onCoverImageChange?.(preset.url);
                          setShowCoverInput(false);
                        }}
                        className="preset-card"
                      >
                        <img src={preset.url} alt={preset.name} />
                        <div className="preset-overlay">
                          <span>{preset.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="wb-divider" />

                  <div className="upload-options">
                    <div className="upload-group">
                      <label>Custom URL</label>
                      <div className="url-input-row">
                        <input
                          type="text"
                          placeholder="Paste image URL..."
                          className="input-url"
                          value={coverUrl}
                          onChange={(e) => setCoverUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && coverUrl) {
                              onCoverImageChange?.(coverUrl);
                              setShowCoverInput(false);
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            if (coverUrl) {
                              onCoverImageChange?.(coverUrl);
                              setShowCoverInput(false);
                            }
                          }}
                          className="btn-add-url"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                    <div className="upload-group">
                      <label>Local Upload</label>
                      <label className="btn-upload-local">
                        <ImageIcon className="icon-small" />
                        Choose File
                        <input
                          type="file"
                          className="hidden-file-input"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                if (event.target?.result) {
                                  onCoverImageChange?.(event.target.result);
                                  setShowCoverInput(false);
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {!hideHeader && (
        <div className={`title-section ${isPreviewMode ? 'preview-mode' : ''}`}>
        {isPreviewMode ? (
          <div className="blog-details-hero-content">
            <span className="blog-details-category-badge">Blog Article</span>
            <h1 className="blog-details-hero-title">
              {title || "Untitled Post"}
            </h1>

            <div className="blog-details-hero-meta">
              {author && (
                <div className="blog-details-author-group">
                  <div className="blog-details-avatar-ring">
                    <img src={author.avatar} alt={author.name} className="blog-details-author-avatar" />
                  </div>
                  <div className="blog-details-author-info">
                    <span className="blog-details-author-name">{author.name}</span>
                    <span className="blog-details-author-role">{author.role || 'Editorial Team'}</span>
                  </div>
                </div>
              )}

              <div className="blog-details-meta-details">
                <div className="blog-details-meta-item">
                  <span className="blog-details-meta-label">Published</span>
                  <div className="blog-details-meta-value">
                    <Calendar className="icon-xs" />
                    {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <div className="blog-details-meta-item">
                  <span className="blog-details-meta-label">Read Time</span>
                  <div className="blog-details-meta-value">
                    <Clock className="icon-xs" />
                    5 min read
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <textarea
            autoFocus
            placeholder="The Future of Digital Publishing"
            value={title}
            onChange={(e) => onTitleChange?.(e.target.value)}
            className="title-textarea"
            rows={1}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
          />
        )}
      </div>
      )}
      {/* Static Toolbar removed per user request for a minimal interface */}

      {/* Bubble Menu (Selection-based formatting) — Now matches the full CommandList design */}
      <BubbleMenu
        editor={editor}
        tippyOptions={{
          duration: 100,
          onHide: () => {
            setShowLinkInput(false);
            setShowHeadingLevels(false);
          }
        }}
        shouldShow={({ editor }) => {
          if (isPreviewMode) return false;
          if (editor.isActive('image') || editor.isActive('math')) return false;
          return !editor.state.selection.empty;
        }}
        className={`tiptap-menu bubble-menu-full-design ${isPreviewMode ? 'hidden' : ''}`}
      >
        <div className="command-list">
          <div className="command-list-header">
            {showLinkInput ? 'LINK URL' : showHeadingLevels ? 'HEADING LEVELS' : 'EDITOR BLOCKS'}
          </div>

          <div className="command-items-grid">
            {showLinkInput ? (
              <div className="inline-input-row">
                <input
                  type="text"
                  placeholder="Paste link..."
                  className="link-input"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setLink()}
                  autoFocus
                />
                <button onClick={setLink} className="menu-btn active">
                  <CheckCircle2 className="icon-small" />
                </button>
              </div>
            ) : showHeadingLevels ? (
              <>
                <button onClick={() => setShowHeadingLevels(false)} className="command-item">
                  <div className="command-icon-wrap"><Trash2 className="icon-small" /></div>
                  <div className="command-text-wrap"><span className="command-title">Back</span></div>
                </button>
                <div className="toolbar-divider" />
                <button onClick={() => { editor.chain().focus().toggleHeading({ level: 1 }).run(); setShowHeadingLevels(false); }} className={`command-item ${editor.isActive('heading', { level: 1 }) ? 'selected' : ''}`}>
                  <div className="command-icon-wrap"><Heading1 className="icon-small" /></div>
                  <div className="command-text-wrap"><span className="command-title">H1</span><span className="command-desc">Title</span></div>
                </button>
                <button onClick={() => { editor.chain().focus().toggleHeading({ level: 2 }).run(); setShowHeadingLevels(false); }} className={`command-item ${editor.isActive('heading', { level: 2 }) ? 'selected' : ''}`}>
                  <div className="command-icon-wrap"><Heading2 className="icon-small" /></div>
                  <div className="command-text-wrap"><span className="command-title">H2</span><span className="command-desc">Section</span></div>
                </button>
                <button onClick={() => { editor.chain().focus().toggleHeading({ level: 3 }).run(); setShowHeadingLevels(false); }} className={`command-item ${editor.isActive('heading', { level: 3 }) ? 'selected' : ''}`}>
                  <div className="command-icon-wrap"><Heading3 className="icon-small" /></div>
                  <div className="command-text-wrap"><span className="command-title">H3</span><span className="command-desc">Sub</span></div>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  className={`command-item ${editor.isActive('bold') ? 'selected' : ''}`}
                >
                  <div className={`command-icon-wrap ${editor.isActive('bold') ? 'selected' : ''}`}>
                    <Bold className="icon-small" />
                  </div>
                  <div className="command-text-wrap">
                    <span className="command-title">Bold</span>
                    <span className="command-desc">Text</span>
                  </div>
                </button>

                <button
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  className={`command-item ${editor.isActive('italic') ? 'selected' : ''}`}
                >
                  <div className={`command-icon-wrap ${editor.isActive('italic') ? 'selected' : ''}`}>
                    <Italic className="icon-small" />
                  </div>
                  <div className="command-text-wrap">
                    <span className="command-title">Italic</span>
                    <span className="command-desc">Text</span>
                  </div>
                </button>

                <button
                  onClick={() => {
                    const prev = editor.getAttributes('link').href;
                    setLinkUrl(prev || '');
                    setShowLinkInput(true);
                  }}
                  className={`command-item ${editor.isActive('link') ? 'selected' : ''}`}
                >
                  <div className={`command-icon-wrap ${editor.isActive('link') ? 'selected' : ''}`}>
                    <LinkIcon className="icon-small" />
                  </div>
                  <div className="command-text-wrap">
                    <span className="command-title">Link</span>
                    <span className="command-desc">URL</span>
                  </div>
                </button>

                <button
                  onClick={() => {
                    toast.custom((t) => <CitationToast t={t} editor={editor} />, { duration: 10000 });
                  }}
                  className={`command-item ${editor.isActive('citation') ? 'selected' : ''}`}
                >
                  <div className={`command-icon-wrap ${editor.isActive('citation') ? 'selected' : ''}`}>
                    <Bookmark className="icon-small" />
                  </div>
                  <div className="command-text-wrap">
                    <span className="command-title">Cite</span>
                    <span className="command-desc">Ref</span>
                  </div>
                </button>

                <button
                  onClick={() => editor.chain().focus().setMath().run()}
                  className="command-item"
                >
                  <div className="command-icon-wrap">
                    <Sigma className="icon-small" />
                  </div>
                  <div className="command-text-wrap">
                    <span className="command-title">Math</span>
                    <span className="command-desc">Formula</span>
                  </div>
                </button>

                <div className="toolbar-divider" />

                <button
                  onClick={() => setShowHeadingLevels(true)}
                  className={`command-item ${editor.isActive('heading') ? 'selected' : ''}`}
                >
                  <div className={`command-icon-wrap ${editor.isActive('heading') ? 'selected' : ''}`}>
                    <Heading1 className="icon-small" />
                  </div>
                  <div className="command-text-wrap">
                    <span className="command-title">Headings</span>
                    <span className="command-desc">Levels</span>
                  </div>
                </button>
              </>
            )}
          </div>
        </div>
      </BubbleMenu>

      {/* Floating Menu removed for cleaner UI */}

      <div
        className={`prose-editor-container ${isPreviewMode ? 'blog-details-article-prose' : ''}`}
        onClick={() => !isPreviewMode && editor.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        className="hidden-file-input"
      />

      {!isPreviewMode && (
        <div className="floating-history-pill">
          <button
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="history-pill-btn"
            title="Undo (Ctrl+Z)"
          >
            <Undo size={16} />
          </button>
          <div className="pill-divider" />
          <button
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="history-pill-btn"
            title="Redo (Ctrl+Y)"
          >
            <Redo size={16} />
          </button>
        </div>
      )}

      <div className="bottom-spacer" />
    </div>
  );
}
