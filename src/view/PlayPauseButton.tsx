import { useCallback, useEffect, useRef, type MouseEvent, type RefCallback } from 'react';
import { HugeiconsIcon, PlayIcon, PauseIcon } from './icons';

const HOLD_TO_PLAY_MS = 600; // press this long to start continuous playback

export interface PlayPauseButtonProps {
  isPlaying: boolean;
  /** Play-mode availability (no solution yet, or at the end of the solve). */
  disabled: boolean;
  onPlay: () => void; // continuous playback (hold)
  onPlayOne: () => void; // single move (tap)
  onPause: () => void;
}

/**
 * One persistent button that is Play while paused and Pause while playing.
 *
 * Press behavior in play mode:
 * - Tap (released before the hold threshold): one move (`onPlayOne`).
 * - Hold reaching the threshold: continuous playback (`onPlay`) fires at the
 *   threshold while still held; the release is a no-op.
 * - Pointer leaving or cancelling before the threshold aborts the press.
 * - Keyboard activation (a click with `detail === 0`) counts as a tap.
 *
 * In pause mode (playing) a plain click pauses.
 *
 * Why one element instead of swapping play/pause buttons: dispatching play on
 * pointerup re-renders before the browser fires the trailing trusted `click`,
 * and Chromium retargets that click to whatever now occupies the spot — a
 * swapped-in pause button would receive it and instantly pause again. With a
 * persistent element the click lands here, where the `consumed` flag from the
 * already-handled press swallows it. Pointer events are attached natively via
 * the ref because real pointer input does not reach React's delegated pointer
 * handlers in this app.
 */
export function PlayPauseButton(p: PlayPauseButtonProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True when a press already fired tap or hold; the trailing click is noise.
  const consumed = useRef(false);
  // Latest props for the native listeners, which bind once. Updated in an
  // effect (not during render); input events always arrive after the commit.
  const propsRef = useRef(p);
  useEffect(() => {
    propsRef.current = p;
  });

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const ref = useCallback<RefCallback<HTMLButtonElement>>(
    (el) => {
      if (!el) return;
      const down = () => {
        consumed.current = false; // new gesture; drop any stale flag
        if (propsRef.current.isPlaying) return; // pause mode: plain click only
        clear();
        timer.current = setTimeout(() => {
          timer.current = null;
          consumed.current = true; // swallow the click that comes at release
          propsRef.current.onPlay();
        }, HOLD_TO_PLAY_MS);
      };
      const up = () => {
        if (timer.current !== null) {
          clear();
          consumed.current = true; // swallow the click that follows this release
          propsRef.current.onPlayOne();
        }
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', clear);
      el.addEventListener('pointercancel', clear);
      return () => {
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointerleave', clear);
        el.removeEventListener('pointercancel', clear);
        clear();
      };
    },
    [clear],
  );

  const onClick = useCallback((ev: MouseEvent<HTMLButtonElement>) => {
    if (consumed.current) {
      consumed.current = false; // the press already handled this gesture
      return;
    }
    if (propsRef.current.isPlaying) {
      propsRef.current.onPause();
      return;
    }
    if (ev.detail === 0) propsRef.current.onPlayOne(); // keyboard activation
  }, []);

  return (
    <button
      data-testid={p.isPlaying ? 'pause' : 'play'}
      className="btn btn-circle btn-primary btn-lg"
      aria-label={p.isPlaying ? 'Pause' : 'Play'}
      disabled={!p.isPlaying && p.disabled}
      ref={ref}
      onClick={onClick}
    >
      <HugeiconsIcon icon={p.isPlaying ? PauseIcon : PlayIcon} size={26} strokeWidth={2} aria-hidden />
    </button>
  );
}
