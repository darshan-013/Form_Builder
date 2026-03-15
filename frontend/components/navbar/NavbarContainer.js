export default function NavbarContainer({ children, variant = 'app' }) {
    return (
        <div className={`dock-shell dock-shell-${variant}`}>
            {children}
        </div>
    );
}

