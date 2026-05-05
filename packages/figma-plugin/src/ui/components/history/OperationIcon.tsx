import {
  AlertTriangle,
  ArrowRightLeft,
  List,
  Minus,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';

const OP_ICON_CLASS = 'shrink-0 text-[color:var(--color-figma-text-tertiary)]';
const OP_ICON_SIZE = 10;
const OP_ICON_STROKE_WIDTH = 2;

export function OperationIcon({ type }: { type: string }) {
  if (type.includes('create') || type.includes('add')) {
    return (
      <Plus
        size={OP_ICON_SIZE}
        strokeWidth={OP_ICON_STROKE_WIDTH}
        className={OP_ICON_CLASS}
        aria-hidden
      />
    );
  }

  if (type.includes('delete') || type.includes('remove')) {
    return (
      <Minus
        size={OP_ICON_SIZE}
        strokeWidth={OP_ICON_STROKE_WIDTH}
        className={OP_ICON_CLASS}
        aria-hidden
      />
    );
  }

  if (type.includes('rename') || type.includes('move') || type.includes('reorder')) {
    return (
      <ArrowRightLeft
        size={OP_ICON_SIZE}
        strokeWidth={OP_ICON_STROKE_WIDTH}
        className={OP_ICON_CLASS}
        aria-hidden
      />
    );
  }

  if (type.includes('update') || type.includes('replace') || type.includes('meta')) {
    return (
      <Pencil
        size={OP_ICON_SIZE}
        strokeWidth={OP_ICON_STROKE_WIDTH}
        className={OP_ICON_CLASS}
        aria-hidden
      />
    );
  }

  if (type === 'rollback') {
    return (
      <RotateCcw
        size={OP_ICON_SIZE}
        strokeWidth={OP_ICON_STROKE_WIDTH}
        className={OP_ICON_CLASS}
        aria-hidden
      />
    );
  }

  if (type.includes('bulk')) {
    return (
      <List
        size={OP_ICON_SIZE}
        strokeWidth={OP_ICON_STROKE_WIDTH}
        className={OP_ICON_CLASS}
        aria-hidden
      />
    );
  }

  if (type.includes('error')) {
    return (
      <AlertTriangle
        size={OP_ICON_SIZE}
        strokeWidth={OP_ICON_STROKE_WIDTH}
        className="shrink-0 text-[color:var(--color-figma-text-warning)]"
        aria-hidden
      />
    );
  }

  if (type.includes('run')) {
    return (
      <Play
        size={OP_ICON_SIZE}
        strokeWidth={OP_ICON_STROKE_WIDTH}
        className={OP_ICON_CLASS}
        aria-hidden
      />
    );
  }

  return (
    <X
      size={OP_ICON_SIZE}
      strokeWidth={OP_ICON_STROKE_WIDTH}
      className={`${OP_ICON_CLASS} opacity-30`}
      aria-hidden
    />
  );
}
