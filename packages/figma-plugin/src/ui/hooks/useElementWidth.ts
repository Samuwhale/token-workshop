import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

export function useElementWidth(ref: RefObject<HTMLElement>): number | null {
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      setWidth(null);
      return;
    }

    const setMeasuredWidth = () => {
      const nextWidth = element.clientWidth;
      setWidth((currentWidth) =>
        currentWidth === nextWidth ? currentWidth : nextWidth,
      );
    };

    setMeasuredWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", setMeasuredWidth);
      return () => window.removeEventListener("resize", setMeasuredWidth);
    }

    let animationFrame = 0;
    const observer = new ResizeObserver(() => {
      if (animationFrame !== 0) {
        cancelAnimationFrame(animationFrame);
      }
      animationFrame = requestAnimationFrame(() => {
        animationFrame = 0;
        setMeasuredWidth();
      });
    });

    observer.observe(element);
    return () => {
      if (animationFrame !== 0) {
        cancelAnimationFrame(animationFrame);
      }
      observer.disconnect();
    };
  }, [ref]);

  return width;
}
