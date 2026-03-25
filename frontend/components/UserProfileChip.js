import React from 'react';
import { useAuth } from '../context/AuthContext';
import Link from 'next/link';

export default function UserProfileChip() {
    const { user, roles } = useAuth();
    
    if (!user) return null;

    const roleDisplay = roles && roles.length > 0
        ? roles[0].roleName
        : 'User';

    return (
        <div className="user-profile-chip-container">
            <Link href="/profile" className="profile-chip">
                <div className="avatar-wrapper">
                    {user.profilePic ? (
                        <img 
                            src={`/api/uploads/${user.profilePic}`} 
                            alt={user.username} 
                            className="chip-avatar" 
                        />
                    ) : (
                        <span className="chip-avatar-placeholder">👤</span>
                    )}
                </div>
                <div className="chip-details">
                    <span className="chip-username">{user.username}</span>
                    <span className="chip-role">{roleDisplay}</span>
                </div>
            </Link>

            <style jsx>{`
                .user-profile-chip-container {
                    position: fixed;
                    top: 24px;
                    right: 24px;
                    z-index: 1000;
                }
                .profile-chip {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                    padding: 8px;
                    background: transparent;
                    text-decoration: none;
                    color: white;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .profile-chip:hover {
                    transform: translateY(-2px) scale(1.05);
                }
                .profile-chip:hover .avatar-wrapper {
                    border-color: #8B5CF6;
                    box-shadow: 0 0 20px rgba(139, 92, 246, 0.4);
                }
                .avatar-wrapper {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    overflow: hidden;
                    background: #1e1e24;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    transition: all 0.3s ease;
                }
                .chip-avatar {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .chip-avatar-placeholder {
                    font-size: 1.5rem;
                }
                .chip-details {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    line-height: 1.2;
                }
                .chip-username {
                    font-size: 14px;
                    font-weight: 700;
                    color: #f8fafc;
                }
                .chip-role {
                    font-size: 11px;
                    color: #94a3b8;
                    font-weight: 500;
                }

                /* Light theme adjustments */
                :global([data-theme="light"]) .profile-chip {
                    background: rgba(255, 255, 255, 0.9);
                    border-color: rgba(0, 0, 0, 0.08);
                }
                :global([data-theme="light"]) .chip-username {
                    color: #1e293b;
                }
                :global([data-theme="light"]) .chip-role {
                    color: #64748b;
                }
                :global([data-theme="light"]) .avatar-wrapper {
                    border-color: rgba(0, 0, 0, 0.1);
                    background: #f1f5f9;
                }
                
                @media (max-width: 640px) {
                    .user-profile-chip-container {
                        top: 16px;
                        right: 16px;
                    }
                    .chip-details {
                        display: none;
                    }
                    .profile-chip {
                        padding: 4px;
                    }
                }
            `}</style>
        </div>
    );
}
