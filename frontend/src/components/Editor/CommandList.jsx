import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useRef
} from 'react';
import gsap from 'gsap';
import './CommandList.css';

const CommandList = forwardRef((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef(null);

  const selectItem = (index) => {
    const item = props.items[index];
    if (item) {
      props.command(item);
    }
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [props.items]);

  // GSAP Entrance Animation
  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { opacity: 0, scale: 0.95 },
        { opacity: 1, scale: 1, duration: 0.2, ease: 'power2.out' }
      );
    }
  }, []);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
        return true;
      }

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        setSelectedIndex((selectedIndex + 1) % props.items.length);
        return true;
      }

      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }

      return false;
    },
  }));

  if (props.items.length === 0) return null;

  return (
    <div ref={containerRef} className="command-list">
      <div className="command-list-header">
        EDITOR BLOCKS
      </div>
      <div className="command-items-grid">
        {props.items.map((item, index) => {
          const isSelected = index === selectedIndex;

          return (
            <button
              key={index}
              className={`command-item ${isSelected ? 'selected' : ''}`}
              onClick={() => selectItem(index)}
            >
              <div className={`command-icon-wrap ${isSelected ? 'selected' : ''}`}>
                {item.icon}
              </div>
              <div className="command-text-wrap">
                <span className="command-title">{item.title}</span>
                <span className={`command-desc ${isSelected ? 'selected' : ''}`}>
                  {item.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

CommandList.displayName = 'CommandList';

export default CommandList;
