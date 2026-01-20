import { useCallback, useRef } from "react";

interface UseLongPressOptions {
  onLongPress: (e: React.MouseEvent | React.TouchEvent) => void;
  onClick?: (e: React.MouseEvent | React.TouchEvent) => void;
  delay?: number;
}

export function useLongPress({
  onLongPress,
  onClick,
  delay = 500,
}: UseLongPressOptions) {
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);

  const start = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      isLongPress.current = false;
      longPressTimer.current = setTimeout(() => {
        isLongPress.current = true;
        onLongPress(e);
      }, delay);
    },
    [onLongPress, delay]
  );

  const clear = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      // Only trigger click if it wasn't a long press
      if (!isLongPress.current && onClick) {
        onClick(e);
      }
      isLongPress.current = false;
    },
    [onClick]
  );

  return {
    onMouseDown: start,
    onTouchStart: start,
    onMouseUp: clear,
    onTouchEnd: clear,
    onMouseLeave: clear,
    onClick: handleClick,
  };
}
