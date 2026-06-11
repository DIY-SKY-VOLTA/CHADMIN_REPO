import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React from 'react';
import { Trash2 } from 'lucide-react';

const resolveImageUrl = (src) => {
  if (!src) return src;
  if (/^https?:\/\//i.test(src)) return src;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  return baseUrl ? new URL(src, baseUrl).toString() : src;
};

const GalleryComponent = ({ node, deleteNode }) => {
  const images = Array.isArray(node.attrs.images) ? node.attrs.images : [];
  const columns = Math.max(1, Number(node.attrs.columns) || 2);
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <NodeViewWrapper
      className="custom-gallery-view"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className="editor-gallery-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {images.map((image, index) => (
          <figure className="gallery-image-wrapper" key={`${image.src}-${index}`}>
            <img src={resolveImageUrl(image.src)} alt={image.alt || `Gallery image ${index + 1}`} className="gallery-node-image" />
          </figure>
        ))}
      </div>

      {isHovered && (
        <button
          className="gallery-delete-btn"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteNode();
          }}
        >
          <Trash2 className="icon-small" />
        </button>
      )}
    </NodeViewWrapper>
  );
};

export const Gallery = Node.create({
  name: 'gallery',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      images: {
        default: [],
        parseHTML: (element) => {
          const rawValue = element.getAttribute('data-images');
          if (!rawValue) return [];
          try {
            return JSON.parse(rawValue);
          } catch {
            return [];
          }
        },
        renderHTML: (attributes) => ({
          'data-images': JSON.stringify(attributes.images || []),
        }),
      },
      columns: {
        default: 2,
        parseHTML: (element) => Number(element.getAttribute('data-columns')) || 2,
        renderHTML: (attributes) => ({
          'data-columns': attributes.columns || 2,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-gallery="true"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'figure',
      mergeAttributes(this.options.HTMLAttributes, {
        'data-gallery': 'true',
        'data-columns': HTMLAttributes.columns || 2,
        'data-images': JSON.stringify(HTMLAttributes.images || []),
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GalleryComponent);
  },
});
