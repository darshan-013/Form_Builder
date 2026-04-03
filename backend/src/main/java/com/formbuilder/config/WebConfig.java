package com.formbuilder.config;

import com.formbuilder.constants.AppConstants;
import com.formbuilder.rbac.security.PermissionInterceptor;
import jakarta.servlet.SessionCookieConfig;
import jakarta.servlet.ServletContext;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.web.servlet.ServletContextInitializer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final PermissionInterceptor permissionInterceptor;

    @Bean
    public ServletContextInitializer sessionCookieInitializer() {
        return (ServletContext ctx) -> {
            SessionCookieConfig config = ctx.getSessionCookieConfig();
            config.setHttpOnly(true);
            config.setSecure(false);
            config.setPath("/");
        };
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping(AppConstants.API_BASE + "/**")
                .allowedOriginPatterns(AppConstants.FRONTEND_URL, "http://127.0.0.1:3000")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH")
                .allowedHeaders("*")
                .exposedHeaders("Set-Cookie")
                .allowCredentials(true)
                .maxAge(3600);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(permissionInterceptor)
                .addPathPatterns(AppConstants.API_BASE + "/**")
                .excludePathPatterns(
                        AppConstants.API_AUTH + AppConstants.AUTH_LOGIN,
                        AppConstants.API_AUTH + "/register",
                        AppConstants.API_AUTH + AppConstants.AUTH_LOGOUT,
                        "/v3/api-docs/**",
                        "/swagger-ui/**",
                        "/swagger-ui.html"
                );
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler(AppConstants.API_BASE + "/uploads/**")
                .addResourceLocations("file:uploads/");
    }
}
