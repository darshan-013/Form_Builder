package com.formbuilder.rbac.controller;

import com.formbuilder.rbac.dto.MenuDto;
import com.formbuilder.rbac.service.MenuService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;

@RestController
@RequestMapping("/api/menu")
@RequiredArgsConstructor
public class MenuController {

    private final MenuService menuService;

    @GetMapping
    public List<MenuDto> getMenu() {
        return menuService.getMenuForCurrentUser();
    }
}
