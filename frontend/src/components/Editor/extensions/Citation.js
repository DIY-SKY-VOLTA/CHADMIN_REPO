import { Mark, mergeAttributes } from '@tiptap/core';

export const Citation = Mark.create({
  name: 'citation',

  addAttributes() {
    return {
      source: {
        default: null,
        parseHTML: element => element.getAttribute('data-source'),
        renderHTML: attributes => {
          if (!attributes.source) {
            return {};
          }
          return { 'data-source': attributes.source };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'cite',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['cite', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setCitation: attributes => ({ commands }) => {
        return commands.setMark(this.name, attributes);
      },
      toggleCitation: attributes => ({ commands }) => {
        return commands.toggleMark(this.name, attributes);
      },
    };
  },
});
