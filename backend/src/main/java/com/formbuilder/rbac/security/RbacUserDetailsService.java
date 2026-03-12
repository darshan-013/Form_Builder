package com.formbuilder.rbac.security;

import com.formbuilder.rbac.entity.User;
import com.formbuilder.rbac.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * Custom Spring Security UserDetailsService that reads credentials and
 * authorities directly from the rbac_users table + user_roles + roles +
 * role_permissions + permissions.
 *
 * Replaces JdbcUserDetailsManager — no more need for the Spring Security
 * 'users' and 'authorities' tables.
 *
 * Authorities granted:
 *   - ROLE_{RoleName}  for each assigned role (e.g. ROLE_Admin, ROLE_Viewer)
 *   - Each permission_key as a raw authority (e.g. READ, WRITE, MANAGE)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RbacUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = userRepository.findByUsernameWithRolesAndPermissions(username)
                .orElseThrow(() -> new UsernameNotFoundException(
                        "User not found: " + username));

        if (!user.isEnabled()) {
            throw new UsernameNotFoundException("User is disabled: " + username);
        }

        List<GrantedAuthority> authorities = new ArrayList<>();

        // Add ROLE_ prefixed authorities for each role
        user.getRoles().forEach(role -> {
            authorities.add(new SimpleGrantedAuthority("ROLE_" + role.getRoleName()));

            // Add each permission key as a raw authority
            role.getPermissions().forEach(perm ->
                    authorities.add(new SimpleGrantedAuthority(perm.getPermissionKey())));
        });

        log.debug("Loaded user '{}' with {} authorities", username, authorities.size());

        return org.springframework.security.core.userdetails.User.builder()
                .username(user.getUsername())
                .password(user.getPassword())
                .authorities(authorities)
                .accountExpired(false)
                .accountLocked(false)
                .credentialsExpired(false)
                .disabled(!user.isEnabled())
                .build();
    }
}

