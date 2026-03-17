import '../styles/globals.css';
import '../styles/auth.css';
import '../styles/builder.css';
import '../styles/dashboard.css';
import '../styles/form-renderer.css';
import '../styles/responsive.css';
import '../styles/roles.css';
import '../styles/users.css';
import '../styles/Sidebar.css';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import LocalToast from '../components/LocalToast';

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <LocalToast />
        <Component {...pageProps} />
      </ThemeProvider>
    </AuthProvider>
  );
}
