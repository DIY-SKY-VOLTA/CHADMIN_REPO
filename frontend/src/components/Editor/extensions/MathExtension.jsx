import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import React from 'react';

// Helper to load KaTeX from CDN
const loadKatex = () => {
  if (window.katex) return Promise.resolve(window.katex);
  
  return new Promise((resolve, reject) => {
    // Load CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
    document.head.appendChild(link);

    // Load JS
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
    script.onload = () => resolve(window.katex);
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

const MathComponent = ({ node, updateAttributes }) => {
  const { latex } = node.attrs;
  const containerRef = React.useRef(null);
  const [isLoaded, setIsLoaded] = React.useState(!!window.katex);

  React.useEffect(() => {
    if (!isLoaded) {
      loadKatex().then(() => setIsLoaded(true)).catch(console.error);
    }
  }, [isLoaded]);

  React.useEffect(() => {
    if (containerRef.current && window.katex) {
      try {
        window.katex.render(latex || '\\text{Enter LaTeX}', containerRef.current, {
          throwOnError: false,
          displayMode: true,
        });
      } catch (e) {
        containerRef.current.textContent = latex;
      }
    } else if (containerRef.current) {
      containerRef.current.textContent = latex || 'Loading KaTeX...';
    }
  }, [latex, isLoaded]);

  return (
    <div className="math-node-view">
      <div ref={containerRef} className="math-render" />
      <input
        className="math-input"
        value={latex}
        onChange={(e) => updateAttributes({ latex: e.target.value })}
        placeholder="Type LaTeX here..."
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
};

export const MathExtension = Node.create({
  name: 'math',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: 'E = mc^2',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="math"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'math' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathComponent);
  },

  addCommands() {
    return {
      setMath: (attributes) => ({ commands }) => {
        return commands.insertContent({ type: this.name, attrs: attributes });
      },
    };
  },
});
