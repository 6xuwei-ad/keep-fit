export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="食刻 SHIKE">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none">
          <rect width="48" height="48" rx="15" fill="currentColor" />
          <circle cx="24" cy="25" r="13.5" stroke="#E9F6B6" strokeWidth="1.7" />
          <path
            d="M18.6 25.4c0-4.1 4.2-7.6 10.5-7.9-.5 5.7-3.7 9.5-8.6 9.5"
            fill="#DDF07C"
          />
          <path
            d="M19.2 30.6c2.6-5 6.2-8.2 10.9-10.2"
            stroke="#143E2E"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {!compact && (
        <span className="brand-word">
          <strong>食刻</strong>
          <small>SHIKE</small>
        </span>
      )}
    </div>
  );
}
