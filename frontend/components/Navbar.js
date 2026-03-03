import { useRouter } from 'next/router';
import Link from 'next/link';
import { logout } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';


export default function Navbar() {
    const router = useRouter();

    const handleLogout = async () => {
        try {
            await logout();
            toastSuccess('You have been logged out.');
            router.push('/login');
        } catch {
            toastError('Logout failed. Please try again.');
        }
    };

    return (
        <nav className="navbar">
            <Link href="/dashboard" className="navbar-brand">
                ⚡ FormCraft
            </Link>
            <div className="navbar-actions">
                <Link href="/dashboard" className="btn btn-secondary btn-sm">
                    Dashboard
                </Link>
                <Link href="/builder/new" className="btn btn-primary btn-sm">
                    + New Form
                </Link>
                <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
                    Logout
                </button>
            </div>
        </nav>
    );
}
