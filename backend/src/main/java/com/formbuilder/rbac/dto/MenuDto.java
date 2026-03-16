package com.formbuilder.rbac.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MenuDto {
    private String section;
    private List<MenuItemDto> items;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class MenuItemDto {
        private String label;
        private String href;
        private String icon;
        private List<MenuItemDto> subItems;
    }
}
