package com.formbuilder.rbac.repository;

import com.formbuilder.rbac.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Integer> {

       Optional<User> findByUsername(String username);

       boolean existsByUsername(String username);

       boolean existsByEmail(String email);

       /** Eagerly fetch a user with roles + each role's permissions loaded. */
       @Query("SELECT DISTINCT u FROM User u " +
                     "LEFT JOIN FETCH u.roles r " +
                     "LEFT JOIN FETCH r.permissions " +
                     "WHERE u.username = :username")
       Optional<User> findByUsernameWithRolesAndPermissions(@Param("username") String username);

       /** Eagerly fetch a user by ID with roles + each role's permissions loaded. */
       @Query("SELECT DISTINCT u FROM User u " +
                     "LEFT JOIN FETCH u.roles r " +
                     "LEFT JOIN FETCH r.permissions " +
                     "WHERE u.id = :id")
       Optional<User> findByIdWithRolesAndPermissions(@Param("id") Integer id);

       /** All users ordered by username. */
       @Query("SELECT u FROM User u ORDER BY u.username ASC")
       List<User> findAllOrdered();

       /** All users with roles + permissions eagerly loaded (for admin listing). */
       @Query("SELECT DISTINCT u FROM User u " +
                     "LEFT JOIN FETCH u.roles r " +
                     "LEFT JOIN FETCH r.permissions " +
                     "ORDER BY u.username ASC")
       List<User> findAllWithRolesAndPermissions();
}
