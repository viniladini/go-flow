"use client";
import { MOTION, MOTION_EASING } from "@/lib/motion";
import { Children, useEffect, useRef, type ComponentPropsWithoutRef } from "react";

/** Keeps native summary/keyboard semantics; only delays closing for its short fade. */
export function AnimatedDetails({ children, onClickCapture, ...props }: ComponentPropsWithoutRef<"details">) {
  const body = useRef<HTMLDivElement>(null), animation = useRef<Animation | null>(null);
  const closingRef = useRef(false);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (!media?.matches) return;
      animation.current?.cancel();
      if (closingRef.current) { const node = body.current?.closest("details"); if (node) node.open = false; closingRef.current = false; }
    };
    media?.addEventListener?.("change", stop);
    return () => { animation.current?.cancel(); media?.removeEventListener?.("change", stop); };
  }, []);
  const [summary, ...contents] = Children.toArray(children);
  return <details {...props} onClickCapture={(event) => {
    onClickCapture?.(event);
    if (event.defaultPrevented || !(event.target instanceof Element) || event.target.closest("summary")?.parentElement !== event.currentTarget) return;
    const node = event.currentTarget, content = body.current;
    if (!content?.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    event.preventDefault();
    const visible = getComputedStyle(content);
    const from = node.open ? { opacity: visible.opacity, transform: visible.transform } : { opacity: 0, transform: "translateY(8px)" };
    animation.current?.cancel();
    const closing = node.open && !closingRef.current;
    closingRef.current = closing;
    if (!closing) node.open = true;
    const current = content.animate([from, closing ? { opacity: 0, transform: "translateY(-6px)" } : { opacity: 1, transform: "none" }], { duration: closing ? MOTION.panelExit : MOTION.standard, easing: MOTION_EASING.panel });
    animation.current = current;
    if (closing) {
      if (!current.finished) node.open = false;
      else void current.finished.then(() => { if (animation.current === current && node.isConnected) { node.open = false; closingRef.current = false; } }, () => {});
    }
  }}>{summary}<div ref={body} className="motion-details-content">{contents}</div></details>;
}
