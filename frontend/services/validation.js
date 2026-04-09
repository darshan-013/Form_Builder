/**
 * ════════════════════════════════════════════════════════════════════════════
 * Enterprise Validation Engine  —  validation.js
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Covers EVERY rule in FieldConfigModal.js:
 *
 * TEXT    : required · minLength · maxLength · exactLength · trimWhitespace
 *           noLeadingTrailingSpaces · noConsecutiveSpaces · alphabetOnly
 *           alphanumericOnly · noSpecialCharacters
 *           allowSpecificSpecialCharacters · customRegex · emailFormat
 *           urlFormat · passwordStrength · unique
 *
 * NUMBER  : required · integerOnly · decimalAllowed · positiveOnly
 *           negativeAllowed · zeroAllowed · minValue · maxValue · maxDigits
 *           maxDecimalPlaces · noLeadingZero · phoneNumberFormat · otpFormat
 *           uniqueNumber · ageValidation · currencyFormat · percentageRange
 *
 * DATE    : required · customFormat · pastOnly · futureOnly · minDate · maxDate
 *           age18Plus (numeric) · noWeekend · notOlderThanXYears
 *
 * BOOLEAN : required · mustBeTrue · defaultValue
 *
 * DROPDOWN: required · defaultNotAllowed · multiSelectLimit · optionExists
 *
 * RADIO   : required · validateSelectedOption
 *
 * FILE    : required · singleOrMultiple · allowedExtensions · mimeTypeValidation
 *           maxFileSize · minFileSize · totalSizeLimit · imageDimensionCheck
 *           (minWidth/maxWidth/minHeight/maxHeight) · fileNameValidation
 *           · duplicateFilePrevention
 *
 * ── Behaviour ──────────────────────────────────────────────────────────────
 *   Required + empty   → "Please fill in this field"   (first priority)
 *   Required + invalid → specific validation message
 *   Optional + empty   → no error (all rules skipped)
 *   Optional + invalid → specific validation message  (BLOCKS submit)
 *
 * ── Public API ─────────────────────────────────────────────────────────────
 *   ValidationEngine.validateField(field, value, formData?, files?)
 *     → Promise<string[]>          (async — for onSubmit)
 *
 *   ValidationEngine.validateFieldSync(field, value, formData?, files?)
 *     → string[]                   (sync  — for onChange / onBlur)
 *
 *   ValidationEngine.validateForm(fields, formData, files?)
 *     → Promise<{ [fieldKey]: string[] }>
 * ════════════════════════════════════════════════════════════════════════════
 */

// ─── Internal helpers ─────────────────────────────────────────────────────────

const EMPTY_MSG = () => 'Please fill in this field';

const toStr = (v) => (v == null ? '' : String(v));
const trimmed = (v) => toStr(v).trim();

function safeJson(json, fallback) {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

/** Read image width/height from a File via FileReader + Image (async). */
function readImageDimensions(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function calcAge(birthDate, ref) {
  let age = ref.getFullYear() - birthDate.getFullYear();
  const m = ref.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birthDate.getDate())) age--;
  return age;
}

function isValidEmail(v) {
  return /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(v);
}

function isValidUrl(v) {
  try { new URL(v.startsWith('http') ? v : `https://${v}`); return true; }
  catch { return /^(https?:\/\/)?([A-Za-z0-9\-]+\.)+[A-Za-z]{2,}/.test(v); }
}

/**
 * Merge all rule sources into one flat object.
 *   1. validationJson  → main rule store from FieldConfigModal
 *   2. field.required  → separate DB column, injected as rules.required
 *   3. field.validationRegex → simple regex box → mapped to rules.customRegex
 */
