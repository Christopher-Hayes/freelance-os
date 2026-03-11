"use client";

export const DEFAULT_MINIMAP_ROWS = 60;
export const MINIMAP_DOT_SIZE = 5;
export const MINIMAP_HEIGHT_PX = 640;

const DEFAULT_EMPTY_TITLE = "No activity";

export interface ScrollbarMinimapCell {
  color: string | null;
  strength: number;
  title: string;
}

interface ScrollbarMinimapProps {
  cells: ScrollbarMinimapCell[];
  columns: number;
  rows?: number;
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
  onJumpToRatio: (ratio: number) => void;
  onDragViewport: (deltaRatio: number) => void;
  isDraggingViewport: boolean;
  setIsDraggingViewport: (isDragging: boolean) => void;
  className?: string;
}

export function createEmptyMinimapCells(
  rows: number,
  columns: number,
  emptyTitle = DEFAULT_EMPTY_TITLE,
): ScrollbarMinimapCell[] {
  return Array.from({ length: rows * columns }, () => ({
    color: null,
    strength: 0,
    title: emptyTitle,
  }));
}

export function getMinimapRowIndex(totalMinutes: number, rows: number) {
  return Math.max(0, Math.min(rows - 1, Math.floor((totalMinutes / (24 * 60)) * rows)));
}

export default function ScrollbarMinimap({
  cells,
  columns,
  rows = DEFAULT_MINIMAP_ROWS,
  scrollTop,
  viewportHeight,
  scrollHeight,
  onJumpToRatio,
  onDragViewport,
  isDraggingViewport,
  setIsDraggingViewport,
  className,
}: ScrollbarMinimapProps) {
  if (cells.length === 0) {
    return null;
  }

  const gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  const viewportHeightPercent = Math.max((viewportHeight / Math.max(scrollHeight, 1)) * 100, 8);
  const maxViewportTop = Math.max(0, 100 - viewportHeightPercent);
  const viewportTravelRatio = Math.max(maxViewportTop / 100, 0.0001);
  const viewportTop = Math.max(0, Math.min((scrollTop / Math.max(scrollHeight, 1)) * 100, maxViewportTop));
  const widthPx = columns * MINIMAP_DOT_SIZE + Math.max(columns - 1, 0) * 2;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));

    if (target.dataset.viewport === "true") {
      target.setPointerCapture(event.pointerId);
      target.dataset.dragStartY = String(event.clientY);
      setIsDraggingViewport(true);
      return;
    }

    onJumpToRatio(ratio);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.dataset.viewport !== "true" || !target.hasPointerCapture(event.pointerId)) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const dragStartY = Number(target.dataset.dragStartY ?? event.clientY);
    const deltaRatio = ((event.clientY - dragStartY) / bounds.height) / viewportTravelRatio;

    target.dataset.dragStartY = String(event.clientY);
    onDragViewport(deltaRatio);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.dataset.viewport === "true" && target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
      delete target.dataset.dragStartY;
    }

    setIsDraggingViewport(false);
  };

  return (
    <div className={className ?? "sticky top-0 z-20 p-1 flex bg-gray-100 dark:bg-gray-800 border-l border-gray-300 dark:border-gray-700 shrink-0 justify-center self-stretch"}>
      <div
        className="relative h-full cursor-pointer"
        style={{ height: `${MINIMAP_HEIGHT_PX}px`, width: `${widthPx}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="grid h-full gap-x-0.5 gap-y-px"
          style={{
            width: `${widthPx}px`,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridTemplateRows,
          }}
        >
          {cells.map((cell, index) => (
            <div
              key={index}
              className="rounded-xs bg-gray-500/20"
              style={{
                width: `${MINIMAP_DOT_SIZE}px`,
                height: `${MINIMAP_DOT_SIZE}px`,
                backgroundColor: cell.color ?? undefined,
                borderColor: cell.color ?? undefined,
                opacity: cell.color ? 0.9 : 0.28,
              }}
              title={cell.title}
            />
          ))}
        </div>
        <div
          data-viewport="true"
          className={`absolute inset-x-0 rounded-sm border border-gray-900/35 bg-gray-700/20 shadow-sm backdrop-blur-[1px] dark:border-gray-100/25 dark:bg-gray-100/10 ${isDraggingViewport ? "cursor-grabbing" : "cursor-grab"}`}
          style={{
            top: `${viewportTop}%`,
            height: `${Math.min(viewportHeightPercent, 100 - viewportTop)}%`,
            minHeight: "36px",
          }}
          title="Visible timeline area"
        />
      </div>
    </div>
  );
}