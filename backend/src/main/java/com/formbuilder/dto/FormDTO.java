package com.formbuilder.dto;

import lombok.Data;
import java.util.List;

@Data
public class FormDTO {
    private String name;
    private String description;
    private List<FormFieldDTO> fields;
}
