const WAVE_BAR_HEIGHTS = ['50%', '75%', '100%', '75%', '50%'];

function Wave({ className = '', style, ...props }) {
  return (
    <>
      <style>{`@keyframes loading-ui-wave { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.6); } }`}</style>
      <span
        role="status"
        className={`wave ${className}`.trim()}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', height: '1em', ...style }}
        {...props}
      >
        {WAVE_BAR_HEIGHTS.map((height, index) => (
          <span
            key={index}
            aria-hidden="true"
            style={{
              display: 'inline-block',
              borderRadius: 9999,
              background: 'currentColor',
              width: 3,
              height,
              animation: 'loading-ui-wave var(--duration, 1s) ease-in-out infinite',
              animationDelay: `calc(var(--delay, 100ms) * ${index})`
            }}
          />
        ))}
        <span className="sr-only">Loading</span>
      </span>
    </>
  );
}

export { Wave };
