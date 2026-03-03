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

const toStr   = (v) => (v == null ? '' : String(v));
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
      img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
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
  if (field.required)                          rules.required    = true;
  if (field.validationRegex && !rules.customRegex) rules.customRegex = field.validationRegex;
  return rules;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEXT
// ═══════════════════════════════════════════════════════════════════════════════
function validateText(value, rules, label) {
  const errors = [];
  const raw  = toStr(value);
  const val  = raw.trim();

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
    const esc     = allowed.replace(/([[\]\\^-])/g, '\\$1');
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
    if (!/[A-Z]/.test(val))                            missing.push('uppercase letter');
    if (!/[a-z]/.test(val))                            missing.push('lowercase letter');
    if (!/[0-9]/.test(val))                            missing.push('number');
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
  const y  = dt.getFullYear();
  const m  = String(dt.getMonth() + 1).padStart(2, '0');
  const d  = String(dt.getDate()).padStart(2, '0');
  if (fmt === 'DD/MM/YYYY') return `${d}/${m}/${y}`;
  if (fmt === 'MM/DD/YYYY') return `${m}/${d}/${y}`;
  return `${y}-${m}-${d}`;          // YYYY-MM-DD default
}

function validateDate(value, rules, label) {
  const errors = [];
  const raw    = trimmed(value);

  if (!raw) {
    if (rules.required) errors.push(EMPTY_MSG());
    return errors;
  }

  // Browser always submits YYYY-MM-DD — reject anything else
  const d = parseYMD(raw);
  if (!d) {
    errors.push(`${label} must be a valid date (YYYY-MM-DD)`);
    return errors;
  }

  // customFormat — when set, inform user of expected display format.
  // Validation still uses the raw YYYY-MM-DD value (browser standard).
  // If the user somehow submitted a non-YYYY-MM-DD string in that format, reject it.
  const fmt = rules.customFormat || 'YYYY-MM-DD';
  if (fmt === 'DD/MM/YYYY' && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    errors.push(`${label} must be entered as DD/MM/YYYY`);
    return errors;
  }
  if (fmt === 'MM/DD/YYYY' && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    errors.push(`${label} must be entered as MM/DD/YYYY`);
    return errors;
  }

  // Today at midnight for fair comparison
  const now   = new Date();
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
    const age    = calcAge(d, today);
    if (age < minAge) {
      errors.push(`${label} indicates age must be at least ${minAge} years old`);
    }
  }

  if (rules.notOlderThanXYears != null && rules.notOlderThanXYears !== '') {
    const maxYears = Number(rules.notOlderThanXYears);
    const age      = calcAge(d, today);
    if (age > maxYears) {
      errors.push(`${label} must not be older than ${maxYears} years`);
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOOLEAN
// ═══════════════════════════════════════════════════════════════════════════════
function validateBoolean(value, rules, label) {
  const errors  = [];
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
  const val    = trimmed(value);

  if (!val) {
    if (rules.required) errors.push(EMPTY_MSG());
    return errors;
  }

  // Always validate the chosen value is a real option
  if (parsedOptions && Array.isArray(parsedOptions) && parsedOptions.length > 0) {
    if (!parsedOptions.includes(val)) {
      errors.push(`${label} contains an invalid selection`);
      return errors;
    }
  }

  if (rules.defaultNotAllowed && val === String(rules.defaultNotAllowed).trim()) {
    errors.push(`Please select a valid option for ${label}`);
  }

  if (rules.multiSelectLimit && Array.isArray(value) && value.length > Number(rules.multiSelectLimit)) {
    errors.push(`${label} allows at most ${rules.multiSelectLimit} selection${rules.multiSelectLimit === 1 ? '' : 's'}`);
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RADIO
// ═══════════════════════════════════════════════════════════════════════════════
function validateRadio(value, rules, label, parsedOptions) {
  const errors = [];
  const val    = trimmed(value);

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
// FILE  (async — image dimensions use FileReader)
// ═══════════════════════════════════════════════════════════════════════════════
async function validateFile(file, rules, label, allFiles) {
  const errors = [];

  if (!file || !(file instanceof File)) {
    if (rules.required) errors.push(EMPTY_MSG());
    return errors;
  }

  const name = file.name   || '';
  const size = file.size   || 0;
  const mime = file.type   || '';

  // Extension
  if (rules.allowedExtensions) {
    const allowed = rules.allowedExtensions.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const ext     = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
    if (allowed.length && !allowed.includes(ext)) {
      errors.push(`${label} must be one of: ${allowed.join(', ')}`);
    }
  }

  // MIME type
  if (rules.mimeTypeValidation) {
    const allowed = rules.mimeTypeValidation.split(',').map(m => m.trim().toLowerCase()).filter(Boolean);
    if (allowed.length && !allowed.includes(mime.toLowerCase())) {
      errors.push(`${label} has an unsupported file type (${mime || 'unknown'})`);
    }
  }

  // Size limits
  if (rules.maxFileSize != null && rules.maxFileSize !== '') {
    const maxB = Number(rules.maxFileSize) * 1024 * 1024;
    if (size > maxB) errors.push(`${label} must not exceed ${rules.maxFileSize} MB (current: ${(size / 1024 / 1024).toFixed(2)} MB)`);
  }
  if (rules.minFileSize != null && rules.minFileSize !== '') {
    const minB = Number(rules.minFileSize) * 1024;
    if (size < minB) errors.push(`${label} must be at least ${rules.minFileSize} KB`);
  }

  // Total size limit (all file fields combined)
  if (rules.totalSizeLimit != null && rules.totalSizeLimit !== '' && allFiles) {
    const total    = Object.values(allFiles).filter(f => f instanceof File).reduce((s, f) => s + (f.size || 0), 0);
    const maxTotal = Number(rules.totalSizeLimit) * 1024 * 1024;
    if (total > maxTotal) errors.push(`Total upload size must not exceed ${rules.totalSizeLimit} MB`);
  }

  // File name characters
  if (rules.fileNameValidation && !/^[A-Za-z0-9._\-\s]+$/.test(name)) {
    errors.push(`${label} filename contains invalid characters`);
  }

  // Image dimensions (async)
  if (rules.imageDimensionCheck && mime.startsWith('image/')) {
    const dim = rules.imageDimensionCheck;
    if (dim && (dim.minWidth || dim.maxWidth || dim.minHeight || dim.maxHeight)) {
      const dims = await readImageDimensions(file);
      if (!dims) {
        errors.push(`${label} could not be read as an image`);
      } else {
        if (dim.minWidth  && dims.width  < Number(dim.minWidth))  errors.push(`${label} image width must be at least ${dim.minWidth}px (actual: ${dims.width}px)`);
        if (dim.maxWidth  && dims.width  > Number(dim.maxWidth))  errors.push(`${label} image width must not exceed ${dim.maxWidth}px (actual: ${dims.width}px)`);
        if (dim.minHeight && dims.height < Number(dim.minHeight)) errors.push(`${label} image height must be at least ${dim.minHeight}px (actual: ${dims.height}px)`);
        if (dim.maxHeight && dims.height > Number(dim.maxHeight)) errors.push(`${label} image height must not exceed ${dim.maxHeight}px (actual: ${dims.height}px)`);
      }
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC FILE (onChange/onBlur — skips async image check)
// ═══════════════════════════════════════════════════════════════════════════════
function validateFileSync(file, rules, label, allFiles) {
  const errors = [];
  if (!file || !(file instanceof File)) {
    if (rules.required) errors.push(EMPTY_MSG());
    return errors;
  }
  const name = file.name || '';
  const size = file.size || 0;
  const mime = file.type || '';

  if (rules.allowedExtensions) {
    const allowed = rules.allowedExtensions.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const ext     = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
    if (allowed.length && !allowed.includes(ext)) errors.push(`${label} must be one of: ${allowed.join(', ')}`);
  }
  if (rules.mimeTypeValidation) {
    const allowed = rules.mimeTypeValidation.split(',').map(m => m.trim().toLowerCase()).filter(Boolean);
    if (allowed.length && !allowed.includes(mime.toLowerCase())) errors.push(`${label} has an unsupported file type`);
  }
  if (rules.maxFileSize != null && rules.maxFileSize !== '') {
    if (size > Number(rules.maxFileSize) * 1024 * 1024) errors.push(`${label} must not exceed ${rules.maxFileSize} MB`);
  }
  if (rules.minFileSize != null && rules.minFileSize !== '') {
    if (size < Number(rules.minFileSize) * 1024) errors.push(`${label} must be at least ${rules.minFileSize} KB`);
  }
  if (rules.fileNameValidation && !/^[A-Za-z0-9._\-\s]+$/.test(name)) {
    errors.push(`${label} filename contains invalid characters`);
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

/**
 * Async single-field validation.
 * Use at onSubmit time (runs image dimension checks etc.).
 */
async function validateField(field, value, formData = {}, files = {}) {
  const rules = buildRules(field);
  const label = field.label || field.fieldKey;
  const type  = (field.fieldType || '').toLowerCase();
  const opts  = (type === 'dropdown' || type === 'radio') ? resolveOptionValues(field) : null;

  switch (type) {
    case 'text':     return validateText(value, rules, label);
    case 'number':   return validateNumber(value, rules, label);
    case 'date':     return validateDate(value, rules, label);
    case 'boolean':  return validateBoolean(value, rules, label);
    case 'dropdown': return validateDropdown(value, rules, label, opts);
    case 'radio':    return validateRadio(value, rules, label, opts);
    case 'file': {
      const file = files[field.fieldKey] || (value instanceof File ? value : null);
      return validateFile(file, rules, label, files);
    }
    default: return [];
  }
}

/**
 * Sync single-field validation.
 * Use for onChange / onBlur — no async work, instant response.
 */
function validateFieldSync(field, value, formData = {}, files = {}) {
  const rules = buildRules(field);
  const label = field.label || field.fieldKey;
  const type  = (field.fieldType || '').toLowerCase();
  const opts  = (type === 'dropdown' || type === 'radio') ? resolveOptionValues(field) : null;

  switch (type) {
    case 'text':     return validateText(value, rules, label);
    case 'number':   return validateNumber(value, rules, label);
    case 'date':     return validateDate(value, rules, label);
    case 'boolean':  return validateBoolean(value, rules, label);
    case 'dropdown': return validateDropdown(value, rules, label, opts);
    case 'radio':    return validateRadio(value, rules, label, opts);
    case 'file': {
      const file = files[field.fieldKey] || (value instanceof File ? value : null);
      return validateFileSync(file, rules, label, files);
    }
    default: return [];
  }
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
