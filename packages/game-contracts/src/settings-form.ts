import { z, type ZodType } from 'zod';

/**
 * Turns a game's Zod settings schema into form fields, so the host's settings form is drawn
 * from the schema alone: a game adds a setting by adding it to its schema, with no form code.
 *
 * Each setting needs a default. Labels and help text come from Zod metadata
 * (`.meta({ title, description })`); without a title the key is turned into words. Supported
 * settings: booleans, integers and numbers (with `min`/`max`), string enums and strings.
 * Metadata `assignmentsOnly: true` keeps a setting off the live game form, and
 * `unit: 'minutes'` is shown after a number.
 */

interface FieldBase {
  /** The setting's key in the schema. */
  name: string;
  label: string;
  help?: string;
}

/** An on/off setting. */
export interface BooleanSettingField extends FieldBase {
  kind: 'boolean';
  defaultValue: boolean;
}

/** A number setting, whole numbers only when `integer`. */
export interface NumberSettingField extends FieldBase {
  kind: 'number';
  integer: boolean;
  defaultValue: number;
  min?: number;
  max?: number;
  unit?: string;
}

/** A setting with a fixed list of values. */
export interface ChoiceSettingField extends FieldBase {
  kind: 'choice';
  defaultValue: string;
  choices: { value: string; label: string }[];
}

/** A free-text setting. */
export interface TextSettingField extends FieldBase {
  kind: 'text';
  defaultValue: string;
  maxLength?: number;
}

/** One field of a generated settings form. */
export type SettingsField =
  BooleanSettingField | NumberSettingField | ChoiceSettingField | TextSettingField;

/** Which form the fields are for. */
export interface SettingsFormOptions {
  /** Live games leave out settings marked `assignmentsOnly`. Defaults to `'liveGame'`. */
  mode?: 'liveGame' | 'assignment';
}

interface JsonSchemaProperty {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  enum?: unknown[];
  unit?: unknown;
  assignmentsOnly?: unknown;
  choiceLabels?: unknown;
}

/** "energyPerCorrectAnswer" → "Energy per correct answer". */
export function labelFromKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The form fields for a settings schema, in the schema's key order. Throws for a setting the
 * form cannot draw (a nested object, an array, no default), so a new game finds out in its
 * tests rather than on a host's screen.
 */
export function settingsFormFields(
  schema: ZodType,
  options: SettingsFormOptions = {},
): SettingsField[] {
  const mode = options.mode ?? 'liveGame';
  const jsonSchema = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as {
    type?: string;
    properties?: Record<string, JsonSchemaProperty>;
  };
  if (jsonSchema.type !== 'object' || !jsonSchema.properties) {
    throw new Error('A settings schema must be a z.object');
  }
  const fields: SettingsField[] = [];
  for (const [name, property] of Object.entries(jsonSchema.properties)) {
    if (mode === 'liveGame' && property.assignmentsOnly === true) continue;
    fields.push(fieldFor(name, property));
  }
  return fields;
}

function fieldFor(name: string, property: JsonSchemaProperty): SettingsField {
  const base: FieldBase = {
    name,
    label: property.title ?? labelFromKey(name),
    ...(property.description ? { help: property.description } : {}),
  };
  const fallback = property.default;
  if (fallback === undefined) {
    throw new Error(`Setting "${name}" needs a default value`);
  }
  if (property.type === 'boolean' && typeof fallback === 'boolean') {
    return { ...base, kind: 'boolean', defaultValue: fallback };
  }
  if ((property.type === 'integer' || property.type === 'number') && typeof fallback === 'number') {
    return {
      ...base,
      kind: 'number',
      integer: property.type === 'integer',
      defaultValue: fallback,
      ...(property.minimum !== undefined ? { min: property.minimum } : {}),
      ...(property.maximum !== undefined ? { max: property.maximum } : {}),
      ...(typeof property.unit === 'string' ? { unit: property.unit } : {}),
    };
  }
  if (property.type === 'string' && typeof fallback === 'string') {
    if (property.enum) {
      const labels = (property.choiceLabels ?? {}) as Record<string, unknown>;
      return {
        ...base,
        kind: 'choice',
        defaultValue: fallback,
        choices: property.enum.map((value) => {
          const text = String(value);
          const label = labels[text];
          return { value: text, label: typeof label === 'string' ? label : labelFromKey(text) };
        }),
      };
    }
    return {
      ...base,
      kind: 'text',
      defaultValue: fallback,
      ...(property.maxLength !== undefined ? { maxLength: property.maxLength } : {}),
    };
  }
  throw new Error(`Setting "${name}" has a type the settings form cannot show`);
}

/**
 * Reads submitted form values back into setting values. `read` returns the submitted text for
 * a field name, or `null` when the field was not sent (an unticked checkbox). Text that is not
 * a number stays text, so the schema reports it as a problem instead of it being guessed.
 */
export function readSettingsForm(
  fields: readonly SettingsField[],
  read: (name: string) => string | null,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = read(field.name);
    switch (field.kind) {
      case 'boolean':
        values[field.name] = raw !== null && raw !== '' && raw !== 'false';
        break;
      case 'number': {
        const text = raw?.trim() ?? '';
        const parsed = text === '' ? Number.NaN : Number(text);
        values[field.name] = Number.isFinite(parsed) ? parsed : text;
        break;
      }
      case 'choice':
      case 'text':
        if (raw !== null) values[field.name] = raw;
        break;
    }
  }
  return values;
}

/**
 * A host-readable message per setting from a failed settings parse, keyed by setting name.
 * Uses the field's own words ("between 5 and 60") rather than Zod's.
 */
export function settingsProblems(
  fields: readonly SettingsField[],
  error: z.ZodError,
): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const issue of error.issues) {
    const name = String(issue.path[0] ?? '');
    const field = fields.find((candidate) => candidate.name === name);
    if (!field || problems[name]) continue;
    problems[name] = problemFor(field);
  }
  return problems;
}

function problemFor(field: SettingsField): string {
  if (field.kind === 'number') {
    const kind = field.integer ? 'a whole number' : 'a number';
    if (field.min !== undefined && field.max !== undefined) {
      return `Enter ${kind} from ${field.min} to ${field.max}.`;
    }
    if (field.min !== undefined) return `Enter ${kind} of at least ${field.min}.`;
    if (field.max !== undefined) return `Enter ${kind} of at most ${field.max}.`;
    return `Enter ${kind}.`;
  }
  if (field.kind === 'choice') return 'Choose one of the options.';
  if (field.kind === 'text' && field.maxLength !== undefined) {
    return `Use at most ${field.maxLength} characters.`;
  }
  return 'Check this setting.';
}
