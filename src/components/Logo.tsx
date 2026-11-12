/** The "!?" annotation mark: an interesting move worth a second look. */
export function Logo() {
  return (
    <svg className="logo" viewBox="6 5 20 20" width="28" height="28" aria-hidden="true">
      <path d="M11.2 7.5 10.4 18h-1.2L8.4 7.5Z" fill="currentColor" />
      <circle cx="9.8" cy="22.6" r="1.7" fill="currentColor" />
      <path className="logo__query" d="M14.6 10.2c.6-1.9 2.3-3 4.6-3 2.8 0 4.6 1.6 4.6 3.9 0 1.9-1.1 3-2.6 4-1.2.8-1.6 1.4-1.6 2.6V18h-2.1v-.6c0-1.8.6-2.8 2-3.8 1.3-.9 1.9-1.6 1.9-2.6 0-1.2-.9-2-2.4-2-1.3 0-2.2.7-2.6 1.9Z" />
      <circle className="logo__query" cx="18.6" cy="22.6" r="1.7" />
    </svg>
  )
}
