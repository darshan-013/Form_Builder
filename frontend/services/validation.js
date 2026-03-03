/**
 * Advanced Field Validation Utility
 * Validates form fields based on validation_json rules before submission.
 */

export const ValidationRules = {
  // ═══════════════════════════════════════════════════════════════════════
  // TEXT FIELD VALIDATION
  // ═══════════════════════════════════════════════════════════════════════
  validateText(value, rules, label) {
    const errors = [];
    const strValue = String(value || '').trim();

    if (!strValue && rules.required) {
      errors.push(`${label} is required`);
      return errors;
    }

    if (!strValue) return errors;

    // Length validations
    if (rules.minLength && strValue.length < rules.minLength) {
      errors.push(`${label} must be at least ${rules.minLength} characters`);
    }

    if (rules.maxLength && strValue.length > rules.maxLength) {
      errors.push(`${label} must not exceed ${rules.maxLength} characters`);
    }

    if (rules.exactLength && strValue.length !== rules.exactLength) {
      errors.push(`${label} must be exactly ${rules.exactLength} characters`);
    }

    // Whitespace validations
    if (rules.noLeadingTrailingSpaces && value !== value.trim()) {
      errors.push(`${label} must not have leading or trailing spaces`);
    }

    if (rules.noConsecutiveSpaces && strValue.includes('  ')) {
      errors.push(`${label} must not contain consecutive spaces`);
    }

    // Format validations
    if (rules.alphabetOnly && !/^[A-Za-z]+$/.test(strValue)) {
      errors.push(`${label} must contain only alphabetic characters`);
    }

    if (rules.alphanumericOnly && !/^[A-Za-z0-9]+$/.test(strValue)) {
      errors.push(`${label} must contain only letters and numbers`);
    }

    if (rules.noSpecialCharacters && !/^[A-Za-z0-9\s]+$/.test(strValue)) {
      errors.push(`${label} must not contain special characters`);
    }

    if (rules.allowSpecificSpecialCharacters) {
      const pattern = new RegExp(`^[A-Za-z0-9\\s${rules.allowSpecificSpecialCharacters}]+$`);
      if (!pattern.test(strValue)) {
        errors.push(`${label} contains invalid characters`);
      }
    }

    // Content validations
    if (rules.emailFormat && !this.isValidEmail(strValue)) {
      errors.push(`${label} must be a valid email address`);
    }

    if (rules.urlFormat && !this.isValidUrl(strValue)) {
      errors.push(`${label} must be a valid URL`);
    }

    if (rules.passwordStrength) {
      const pwdErrors = this.validatePasswordStrength(strValue);
      if (pwdErrors.length > 0) {
        errors.push(`${label} must contain uppercase, lowercase, digit, and special character`);
      }
    }

    if (rules.customRegex) {
      try {
        const regex = new RegExp(rules.customRegex);
        if (!regex.test(strValue)) {
          errors.push(`${label} format is invalid`);
        }
      } catch (e) {
        console.warn('Invalid regex pattern:', rules.customRegex);
      }
    }

    return errors;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // NUMBER FIELD VALIDATION
  // ═══════════════════════════════════════════════════════════════════════
  validateNumber(value, rules, label) {
    const errors = [];
    const strValue = String(value || '').trim();

    if (!strValue && rules.required) {
      errors.push(`${label} is required`);
      return errors;
    }

    if (!strValue) return errors;

    const numValue = parseFloat(strValue);
    if (isNaN(numValue)) {
      errors.push(`${label} must be a valid number`);
      return errors;
    }

    // Type validations
    if (rules.integerOnly && !Number.isInteger(numValue)) {
      errors.push(`${label} must be an integer`);
    }

    if (rules.positiveOnly && numValue <= 0) {
      errors.push(`${label} must be positive`);
    }

    if (rules.zeroAllowed === false && numValue === 0) {
      errors.push(`${label} cannot be zero`);
    }

    // Range validations
    if (rules.minValue !== undefined && numValue < rules.minValue) {
      errors.push(`${label} must be at least ${rules.minValue}`);
    }

    if (rules.maxValue !== undefined && numValue > rules.maxValue) {
      errors.push(`${label} must not exceed ${rules.maxValue}`);
    }

    // Format validations
    if (rules.maxDigits) {
      const intPart = strValue.split('.')[0].replace('-', '');
      if (intPart.length > rules.maxDigits) {
        errors.push(`${label} must not have more than ${rules.maxDigits} digits`);
      }
    }

    if (rules.maxDecimalPlaces && strValue.includes('.')) {
      const decimalPart = strValue.split('.')[1];
      if (decimalPart && decimalPart.length > rules.maxDecimalPlaces) {
        errors.push(`${label} must not have more than ${rules.maxDecimalPlaces} decimal places`);
      }
    }

    if (rules.noLeadingZero && /^0[0-9]+/.test(strValue)) {
      errors.push(`${label} must not have leading zeros`);
    }

    // Business validations
    if (rules.phoneNumberFormat && !/^[0-9]{10}$/.test(strValue)) {
      errors.push(`${label} must be a valid 10-digit phone number`);
    }

    if (rules.otpFormat && !new RegExp(`^[0-9]{${rules.otpFormat}}$`).test(strValue)) {
      errors.push(`${label} must be a ${rules.otpFormat}-digit OTP`);
    }

    if (rules.ageValidation && numValue < 18) {
      errors.push(`${label} must be at least 18`);
    }

    if (rules.percentageRange && (numValue < 0 || numValue > 100)) {
      errors.push(`${label} must be between 0 and 100`);
    }

    return errors;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DATE FIELD VALIDATION
  // ═══════════════════════════════════════════════════════════════════════
  validateDate(value, rules, label) {
    const errors = [];
    const strValue = String(value || '').trim();

    if (!strValue && rules.required) {
      errors.push(`${label} is required`);
      return errors;
    }

    if (!strValue) return errors;

    const date = new Date(strValue);
    if (isNaN(date.getTime())) {
      errors.push(`${label} must be a valid date`);
      return errors;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Range validations
    if (rules.minDate) {
      const min = new Date(rules.minDate);
      if (date < min) {
        errors.push(`${label} must be on or after ${rules.minDate}`);
      }
    }

    if (rules.maxDate) {
      const max = new Date(rules.maxDate);
      if (date > max) {
        errors.push(`${label} must be on or before ${rules.maxDate}`);
      }
    }

    // Logical validations
    if (rules.pastOnly && date > today) {
      errors.push(`${label} must be in the past`);
    }

    if (rules.futureOnly && date < today) {
      errors.push(`${label} must be in the future`);
    }

    if (rules.age18Plus) {
      const age = this.calculateAge(date);
      if (age < 18) {
        errors.push(`${label} indicates age must be at least 18 years`);
      }
    }

    if (rules.notOlderThanXYears) {
      const age = this.calculateAge(date);
      if (age > rules.notOlderThanXYears) {
        errors.push(`${label} must not be older than ${rules.notOlderThanXYears} years`);
      }
    }

    if (rules.noWeekend) {
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        errors.push(`${label} cannot be a weekend`);
      }
    }

    return errors;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // BOOLEAN FIELD VALIDATION
  // ═══════════════════════════════════════════════════════════════════════
  validateBoolean(value, rules, label) {
    const errors = [];

    if (rules.mustBeTrue && !value) {
      errors.push(`${label} must be accepted`);
    }

    return errors;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DROPDOWN FIELD VALIDATION
  // ═══════════════════════════════════════════════════════════════════════
  validateDropdown(value, rules, label, options) {
    const errors = [];
    const strValue = String(value || '').trim();

    if (!strValue && rules.required) {
      errors.push(`${label} is required`);
      return errors;
    }

    if (!strValue) return errors;

    // Validate option exists
    if (options && !options.includes(strValue)) {
      errors.push(`${label} has an invalid selection`);
    }

    if (rules.defaultNotAllowed && strValue === rules.defaultNotAllowed) {
      errors.push(`${label} default option is not allowed`);
    }

    return errors;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // RADIO FIELD VALIDATION
  // ═══════════════════════════════════════════════════════════════════════
  validateRadio(value, rules, label, options) {
    const errors = [];
    const strValue = String(value || '').trim();

    if (!strValue && rules.required) {
      errors.push(`${label} is required`);
      return errors;
    }

    if (!strValue) return errors;

    // Validate option exists
    if (options && !options.includes(strValue)) {
      errors.push(`${label} has an invalid selection`);
    }

    return errors;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // FILE FIELD VALIDATION
  // ═══════════════════════════════════════════════════════════════════════
  validateFile(file, rules, label) {
    const errors = [];

    if (!file && rules.required) {
      errors.push(`${label} is required`);
      return errors;
    }

    if (!file) return errors;

    const filename = file.name;
    const fileSize = file.size;
    const fileType = file.type;

    // Extension validation
    if (rules.allowedExtensions) {
      const allowed = rules.allowedExtensions.split(',').map(ext => ext.trim().toLowerCase());
      const fileExt = filename.substring(filename.lastIndexOf('.')).toLowerCase();
      if (!allowed.includes(fileExt)) {
        errors.push(`${label} must be one of: ${rules.allowedExtensions}`);
      }
    }

    // MIME type validation
    if (rules.mimeTypeValidation) {
      const allowed = rules.mimeTypeValidation.split(',').map(mime => mime.trim());
      if (!allowed.includes(fileType)) {
        errors.push(`${label} has invalid file type`);
      }
    }

    // Size validations
    if (rules.maxFileSize) {
      const maxBytes = rules.maxFileSize * 1024 * 1024; // MB to bytes
      if (fileSize > maxBytes) {
        errors.push(`${label} exceeds maximum size of ${rules.maxFileSize} MB`);
      }
    }

    if (rules.minFileSize) {
      const minBytes = rules.minFileSize * 1024; // KB to bytes
      if (fileSize < minBytes) {
        errors.push(`${label} is smaller than minimum size of ${rules.minFileSize} KB`);
      }
    }

    // Filename validation
    if (rules.fileNameValidation && !/^[A-Za-z0-9._-]+$/.test(filename)) {
      errors.push(`${label} filename contains invalid characters`);
    }

    // Image dimension validation (requires reading image)
    if (rules.imageDimensionCheck && fileType.startsWith('image/')) {
      // This will be handled asynchronously
      return this.validateImageDimensions(file, rules.imageDimensionCheck, label);
    }

    return Promise.resolve(errors);
  },

  // ═══════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════
  isValidEmail(email) {
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
  },

  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return /^(https?:\/\/)?([w-]+\.)+[\w-]+(\/[\w-./?%&=]*)?$/.test(url);
    }
  },

  validatePasswordStrength(password) {
    const errors = [];
    if (!/[A-Z]/.test(password)) errors.push('uppercase');
    if (!/[a-z]/.test(password)) errors.push('lowercase');
    if (!/[0-9]/.test(password)) errors.push('digit');
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push('special');
    return errors;
  },

  calculateAge(birthDate) {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  },

  async validateImageDimensions(file, rules, label) {
    return new Promise((resolve) => {
      const errors = [];
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        if (rules.minWidth && img.width < rules.minWidth) {
          errors.push(`${label} width must be at least ${rules.minWidth} pixels`);
        }
        if (rules.maxWidth && img.width > rules.maxWidth) {
          errors.push(`${label} width must not exceed ${rules.maxWidth} pixels`);
        }
        if (rules.minHeight && img.height < rules.minHeight) {
          errors.push(`${label} height must be at least ${rules.minHeight} pixels`);
        }
        if (rules.maxHeight && img.height > rules.maxHeight) {
          errors.push(`${label} height must not exceed ${rules.maxHeight} pixels`);
        }
        URL.revokeObjectURL(url);
        resolve(errors);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        errors.push(`${label} is not a valid image`);
        resolve(errors);
      };

      img.src = url;
    });
  },

  /**
   * Validates a single field based on its type and validation rules.
   * @param {Object} field - Field metadata
   * @param {*} value - Field value
   * @param {File} file - File object (for file fields)
   * @returns {Promise<string[]>} Array of error messages
   */
  async validateField(field, value, file = null) {
    const rules = field.validationJson ? JSON.parse(field.validationJson) : {};
    const label = field.label;
    const type = field.fieldType;

    // Parse options for dropdown/radio
    let options = null;
    if (field.optionsJson) {
      try {
        options = JSON.parse(field.optionsJson);
      } catch (e) {
        console.warn('Failed to parse options:', e);
      }
    }

    switch (type) {
      case 'text':
        return this.validateText(value, rules, label);
      case 'number':
        return this.validateNumber(value, rules, label);
      case 'date':
        return this.validateDate(value, rules, label);
      case 'boolean':
        return this.validateBoolean(value, rules, label);
      case 'dropdown':
        return this.validateDropdown(value, rules, label, options);
      case 'radio':
        return this.validateRadio(value, rules, label, options);
      case 'file':
        return await this.validateFile(file, rules, label);
      default:
        return [];
    }
  },

  /**
   * Validates all form fields before submission.
   * @param {Array} fields - Array of field metadata
   * @param {Object} formData - Form data
   * @param {Object} files - File objects map
   * @returns {Promise<Object>} Object with errors keyed by field name
   */
  async validateForm(fields, formData, files = {}) {
    const allErrors = {};

    for (const field of fields) {
      const value = formData[field.fieldKey];
      const file = files[field.fieldKey];

      const errors = await this.validateField(field, value, file);
      if (errors.length > 0) {
        allErrors[field.fieldKey] = errors;
      }
    }

    return allErrors;
  }
};

export default ValidationRules;

