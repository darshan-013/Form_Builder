import Link from 'next/link';

export default function NavItem({
  item,
  isActive,
  onActivate,
}) {
  const content = (
    <span className={`dock-nav-item${isActive ? ' is-active' : ''}`}>
      <span className="dock-nav-icon" aria-hidden="true">{item.icon}</span>
      <span className="dock-nav-tooltip">{item.label}</span>
    </span>
  );

  if (item.route) {
    return (
      <Link
        href={item.route}
        aria-label={item.label}
        className="dock-nav-link"
        onClick={(event) => onActivate(event)}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className="dock-nav-link dock-nav-link-btn"
      aria-label={item.label}
      onClick={(event) => onActivate(event)}
    >
      {content}
    </button>
  );
}