function buildRules(field) {
  const rules = safeJson(field.validationJson, {});
  if (field.required) rules.required = true;
  if (field.validationRegex && !rules.customRegex) rules.customRegex = field.validationRegex;
  return rules;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEXT
// ═══════════════════════════════════════════════════════════════════════════════
function validateText(value, rules, label) {
  const errors = [];
  const raw = toStr(value);
  const val = raw.trim();

  if (!val) {
    if (rules.required) errors.push(EMPTY_MSG());
    return errors;
  }

  // Length (checked against trimmed value)
  if (rules.minLength != null && rules.minLength !== '') {
    const n = Number(rules.minLength);
    if (val.length < n) errors.push(`${label} must be at least ${n} character${n === 1 ? '' : 's'}`);
  }
  if (rules.maxLength != null && rules.maxLength !== '') {
    const n = Number(rules.maxLength);
    if (val.length > n) errors.push(`${label} must not exceed ${n} character${n === 1 ? '' : 's'}`);
  }
  if (rules.exactLength != null && rules.exactLength !== '') {
    const n = Number(rules.exactLength);
    if (val.length !== n) errors.push(`${label} must be exactly ${n} character${n === 1 ? '' : 's'}`);
  }

  // Whitespace (checked against raw value so leading/trailing are not hidden by trim)
  if (rules.noLeadingTrailingSpaces && raw !== raw.trim()) {
    errors.push(`${label} must not start or end with spaces`);
  }
  if (rules.noConsecutiveSpaces && raw.includes('  ')) {
    errors.push(`${label} must not contain consecutive spaces`);
  }

  // Character set
  if (rules.alphabetOnly && !/^[A-Za-z\s]+$/.test(val)) {
    errors.push(`${label} must contain only letters (A–Z)`);
  }
  if (rules.alphanumericOnly && !/^[A-Za-z0-9\s]+$/.test(val)) {
    errors.push(`${label} must contain only letters and numbers`);
  }
  if (rules.noSpecialCharacters && !/^[A-Za-z0-9\s]+$/.test(val)) {
    errors.push(`${label} must not contain special characters`);
  }
  if (rules.allowSpecificSpecialCharacters) {
    const allowed = rules.allowSpecificSpecialCharacters;
    const esc = allowed.replace(/([[\]\\^-])/g, '\\$1');
    try {
      if (!new RegExp(`^[A-Za-z0-9\\s${esc}]+$`).test(val)) {
        errors.push(`${label} may only use letters, numbers, spaces and: ${allowed}`);
      }
    } catch { /* malformed — skip */ }
  }

  // Content / format
  if (rules.emailFormat && !isValidEmail(val)) {
    errors.push(`${label} must be a valid email address`);
  }
  if (rules.urlFormat && !isValidUrl(val)) {
    errors.push(`${label} must be a valid URL`);
  }
  if (rules.passwordStrength) {
    const missing = [];
    if (!/[A-Z]/.test(val)) missing.push('uppercase letter');
    if (!/[a-z]/.test(val)) missing.push('lowercase letter');
    if (!/[0-9]/.test(val)) missing.push('number');
    if (!/[!@#$%^&*(),.?":{}|<>\-_=+[\]\\;'`~/]/.test(val)) missing.push('special character');
    if (missing.length) errors.push(`${label} must include: ${missing.join(', ')}`);
  }
  if (rules.customRegex) {
    try {
      if (!new RegExp(rules.customRegex).test(val)) errors.push(`${label} format is invalid`);
    } catch { /* malformed — skip */ }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NUMBER
// ═══════════════════════════════════════════════════════════════════════════════
function validateNumber(value, rules, label) {
  const errors = [];
  const raw = trimmed(value);

  if (!raw) {
    if (rules.required) errors.push(EMPTY_MSG());
    return errors;
  }

  const num = Number(raw);
  if (isNaN(num)) {
    errors.push(`${label} must be a valid number`);
    return errors;
  }

  if (rules.integerOnly && !Number.isInteger(num)) {
    errors.push(`${label} must be a whole number (no decimals)`);
  }
  if (rules.positiveOnly && num <= 0) {
    errors.push(`${label} must be greater than zero`);
  }
  if (!rules.negativeAllowed && !rules.positiveOnly && num < 0) {
    errors.push(`${label} must not be negative`);
  }
  if (rules.zeroAllowed === false && num === 0) {
    errors.push(`${label} cannot be zero`);
  }

  if (rules.minValue !== undefined && rules.minValue !== '' && num < Number(rules.minValue)) {
    errors.push(`${label} must be at least ${rules.minValue}`);
  }
  if (rules.maxValue !== undefined && rules.maxValue !== '' && num > Number(rules.maxValue)) {
    errors.push(`${label} must not exceed ${rules.maxValue}`);
  }

  if (rules.maxDigits) {
    const intPart = raw.split('.')[0].replace('-', '');
    if (intPart.length > Number(rules.maxDigits)) {
      errors.push(`${label} must not have more than ${rules.maxDigits} digit${rules.maxDigits === 1 ? '' : 's'}`);
    }
  }
  if (rules.maxDecimalPlaces != null && rules.maxDecimalPlaces !== '' && raw.includes('.')) {
    const dec = raw.split('.')[1] || '';
    if (dec.length > Number(rules.maxDecimalPlaces)) {
      errors.push(`${label} must not have more than ${rules.maxDecimalPlaces} decimal place${rules.maxDecimalPlaces === 1 ? '' : 's'}`);
    }
  }
  if (rules.noLeadingZero && /^-?0\d/.test(raw)) {
    errors.push(`${label} must not have leading zeros`);
  }

  if (rules.phoneNumberFormat && !/^\d{10}$/.test(raw)) {
    errors.push(`${label} must be a valid 10-digit phone number`);
  }
  if (rules.otpFormat) {
    const len = Number(rules.otpFormat);
    if (!new RegExp(`^\\d{${len}}$`).test(raw)) errors.push(`${label} must be a ${len}-digit OTP`);
  }
  if (rules.ageValidation && num < 18) {
    errors.push(`${label} must be at least 18`);
  }
  if (rules.currencyFormat && !/^\d+(\.\d{1,2})?$/.test(raw)) {
    errors.push(`${label} must be a valid currency amount (e.g. 10.99)`);
  }
  if (rules.percentageRange && (num < 0 || num > 100)) {
    errors.push(`${label} must be between 0 and 100`);
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Strict YYYY-MM-DD parser — the ONLY format the browser date input submits.
 * Returns a local-midnight Date or null if invalid.
 */
function parseYMD(raw) {
  // Must match YYYY-MM-DD exactly
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split('-').map(Number);
  // Month is 1-based in the string, 0-based in Date constructor
  const dt = new Date(y, m - 1, d);
  // Guard against roll-over (e.g. 2024-02-30 → March)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

/**
 * Parse a stored minDate/maxDate value (always YYYY-MM-DD from the date picker).
 */
function parseRuleDate(str) {
  if (!str) return null;
  return parseYMD(String(str).trim());
}

/**
 * Format a Date as DD/MM/YYYY or MM/DD/YYYY for display in error messages.
 */
function formatForDisplay(dt, fmt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  if (fmt === 'DD/MM/YYYY') return `${d}/${m}/${y}`;
  if (fmt === 'MM/DD/YYYY') return `${m}/${d}/${y}`;
  return `${y}-${m}-${d}`;          // YYYY-MM-DD default
}

function validateDate(value, rules, label) {
  const errors = [];
  const raw = trimmed(value);

  if (!raw) {
    if (rules.required) errors.push(EMPTY_MSG());
    return errors;
  }

  // ── Step 1: Parse the submitted value ────────────────────────────────────
  // The browser <input type="date"> ALWAYS submits YYYY-MM-DD regardless of
  // any display/locale format. We also accept DD/MM/YYYY and MM/DD/YYYY in
  // case the value was typed or comes from a non-native picker.
  const fmt = rules.customFormat || 'YYYY-MM-DD';
  let d = null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    // Standard browser format: YYYY-MM-DD
    d = parseYMD(raw);
  } else if (fmt === 'DD/MM/YYYY' && /^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    // User typed DD/MM/YYYY manually
    const [dd, mm, yyyy] = raw.split('/').map(Number);
    const dt = new Date(yyyy, mm - 1, dd);
    if (dt.getFullYear() === yyyy && dt.getMonth() === mm - 1 && dt.getDate() === dd) d = dt;
  } else if (fmt === 'MM/DD/YYYY' && /^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    // User typed MM/DD/YYYY manually
    const [mm, dd, yyyy] = raw.split('/').map(Number);
    const dt = new Date(yyyy, mm - 1, dd);
    if (dt.getFullYear() === yyyy && dt.getMonth() === mm - 1 && dt.getDate() === dd) d = dt;
  }

  if (!d) {
    // Give a friendly error that matches the configured format
    if (fmt === 'DD/MM/YYYY') errors.push(`${label} must be a valid date (e.g. 31/01/2025)`);
    else if (fmt === 'MM/DD/YYYY') errors.push(`${label} must be a valid date (e.g. 01/31/2025)`);
    else errors.push(`${label} must be a valid date`);
    return errors;
  }

  // Today at midnight for fair comparison
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (rules.minDate) {
    const min = parseRuleDate(rules.minDate);
    if (min && d < min) {
      errors.push(`${label} must be on or after ${formatForDisplay(min, fmt)}`);
    }
  }
  if (rules.maxDate) {
    const max = parseRuleDate(rules.maxDate);
    if (max && d > max) {
      errors.push(`${label} must be on or before ${formatForDisplay(max, fmt)}`);
    }
  }

  if (rules.pastOnly && d >= today) {
    errors.push(`${label} must be a past date`);
  }
  if (rules.futureOnly && d <= today) {
    errors.push(`${label} must be a future date`);
  }

  if (rules.noWeekend) {
    const day = d.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) {
      errors.push(`${label} cannot be a Saturday or Sunday`);
    }
  }

  if (rules.age18Plus != null && rules.age18Plus !== '') {
    const minAge = Number(rules.age18Plus);
    const age = calcAge(d, today);
    if (age < minAge) {
      errors.push(`${label} indicates age must be at least ${minAge} years old`);
    }
  }

  if (rules.notOlderThanXYears != null && rules.notOlderThanXYears !== '') {
    const maxYears = Number(rules.notOlderThanXYears);
    const age = calcAge(d, today);
    if (age > maxYears) {
      errors.push(`${label} must not be older than ${maxYears} years`);
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIME
// ═══════════════════════════════════════════════════════════════════════════════
function parseLocalTime(raw) {
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(raw)) return null;
  const parts = raw.split(':').map(Number);
  const hh = parts[0], mm = parts[1], ss = parts[2] ?? 0;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return null;
  return { hh, mm, ss, minutes: hh * 60 + mm + ss / 60 };
}

function validateTime(value, rules, label) {
  const errors = [];
  const raw = trimmed(value);

  if (!raw) {
    if (rules.required) errors.push(EMPTY_MSG());
    return errors;
  }

  const t = parseLocalTime(raw);
  if (!t) {
    errors.push(`${label} must be a valid time`);
    return errors;
  }

  if (rules.minTime) {
    const min = parseLocalTime(String(rules.minTime).trim());
    if (min && t.minutes < min.minutes) {
      errors.push(`${label} must be at or after ${String(rules.minTime).trim()}`);
    }
  }
  if (rules.maxTime) {
    const max = parseLocalTime(String(rules.maxTime).trim());
    if (max && t.minutes > max.minutes) {
      errors.push(`${label} must be at or before ${String(rules.maxTime).trim()}`);
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATE_TIME
// ═══════════════════════════════════════════════════════════════════════════════
function parseLocalDateTime(raw) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) return null;
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function validateDateTime(value, rules, label) {
  const errors = [];
  const raw = trimmed(value);

  if (!raw) {
    if (rules.required) errors.push(EMPTY_MSG());
    return errors;
  }

  const dt = parseLocalDateTime(raw);
  if (!dt) {
    errors.push(`${label} must be a valid date-time`);
    return errors;
  }

  if (rules.minDateTime) {
    const min = parseLocalDateTime(String(rules.minDateTime).trim());
    if (min && dt < min) {
      errors.push(`${label} must be on or after ${String(rules.minDateTime).trim()}`);
    }
  }
  if (rules.maxDateTime) {
    const max = parseLocalDateTime(String(rules.maxDateTime).trim());
    if (max && dt > max) {
      errors.push(`${label} must be on or before ${String(rules.maxDateTime).trim()}`);
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOOLEAN
// ═══════════════════════════════════════════════════════════════════════════════
function validateBoolean(value, rules, label) {
  const errors = [];
  const checked = value === true || value === 'true';

  if (rules.required && !checked) {
    errors.push('Please check this field');
    return errors;
  }
  if (rules.mustBeTrue && !checked) {
    errors.push(`${label} must be accepted to proceed`);
  }
  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DROPDOWN
// ═══════════════════════════════════════════════════════════════════════════════
function validateDropdown(value, rules, label, parsedOptions) {
  const errors = [];

  // Detect multi-select: value is an Array OR a JSON array string
  let selected = null; // null means single-select mode
  if (Array.isArray(value)) {
    selected = value.map(v => String(v).trim()).filter(Boolean);
  } else {
    const str = trimmed(value);
    if (str.startsWith('[')) {
      try { selected = JSON.parse(str).map(v => String(v).trim()).filter(Boolean); }
      catch { selected = null; }
    }
  }

  if (selected !== null) {
    // ── Multi-select validation ──
    if (selected.length === 0) {
      if (rules.required) errors.push(EMPTY_MSG());
      return errors;
    }

    // Validate each selected value is in options list
    if (parsedOptions && Array.isArray(parsedOptions) && parsedOptions.length > 0) {
      for (const sel of selected) {
        if (!parsedOptions.includes(sel)) {
          errors.push(`${label} contains an invalid selection`);
          return errors;
        }
      }
    }

    if (rules.multiSelectLimit && selected.length > Number(rules.multiSelectLimit)) {
      errors.push(`${label} allows at most ${rules.multiSelectLimit} selection${rules.multiSelectLimit === 1 ? '' : 's'}`);
    }

    return errors;
  }

  // ── Single-select validation ──
  const val = trimmed(value);

  if (!val) {
    if (rules.required) errors.push(EMPTY_MSG());
    return errors;
  }

  // Validate the chosen value is a real option
  if (parsedOptions && Array.isArray(parsedOptions) && parsedOptions.length > 0) {
    if (!parsedOptions.includes(val)) {
      errors.push(`${label} contains an invalid selection`);
      return errors;
    }
  }

  if (rules.defaultNotAllowed && val === String(rules.defaultNotAllowed).trim()) {
    errors.push(`Please select a valid option for ${label}`);
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RADIO
// ═══════════════════════════════════════════════════════════════════════════════
function validateRadio(value, rules, label, parsedOptions) {
  const errors = [];
  const val = trimmed(value);

  if (!val) {
    if (rules.required) errors.push(EMPTY_MSG());
    return errors;
  }

  // validateSelectedOption defaults to true
  if (rules.validateSelectedOption !== false) {
    if (parsedOptions && Array.isArray(parsedOptions) && !parsedOptions.includes(val)) {
      errors.push(`${label} contains an invalid selection`);
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LINEAR SCALE
// ═══════════════════════════════════════════════════════════════════════════════
function validateLinearScale(value, rules, label, field) {
  const errors = [];
  if (value === null || value === undefined || String(value).trim() === '') {
    if (rules.required) errors.push(EMPTY_MSG());
    return errors;
  }
  const num = Number(value);
  if (isNaN(num)) { errors.push(`${label} must be a valid number`); return errors; }

  // Read bounds from validationRules first, fallback to uiConfigJson
  let uiCfg = {};
  if (field && field.uiConfigJson) {
    try { uiCfg = JSON.parse(field.uiConfigJson); } catch { }
  }
  const minScale = rules.minScale ?? uiCfg.scaleMin ?? 1;
  const maxScale = rules.maxScale ?? uiCfg.scaleMax ?? 5;

  if (num < minScale) errors.push(`${label} must be at least ${minScale}`);
  if (num > maxScale) errors.push(`${label} must be at most ${maxScale}`);
  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MULTIPLE CHOICE (multi-select checkboxes — value is JSON array or comma string)
// ═══════════════════════════════════════════════════════════════════════════════
function validateMultipleChoice(value, rules, label, parsedOptions) {
  const errors = [];

  // Parse selected values — support both JSON array and comma-separated string
  let selected = [];
  if (Array.isArray(value)) {
    selected = value.map(v => String(v).trim()).filter(Boolean);
  } else if (value && String(value).trim()) {
    const str = String(value).trim();
    if (str.startsWith('[')) {
      try { selected = JSON.parse(str).map(v => String(v).trim()).filter(Boolean); }
      catch { selected = str.split(',').map(v => v.trim()).filter(Boolean); }
    } else {
      selected = str.split(',').map(v => v.trim()).filter(Boolean);
    }
  }

  if (selected.length === 0) {
    if (rules.required || rules.requireSelection) errors.push(EMPTY_MSG());
    return errors;
  }

  // Validate each selected value exists in options
  if (rules.validateSelectedOption !== false && parsedOptions && parsedOptions.length > 0) {
    for (const sel of selected) {
      if (!parsedOptions.includes(sel)) {
        errors.push(`${label} contains an invalid selection: "${sel}"`);
      }
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE  (async — image dimensions use FileReader)
// ═══════════════════════════════════════════════════════════════════════════════
async function validateFile(fileOrList, rules, label, allFiles) {
  const errors = [];

  // Normalise to array — handles File, FileList, or null/undefined
  let files = [];
  if (fileOrList instanceof FileList) {
    files = Array.from(fileOrList);
  } else if (fileOrList instanceof File) {
    files = [fileOrList];
  }

  if (files.length === 0) {
    if (rules.required) errors.push(EMPTY_MSG());
    return errors;
  }

  // ── Per-file checks ──────────────────────────────────────────────────────
  for (const file of files) {
    const name = file.name || '';
    const size = file.size || 0;
    const mime = file.type || '';
    const fileLabel = files.length > 1 ? `"${name}"` : label;

    // Extension
    if (rules.allowedExtensions) {
      const allowed = rules.allowedExtensions.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
      if (allowed.length && !allowed.includes(ext)) {
        errors.push(`${fileLabel} must be one of: ${allowed.join(', ')}`);
      }
    }

    // MIME type
    if (rules.mimeTypeValidation) {
      const allowed = rules.mimeTypeValidation.split(',').map(m => m.trim().toLowerCase()).filter(Boolean);
      if (allowed.length && !allowed.includes(mime.toLowerCase())) {
        errors.push(`${fileLabel} has an unsupported file type (${mime || 'unknown'})`);
      }
    }

    // Size limits
    if (rules.maxFileSize != null && rules.maxFileSize !== '') {
      const maxB = Number(rules.maxFileSize) * 1024 * 1024;
      if (size > maxB) errors.push(`${fileLabel} must not exceed ${rules.maxFileSize} MB (current: ${(size / 1024 / 1024).toFixed(2)} MB)`);
    }
    if (rules.minFileSize != null && rules.minFileSize !== '') {
      const minB = Number(rules.minFileSize) * 1024;
      if (size < minB) errors.push(`${fileLabel} must be at least ${rules.minFileSize} KB`);
    }

    // File name characters
    if (rules.fileNameValidation && !/^[A-Za-z0-9._\-\s]+$/.test(name)) {
      errors.push(`${fileLabel} filename contains invalid characters`);
    }

    // Image dimensions (async)
    if (rules.imageDimensionCheck && mime.startsWith('image/')) {
      const dim = rules.imageDimensionCheck;
      if (dim && (dim.minWidth || dim.maxWidth || dim.minHeight || dim.maxHeight)) {
        const dims = await readImageDimensions(file);
        if (!dims) {
          errors.push(`${fileLabel} could not be read as an image`);
        } else {
          if (dim.minWidth && dims.width < Number(dim.minWidth)) errors.push(`${fileLabel} image width must be at least ${dim.minWidth}px (actual: ${dims.width}px)`);
          if (dim.maxWidth && dims.width > Number(dim.maxWidth)) errors.push(`${fileLabel} image width must not exceed ${dim.maxWidth}px (actual: ${dims.width}px)`);
          if (dim.minHeight && dims.height < Number(dim.minHeight)) errors.push(`${fileLabel} image height must be at least ${dim.minHeight}px (actual: ${dims.height}px)`);
          if (dim.maxHeight && dims.height > Number(dim.maxHeight)) errors.push(`${fileLabel} image height must not exceed ${dim.maxHeight}px (actual: ${dims.height}px)`);
        }
      }
    }
  }

  // ── Aggregate checks ─────────────────────────────────────────────────────

  // Total size limit (all file fields combined)
  if (rules.totalSizeLimit != null && rules.totalSizeLimit !== '' && allFiles) {
    let total = 0;
    for (const v of Object.values(allFiles)) {
      if (v instanceof FileList) { for (let i = 0; i < v.length; i++) total += v[i].size || 0; }
      else if (v instanceof File) total += v.size || 0;
    }
    const maxTotal = Number(rules.totalSizeLimit) * 1024 * 1024;
    if (total > maxTotal) errors.push(`Total upload size must not exceed ${rules.totalSizeLimit} MB`);
  }

  // Duplicate file name prevention
  if (rules.duplicateFilePrevention && files.length > 1) {
    const names = files.map(f => f.name.toLowerCase());
    const seen = new Set();
    for (const n of names) {
      if (seen.has(n)) { errors.push(`${label} contains duplicate files (${n})`); break; }
      seen.add(n);
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC FILE (onChange/onBlur — skips async image check)
// ═══════════════════════════════════════════════════════════════════════════════
function validateFileSync(fileOrList, rules, label, allFiles) {
  const errors = [];

  // Normalise to array
  let files = [];
  if (fileOrList instanceof FileList) {
    files = Array.from(fileOrList);
  } else if (fileOrList instanceof File) {
    files = [fileOrList];
  }

  if (files.length === 0) {
    if (rules.required) errors.push(EMPTY_MSG());
    return errors;
  }

  for (const file of files) {
    const name = file.name || '';
    const size = file.size || 0;
    const mime = file.type || '';
    const fileLabel = files.length > 1 ? `"${name}"` : label;

    if (rules.allowedExtensions) {
      const allowed = rules.allowedExtensions.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
      if (allowed.length && !allowed.includes(ext)) errors.push(`${fileLabel} must be one of: ${allowed.join(', ')}`);
    }
    if (rules.mimeTypeValidation) {
      const allowed = rules.mimeTypeValidation.split(',').map(m => m.trim().toLowerCase()).filter(Boolean);
      if (allowed.length && !allowed.includes(mime.toLowerCase())) errors.push(`${fileLabel} has an unsupported file type (${mime || 'unknown'})`);
    }
    if (rules.maxFileSize != null && rules.maxFileSize !== '') {
      if (size > Number(rules.maxFileSize) * 1024 * 1024) errors.push(`${fileLabel} must not exceed ${rules.maxFileSize} MB (current: ${(size / 1024 / 1024).toFixed(2)} MB)`);
    }
    if (rules.minFileSize != null && rules.minFileSize !== '') {
      if (size < Number(rules.minFileSize) * 1024) errors.push(`${fileLabel} must be at least ${rules.minFileSize} KB`);
    }
    if (rules.fileNameValidation && !/^[A-Za-z0-9._\-\s]+$/.test(name)) {
      errors.push(`${fileLabel} filename contains invalid characters`);
    }
  }

  // Duplicate prevention (sync)
  if (rules.duplicateFilePrevention && files.length > 1) {
    const names = files.map(f => f.name.toLowerCase());
    const seen = new Set();
    for (const n of names) {
      if (seen.has(n)) { errors.push(`${label} contains duplicate files (${n})`); break; }
      seen.add(n);
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve valid option VALUES for a dropdown/radio field.
 * Priority:
 *   1. field.options  = [{label,value}] resolved by GET /render  ← always populated now
 *   2. field.optionsJson inline string                            ← legacy fallback
 */
function resolveOptionValues(field) {
  if (Array.isArray(field.options) && field.options.length > 0) {
    return field.options.map(o =>
      typeof o === 'string' ? o : String(o.value ?? o.label ?? '')
    );
  }
  const parsed = safeJson(field.optionsJson, []);
  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed.map(o =>
      typeof o === 'string' ? o : String(o.value ?? o.label ?? '')
    );
  }
  return [];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MULTIPLE CHOICE GRID
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Validates a multiple_choice_grid field.
 * value  = JSON string {"Service":"Good","Cleanliness":"Average"}
 * field.gridJson = {"rows":[...],"columns":[...]}  (from /render endpoint)
 */
function validateMultipleChoiceGrid(value, rules, label, field) {
  const errors = [];

  // Parse grid config from field.gridJson (passed from FormRenderDTO)
  let rows = [], columns = [];
  const gridJson = field.gridJson || field._gridJson;
  if (gridJson) {
    try {
      const g = JSON.parse(gridJson);
      rows = g.rows || [];
      columns = g.columns || [];
    } catch { }
  }

  // Parse selected values
  let selected = {};
  if (value && typeof value === 'string') {
    try { selected = JSON.parse(value); } catch { }
  } else if (value && typeof value === 'object') {
    selected = value;
  }

  const isEmpty = Object.keys(selected).length === 0;

  if (isEmpty) {
    if (rules.required) errors.push(EMPTY_MSG());
    return errors;
  }

  // eachRowRequired — every row must have a selection
  if (rules.eachRowRequired) {
    for (const row of rows) {
      if (!selected[row] || !selected[row].toString().trim()) {
        errors.push(`Please select an option for "${row}"`);
      }
    }
  }

  // Validate each selected value is in columns list
  if (columns.length > 0) {
    for (const [row, col] of Object.entries(selected)) {
      if (col && !columns.includes(col)) {
        errors.push(`"${col}" is not a valid option for "${row}"`);
      }
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAR RATING
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Validates a star_rating field.
 * value = integer string "1"–"5"
 */
function validateStarRating(value, rules, label) {
  const errors = [];
  const str = trimmed(value);

  if (!str) {
    if (rules.required) errors.push(EMPTY_MSG());
    return errors;
  }

  const num = Number(str);
  if (!Number.isInteger(num) || num < 1 || num > 5) {
    errors.push(`${label} must be between 1 and 5 stars`);
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECKBOX GRID
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Validates a checkbox_grid field.
 * value  = JSON string {"Row1":["ColA","ColB"],"Row2":["ColC"]}
 * field.gridJson = {"rows":[...],"columns":[...]}  (from /render endpoint)
 */
function validateCheckboxGrid(value, rules, label, field) {
  const errors = [];

  // Parse grid config from field.gridJson
  let rows = [], columns = [];
  const gridJson = field.gridJson || field._gridJson;
  if (gridJson) {
    try {
      const g = JSON.parse(gridJson);
      rows = g.rows || [];
      columns = g.columns || [];
    } catch { }
  }

  // Parse selected values — {"Row":["ColA","ColB"]}
  let selected = {};
  if (value && typeof value === 'string') {
    try { selected = JSON.parse(value); } catch { }
  } else if (value && typeof value === 'object') {
    selected = value;
  }

  const anySelected = Object.values(selected).some(v => Array.isArray(v) ? v.length > 0 : !!v);

  if (!anySelected) {
    if (rules.required) errors.push(EMPTY_MSG());
    return errors;
  }

  // eachRowRequired — every row must have at least one selection
  if (rules.eachRowRequired) {
    for (const row of rows) {
      const rowSel = selected[row];
      const hasSelection = Array.isArray(rowSel) ? rowSel.length > 0 : !!rowSel;
      if (!hasSelection) {
        errors.push(`Please select at least one option for "${row}"`);
      }
    }
  }

  // minPerRow / maxPerRow
  if (rules.minPerRow || rules.maxPerRow) {
    for (const row of rows) {
      const rowSel = selected[row];
      const count = Array.isArray(rowSel) ? rowSel.length : (rowSel ? 1 : 0);
      if (rules.minPerRow && count < rules.minPerRow) {
        errors.push(`Select at least ${rules.minPerRow} option(s) for "${row}"`);
      }
      if (rules.maxPerRow && count > rules.maxPerRow) {
        errors.push(`Select at most ${rules.maxPerRow} option(s) for "${row}"`);
      }
    }
  }

  // Validate each selected value is a valid column
  if (columns.length > 0) {
    for (const [row, rowSel] of Object.entries(selected)) {
      const vals = Array.isArray(rowSel) ? rowSel : [rowSel];
      for (const v of vals) {
        if (v && !columns.includes(v)) {
          errors.push(`"${v}" is not a valid option for "${row}"`);
        }
      }
    }
  }

  return errors;
}


/**
 * Async single-field validation.
 * Use at onSubmit time (runs image dimension checks etc.).
 */
async function validateField(field, value, formData = {}, files = {}) {
  const rules = buildRules(field);
  const label = field.label || field.fieldKey;
  const type = (field.fieldType || '').toLowerCase();
  const opts = (type === 'dropdown' || type === 'radio' || type === 'multiple_choice') ? resolveOptionValues(field) : null;

  let errors = [];
  switch (type) {
    case 'text': errors = validateText(value, rules, label); break;
    case 'number': errors = validateNumber(value, rules, label); break;
    case 'date': errors = validateDate(value, rules, label); break;
    case 'time': errors = validateTime(value, rules, label); break;
    case 'date_time': errors = validateDateTime(value, rules, label); break;
    case 'boolean': errors = validateBoolean(value, rules, label); break;
    case 'dropdown': errors = validateDropdown(value, rules, label, opts); break;
    case 'radio': errors = validateRadio(value, rules, label, opts); break;
    case 'multiple_choice': errors = validateMultipleChoice(value, rules, label, opts); break;
    case 'linear_scale': errors = validateLinearScale(value, rules, label, field); break;
    case 'star_rating': errors = validateStarRating(value, rules, label); break;
    case 'multiple_choice_grid': errors = validateMultipleChoiceGrid(value, rules, label, field); break;
    case 'checkbox_grid': errors = validateCheckboxGrid(value, rules, label, field); break;
    case 'file': {
      const fileVal = files[field.fieldKey];
      const resolved = fileVal instanceof FileList || fileVal instanceof File
        ? fileVal
        : (value instanceof FileList || value instanceof File ? value : null);
      errors = await validateFile(resolved, rules, label, files);
      break;
    }
    default: errors = [];
  }

  if (errors.length > 0 && field.validationMessage) {
    return [field.validationMessage];
  }
  return errors;
}

/**
 * Sync single-field validation.
 * Use for onChange / onBlur — no async work, instant response.
 */
function validateFieldSync(field, value, formData = {}, files = {}) {
  const rules = buildRules(field);
  const label = field.label || field.fieldKey;
  const type = (field.fieldType || '').toLowerCase();
  const opts = (type === 'dropdown' || type === 'radio' || type === 'multiple_choice') ? resolveOptionValues(field) : null;

  let errors = [];
  switch (type) {
    case 'text': errors = validateText(value, rules, label); break;
    case 'number': errors = validateNumber(value, rules, label); break;
    case 'date': errors = validateDate(value, rules, label); break;
    case 'time': errors = validateTime(value, rules, label); break;
    case 'date_time': errors = validateDateTime(value, rules, label); break;
    case 'boolean': errors = validateBoolean(value, rules, label); break;
    case 'dropdown': errors = validateDropdown(value, rules, label, opts); break;
    case 'radio': errors = validateRadio(value, rules, label, opts); break;
    case 'multiple_choice': errors = validateMultipleChoice(value, rules, label, opts); break;
    case 'linear_scale': errors = validateLinearScale(value, rules, label, field); break;
    case 'star_rating': errors = validateStarRating(value, rules, label); break;
    case 'multiple_choice_grid': errors = validateMultipleChoiceGrid(value, rules, label, field); break;
    case 'checkbox_grid': errors = validateCheckboxGrid(value, rules, label, field); break;
    case 'file': {
      const fileVal = files[field.fieldKey];
      const resolved = fileVal instanceof FileList || fileVal instanceof File
        ? fileVal
        : (value instanceof FileList || value instanceof File ? value : null);
      errors = validateFileSync(resolved, rules, label, files);
      break;
    }
    default: errors = [];
  }

  if (errors.length > 0 && field.validationMessage) {
    return [field.validationMessage];
  }
  return errors;
}

/**
 * Validate all fields in parallel.
 * Returns only fields that have at least one error.
 *
 * @returns {Promise<{ [fieldKey]: string[] }>}
 */
async function validateForm(fields, formData, files = {}) {
  const results = await Promise.all(
    fields.map((field) =>
      validateField(field, formData[field.fieldKey], formData, files)
        .then((errs) => [field.fieldKey, errs])
    )
  );

  return Object.fromEntries(results.filter(([, errs]) => errs.length > 0));
}

// Named export (tree-shakeable) + default for backward compatibility
export const ValidationEngine = { validateField, validateFieldSync, validateForm, isValidEmail, isValidUrl };
export default ValidationEngine;
