import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import UserProfileChip from '../components/UserProfileChip';
import { getProfile, updateProfile, changePassword, uploadProfilePhoto, getFileViewUrl } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { toastSuccess, toastError } from '../services/toast';
import { 
    User, Mail, Lock, Camera, Save, AlertCircle, 
    CheckCircle2, Loader2, Key, Info, Shield
} from 'lucide-react';

const ProfilePage = () => {
    const { user, refreshAuth } = useAuth();
    const { theme } = useTheme();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [photoLoading, setPhotoLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const fileInputRef = useRef(null);

    const [profileData, setProfileData] = useState({
        name: '',
        email: '',
        username: ''
    });

    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            setLoading(true);
            const response = await getProfile();
            const userData = response.user || response; // Support both old and new response structure
            setProfileData({
                name: userData.name || '',
                email: userData.email || '',
                username: userData.username || ''
            });
            setError(null);
        } catch (err) {
            setError('Failed to load profile information');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleProfileSubmit = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setError(null);
            setSuccess(null);
            await updateProfile(profileData);
            setSuccess('Profile updated successfully');
            toastSuccess('Profile updated successfully');
            await refreshAuth();
        } catch (err) {
            setError(err.message || 'Failed to update profile');
            toastError(err.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setError('New passwords do not match');
            return;
        }
        try {
            setSaving(true);
            setError(null);
            setSuccess(null);
            await changePassword({
                currentPassword: passwordData.currentPassword,
                newPassword: passwordData.newPassword
            });
            setSuccess('Password changed successfully');
            toastSuccess('Password changed successfully');
            setPasswordData({
                currentPassword: '',
                newPassword: '',
                confirmPassword: ''
            });
        } catch (err) {
            setError(err.message || 'Failed to change password');
            toastError(err.message || 'Failed to change password');
        } finally {
            setSaving(false);
        }
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setPhotoLoading(true);
            setError(null);
            setSuccess(null);
            const response = await uploadProfilePhoto(file);
            // After successful upload, refresh user data to get the new photo URL
            await refreshAuth();
            setSuccess('Profile photo uploaded successfully');
            toastSuccess('Profile photo uploaded successfully');
        } catch (err) {
            console.error('Upload failed:', err);
            setError(err.message || 'Failed to upload photo');
            toastError(err.message || 'Failed to upload photo');
        } finally {
            setPhotoLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner-large"></div>
                <style jsx>{`
                    .loading-container {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        background: var(--bg-base);
                    }
                    .spinner-large {
                        width: 48px;
                        height: 48px;
                        border: 4px solid var(--border);
                        border-top-color: var(--accent);
                        border-radius: 50%;
                        animation: spin 0.8s linear infinite;
                    }
                    @keyframes spin { to { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }

    return (
        <div className="profile-page-wrapper">
            <Head>
                <title>User Profile | FormBuilder</title>
            </Head>

            <Navbar />
            <UserProfileChip />
            
            <div className="main-layout">
                <Sidebar />
                
                <main className="content-area">
                    <div className="profile-container">
                        <header className="profile-header">
                            <h1 className="page-title">Account Settings</h1>
                            <p className="page-subtitle">Manage your profile information and security preferences.</p>
                        </header>

                        {error && (
                            <div className="status-alert error-alert">
                                <AlertCircle size={20} />
                                <span>{error}</span>
                            </div>
                        )}

                        {success && (
                            <div className="status-alert success-alert">
                                <CheckCircle2 size={20} />
                                <span>{success}</span>
                            </div>
                        )}

                        <div className="profile-grid">
                            <div className="profile-sidebar">
                                <div className="card avatar-card">
                                    <div className="avatar-section">
                                        <div className="avatar-circle">
                                            {user?.profilePic ? (
                                                <img 
                                                    src={getFileViewUrl(user.profilePic)} 
                                                    alt={user.name} 
                                                    className="avatar-img"
                                                />
                                            ) : (
                                                <User className="avatar-placeholder" size={64} />
                                            )}
                                            
                                            {photoLoading && (
                                                <div className="avatar-loader">
                                                    <Loader2 className="spinner" />
                                                </div>
                                            )}
                                        </div>
                                        <button 
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={photoLoading}
                                            className="photo-edit-btn"
                                            title="Change Photo"
                                        >
                                            <Camera size={16} />
                                        </button>
                                        <input 
                                            type="file" 
                                            ref={fileInputRef} 
                                            className="hidden" 
                                            accept="image/*"
                                            onChange={handlePhotoUpload}
                                        />
                                    </div>
                                    <div className="user-info-summary">
                                        <h2 className="user-full-name">{user?.name}</h2>
                                        <p className="user-handle">@{user?.username}</p>
                                        <div className="role-badge">
                                            <Shield size={12} />
                                            <span>{user?.role || 'User'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="card stats-card">
                                    <h3 className="section-title-sm">
                                        <Info size={16} />
                                        Quick Stats
                                    </h3>
                                    <div className="stats-list">
                                        <div className="stat-item">
                                            <span className="stat-label">Member Since</span>
                                            <span className="stat-value">March 2026</span>
                                        </div>
                                        <div className="stat-item">
                                            <span className="stat-label">Status</span>
                                            <span className="stat-value success">Active</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="profile-main-content">
                                <div className="card profile-form-card">
                                    <div className="card-header">
                                        <div className="header-icon user-icon">
                                            <User size={20} />
                                        </div>
                                        <h3 className="section-title">Profile Details</h3>
                                    </div>

                                    <form onSubmit={handleProfileSubmit} className="profile-form">
                                        <div className="form-grid">
                                            <div className="form-group">
                                                <label className="form-label">Full Name</label>
                                                <div className="input-with-icon">
                                                    <User className="input-icon" size={16} />
                                                    <input 
                                                        type="text" 
                                                        className="form-input"
                                                        placeholder="Enter your full name"
                                                        value={profileData.name}
                                                        onChange={(e) => setProfileData({...profileData, name: e.target.value})}
                                                    />
                                                </div>
                                            </div>

                                            <div className="form-group">
                                                <label className="form-label">Username</label>
                                                <div className="input-with-icon">
                                                    <span className="input-prefix">@</span>
                                                    <input 
                                                        type="text" 
                                                        className="form-input"
                                                        placeholder="username"
                                                        value={profileData.username}
                                                        onChange={(e) => setProfileData({...profileData, username: e.target.value})}
                                                    />
                                                </div>
                                            </div>

                                            <div className="form-group full-width">
                                                <label className="form-label">Email Address</label>
                                                <div className="input-with-icon">
                                                    <Mail className="input-icon" size={16} />
                                                    <input 
                                                        type="email" 
                                                        className="form-input"
                                                        placeholder="you@example.com"
                                                        value={profileData.email}
                                                        onChange={(e) => setProfileData({...profileData, email: e.target.value})}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="form-actions">
                                            <button 
                                                type="submit" 
                                                disabled={saving}
                                                className="btn btn-primary"
                                            >
                                                {saving ? <Loader2 className="spinner" /> : <Save size={18} />}
                                                Save Changes
                                            </button>
                                        </div>
                                    </form>
                                </div>

                                <div className="card security-form-card">
                                    <div className="card-header">
                                        <div className="header-icon security-icon">
                                            <Lock size={20} />
                                        </div>
                                        <h3 className="section-title">Security</h3>
                                    </div>

                                    <form onSubmit={handlePasswordSubmit} className="profile-form">
                                        <div className="form-group">
                                            <label className="form-label">Current Password</label>
                                            <div className="input-with-icon">
                                                <Key className="input-icon" size={16} />
                                                <input 
                                                    type="password" 
                                                    autoComplete="current-password"
                                                    placeholder="Enter current password"
                                                    className="form-input"
                                                    value={passwordData.currentPassword}
                                                    onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                                                />
                                            </div>
                                        </div>

                                        <div className="form-grid">
                                            <div className="form-group">
                                                <label className="form-label">New Password</label>
                                                <div className="input-with-icon">
                                                    <Lock className="input-icon" size={16} />
                                                    <input 
                                                        type="password" 
                                                        autoComplete="new-password"
                                                        placeholder="New password"
                                                        className="form-input"
                                                        value={passwordData.newPassword}
                                                        onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                                                    />
                                                </div>
                                            </div>

                                            <div className="form-group">
                                                <label className="form-label">Confirm New Password</label>
                                                <div className="input-with-icon">
                                                    <Lock className="input-icon" size={16} />
                                                    <input 
                                                        type="password" 
                                                        autoComplete="new-password"
                                                        placeholder="Confirm new password"
                                                        className="form-input"
                                                        value={passwordData.confirmPassword}
                                                        onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="form-actions">
                                            <button 
                                                type="submit" 
                                                disabled={saving}
                                                className="btn btn-secondary security-btn"
                                            >
                                                {saving ? <Loader2 className="spinner" /> : <Shield size={18} />}
                                                Update Password
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            <style jsx>{`
                .profile-page-wrapper {
                    min-height: 100vh;
                    background: var(--bg-base);
                }
                .main-layout {
                    display: flex;
                }
                .content-area {
                    flex: 1;
                    padding: 40px;
                }
                .profile-container {
                    max-width: 1000px;
                    margin: 0 auto;
                }
                .profile-header {
                    margin-bottom: 40px;
                }
                .profile-grid {
                    display: grid;
                    grid-template-columns: 320px 1fr;
                    gap: 32px;
                }
                @media (max-width: 900px) {
                    .profile-grid {
                        grid-template-columns: 1fr;
                    }
                }

                .profile-sidebar {
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                }

                .avatar-card {
                    padding: 32px 24px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                }
                .avatar-section {
                    position: relative;
                    margin-bottom: 24px;
                }
                .avatar-circle {
                    width: 140px;
                    height: 140px;
                    border-radius: 50%;
                    background: var(--bg-input);
                    border: 4px solid var(--border);
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: var(--shadow-glow);
                }
                .avatar-img {
                    width: 100%;
                    height: 100%;
                    object-cover: cover;
                }
                .avatar-placeholder {
                    color: var(--text-muted);
                }
                .avatar-loader {
                    position: absolute;
                    inset: 0;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                }
                .photo-edit-btn {
                    position: absolute;
                    bottom: 0;
                    right: 0;
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: var(--accent);
                    color: white;
                    border: 3px solid var(--bg-surface);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: var(--transition);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                }
                .photo-edit-btn:hover {
                    transform: scale(1.1);
                    background: var(--accent-2);
                }
                .photo-edit-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                
                .user-info-summary .user-full-name {
                    font-size: 22px;
                    margin-bottom: 4px;
                    background: var(--accent-grad);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .user-info-summary .user-handle {
                    font-size: 14px;
                    color: var(--text-secondary);
                    margin-bottom: 16px;
                }
                .role-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 12px;
                    background: var(--accent-soft);
                    color: var(--accent);
                    border: 1px solid var(--border);
                    border-radius: 99px;
                    font-size: 12px;
                    font-weight: 600;
                }

                .stats-card {
                    padding: 24px;
                }
                .section-title-sm {
                    font-size: 14px;
                    margin-bottom: 16px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: var(--text-primary);
                }
                .stats-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .stat-item {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    padding: 18px 0;
                    border-bottom: 1px solid var(--border);
                }
                .stat-item:last-child {
                    border-bottom: none;
                }
                .stat-label {
                    color: var(--text-muted);
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .stat-value {
                    font-size: 28px;
                    font-weight: 800;
                    background: var(--accent-grad);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    font-family: 'Outfit', sans-serif;
                    letter-spacing: -0.02em;
                    line-height: 1;
                }
                .stat-value.success {
                    background: linear-gradient(135deg, #10B981, #34D399);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                /* Light theme adjustments */
                :global([data-theme="light"]) .stats-card {
                    background: rgba(255, 255, 255, 0.82);
                    border-color: rgba(0, 0, 0, 0.08);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.8);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                }
                :global([data-theme="light"]) .stat-label {
                    color: #64748b;
                }

                .profile-main-content {
                    display: flex;
                    flex-direction: column;
                    gap: 32px;
                }
                .profile-form-card, .security-form-card {
                    padding: 32px;
                }
                .card-header {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-bottom: 32px;
                }
                .header-icon {
                    width: 44px;
                    height: 44px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .user-icon { background: rgba(139, 92, 246, 0.15); color: #8B5CF6; }
                .security-icon { background: rgba(245, 158, 11, 0.15); color: #F59E0B; }
                
                .section-title {
                    font-size: 20px;
                    font-weight: 700;
                    color: var(--text-primary);
                }

                .profile-form {
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                }
                .form-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 24px;
                }
                .full-width {
                    grid-column: span 2;
                }
                @media (max-width: 600px) {
                    .form-grid > * {
                        grid-column: span 2;
                    }
                }

                .input-with-icon {
                    position: relative;
                }
                .input-icon {
                    position: absolute;
                    left: 14px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: var(--text-muted);
                    transition: var(--transition);
                }
                .input-prefix {
                    position: absolute;
                    left: 14px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: var(--text-muted);
                    font-weight: 600;
                }
                .form-input {
                    padding-left: 42px !important;
                }
                .input-with-icon:focus-within .input-icon, 
                .input-with-icon:focus-within .input-prefix {
                    color: var(--accent);
                }

                .form-actions {
                    margin-top: 8px;
                    display: flex;
                    justify-content: flex-start;
                }
                .security-btn {
                    background: rgba(245, 158, 11, 0.1);
                    color: #F59E0B;
                    border-color: rgba(245, 158, 11, 0.2);
                }
                .security-btn:hover {
                    background: rgba(245, 158, 11, 0.2);
                    border-color: #F59E0B;
                    color: #fff;
                }

                .status-alert {
                    padding: 14px 18px;
                    border-radius: var(--radius);
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 24px;
                    font-size: 14px;
                    font-weight: 500;
                }
                .error-alert {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.2);
                    color: #FCA5A5;
                }
                .success-alert {
                    background: rgba(16, 185, 129, 0.1);
                    border: 1px solid rgba(16, 185, 129, 0.2);
                    color: #6EE7B7;
                }

                .hidden { display: none; }
                .spinner { animation: spin 0.8s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

export default ProfilePage;
