import { useEffect } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Marks every [data-reveal] element with `data-in` the first time it scrolls into
// view. Stagger comes from the `--i` custom property set on each element.
export function useReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const targets = [...root.querySelectorAll('[data-reveal]')];
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.setAttribute('data-in', ''));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.setAttribute('data-in', '');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [rootRef]);
}

// Scroll-linked values, written as CSS custom properties so the browser does
// the interpolation work:
//   [data-parallax="0.1"]  → --py: px offset relative to the viewport centre
//   [data-progress]        → --p: 0..1 as the element scrolls past the top
export function useScrollMotion(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return undefined;
    const parallax = [...root.querySelectorAll('[data-parallax]')];
    const progress = [...root.querySelectorAll('[data-progress]')];
    let frame = 0;

    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      parallax.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < -200 || rect.top > vh + 200) return;
        const speed = Number(el.dataset.parallax) || 0.1;
        const offset = (rect.top + rect.height / 2 - vh / 2) * -speed;
        el.style.setProperty('--py', `${offset.toFixed(1)}px`);
      });
      progress.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const value = clamp(-rect.top / Math.max(rect.height * 0.6, 1), 0, 1);
        el.style.setProperty('--p', value.toFixed(3));
      });
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [rootRef]);
}

// Pointer-tracked spotlight for `.sq-spot` surfaces (cards, CTA). Only runs for
// precise pointers; touch devices keep the static styling.
export function useSpotlight(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined;
    const onMove = (event) => {
      const card = event.target.closest?.('.sq-spot');
      if (!card || !root.contains(card)) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      card.style.setProperty('--my', `${event.clientY - rect.top}px`);
    };
    root.addEventListener('pointermove', onMove, { passive: true });
    return () => root.removeEventListener('pointermove', onMove);
  }, [rootRef]);
}

export { prefersReducedMotion };
