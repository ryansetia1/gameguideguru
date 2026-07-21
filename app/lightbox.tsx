import { useEffect, useRef, useState } from "react";
import { IconX, IconChevronLeft, IconChevronRight } from "./icons";

interface LightboxProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

export function Lightbox({ images, initialIndex, onClose }: LightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(initialIndex);
  
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  
  const touchState = useRef({
    startX: 0,
    startY: 0,
    startDist: 0,
    startScale: 1,
    startPos: { x: 0, y: 0 },
    isPinching: false,
    isPanning: false,
  });

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, [index]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (images.length > 0) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [images.length]);

  const hasNext = index < images.length - 1;
  const hasPrev = index > 0;

  const next = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (hasNext) setIndex(i => i + 1);
  };
  const prev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (hasPrev) setIndex(i => i - 1);
  };

  useEffect(() => {
    if (images.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [index, images.length]);

  const getDist = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    if (e.touches.length === 2) {
      touchState.current.isPinching = true;
      touchState.current.isPanning = false;
      touchState.current.startDist = getDist(e.touches);
      touchState.current.startScale = scale;
    } else if (e.touches.length === 1) {
      touchState.current.isPanning = true;
      touchState.current.isPinching = false;
      touchState.current.startX = e.touches[0].clientX;
      touchState.current.startY = e.touches[0].clientY;
      touchState.current.startPos = { ...pos };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchState.current.isPinching && e.touches.length === 2) {
      const dist = getDist(e.touches);
      const newScale = Math.max(1, Math.min(5, touchState.current.startScale * (dist / touchState.current.startDist)));
      setScale(newScale);
    } else if (touchState.current.isPanning && e.touches.length === 1) {
      const dx = e.touches[0].clientX - touchState.current.startX;
      const dy = e.touches[0].clientY - touchState.current.startY;
      if (scale > 1) {
        setPos({
          x: touchState.current.startPos.x + dx,
          y: touchState.current.startPos.y + dy,
        });
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    setIsDragging(false);
    if (touchState.current.isPanning && scale === 1 && e.changedTouches.length > 0) {
      const dx = e.changedTouches[0].clientX - touchState.current.startX;
      if (dx > 50 && hasPrev) prev();
      else if (dx < -50 && hasNext) next();
    }
    touchState.current.isPinching = false;
    touchState.current.isPanning = false;
    if (scale < 1) {
      setScale(1);
      setPos({ x: 0, y: 0 });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const newScale = Math.max(1, Math.min(5, scale - e.deltaY * 0.01));
      setScale(newScale);
    }
  };

  const handleDoubleClick = () => {
    if (scale > 1) {
      setScale(1);
      setPos({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  if (images.length === 0) return null;

  return (
    <dialog
      ref={dialogRef}
      className="lightbox-dialog"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      onClose={onClose}
    >
      <div 
        className="lightbox-content"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      >
        <button className="lightbox-close" onClick={onClose} aria-label="Close">
          <IconX size={24} />
        </button>
        
        {hasPrev && (
          <button className="lightbox-nav prev" onClick={prev} aria-label="Previous image">
            <IconChevronLeft size={32} />
          </button>
        )}
        
        {hasNext && (
          <button className="lightbox-nav next" onClick={next} aria-label="Next image">
            <IconChevronRight size={32} />
          </button>
        )}

        <div 
          className={`lightbox-img-wrapper ${isDragging ? 'dragging' : ''}`}
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[index]} alt={`Enlarged view ${index + 1}`} draggable={false} />
        </div>
        
        {images.length > 1 && (
          <div className="lightbox-indicator">
            {index + 1} / {images.length}
          </div>
        )}
      </div>
    </dialog>
  );
}
