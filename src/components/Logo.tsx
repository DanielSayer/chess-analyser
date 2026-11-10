export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#1b221e" />
      <rect x="6" y="6" width="10" height="10" fill="var(--board-light)" />
      <rect x="16" y="6" width="10" height="10" fill="#3f5c4b" />
      <rect x="6" y="16" width="10" height="10" fill="#3f5c4b" />
      <rect x="16" y="16" width="10" height="10" fill="var(--board-light)" />
      <path d="M4 22.5 10 19l5 2.5 6-9 7 3" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
