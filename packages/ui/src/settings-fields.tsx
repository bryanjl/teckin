import type { SettingsField } from '@teckin/game-contracts';
import { useId } from 'react';

/** Class names the app supplies so the fields match its own design. */
export interface SettingsFieldsClassNames {
  /** Wraps one setting (label, input, help, problem). */
  field?: string;
  label?: string;
  help?: string;
  /** Number, text and choice inputs. */
  input?: string;
  checkbox?: string;
  /** The words after a number, such as "minutes". */
  unit?: string;
  problem?: string;
}

/** Props for {@link SettingsFields}. */
export interface SettingsFieldsProps {
  /** From `settingsFormFields(schema)`. */
  fields: readonly SettingsField[];
  /** Prepended to each input's name, so several schemas can share one form (`game.`, `room.`). */
  namePrefix?: string;
  /** Values to show instead of the defaults (for example after a refused submit). */
  values?: Readonly<Record<string, unknown>>;
  /** A message per setting name, shown under the setting. */
  problems?: Readonly<Record<string, string>>;
  classNames?: SettingsFieldsClassNames;
  /** Prefix for `data-testid`s (`<prefix>-<name>`); defaults to `setting`. */
  testIdPrefix?: string;
}

/**
 * The shared settings form: draws one input per setting from field descriptions made from a
 * game's Zod schema. Uncontrolled inputs with plain names, so it works in a plain `<form>`
 * posted to a server action. A game's new setting appears here with no code change.
 */
export function SettingsFields({
  fields,
  namePrefix = '',
  values = {},
  problems = {},
  classNames = {},
  testIdPrefix = 'setting',
}: SettingsFieldsProps) {
  const baseId = useId();
  return (
    <>
      {fields.map((field) => {
        const id = `${baseId}-${field.name}`;
        const name = `${namePrefix}${field.name}`;
        const problem = problems[field.name];
        const helpId = field.help ? `${id}-help` : undefined;
        const problemId = problem ? `${id}-problem` : undefined;
        const describedBy = [helpId, problemId].filter(Boolean).join(' ') || undefined;
        const shown = values[field.name] ?? field.defaultValue;
        const testId = `${testIdPrefix}-${field.name}`;
        const help = field.help ? (
          <span id={helpId} className={classNames.help}>
            {field.help}
          </span>
        ) : null;
        const problemText = problem ? (
          <span id={problemId} role="alert" className={classNames.problem}>
            {problem}
          </span>
        ) : null;

        if (field.kind === 'boolean') {
          return (
            <div key={field.name} className={classNames.field} data-setting={field.name}>
              <label htmlFor={id} className={classNames.label}>
                <input
                  id={id}
                  type="checkbox"
                  name={name}
                  value="on"
                  defaultChecked={shown === true}
                  aria-describedby={describedBy}
                  className={classNames.checkbox}
                  data-testid={testId}
                />
                <span>{field.label}</span>
              </label>
              {help}
              {problemText}
            </div>
          );
        }

        let input;
        if (field.kind === 'number') {
          input = (
            <input
              id={id}
              type="number"
              name={name}
              inputMode={field.integer ? 'numeric' : 'decimal'}
              min={field.min}
              max={field.max}
              step={field.integer ? 1 : 'any'}
              defaultValue={String(shown)}
              required
              aria-invalid={problem ? true : undefined}
              aria-describedby={describedBy}
              className={classNames.input}
              data-testid={testId}
            />
          );
        } else if (field.kind === 'choice') {
          input = (
            <select
              id={id}
              name={name}
              defaultValue={String(shown)}
              aria-invalid={problem ? true : undefined}
              aria-describedby={describedBy}
              className={classNames.input}
              data-testid={testId}
            >
              {field.choices.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          );
        } else {
          input = (
            <input
              id={id}
              type="text"
              name={name}
              maxLength={field.maxLength}
              defaultValue={String(shown)}
              aria-invalid={problem ? true : undefined}
              aria-describedby={describedBy}
              className={classNames.input}
              data-testid={testId}
            />
          );
        }
        const unit = field.kind === 'number' ? field.unit : undefined;
        return (
          <div key={field.name} className={classNames.field} data-setting={field.name}>
            <label htmlFor={id} className={classNames.label}>
              {field.label}
            </label>
            {unit ? (
              <span className={classNames.unit}>
                {input}
                <span>{unit}</span>
              </span>
            ) : (
              input
            )}
            {help}
            {problemText}
          </div>
        );
      })}
    </>
  );
}
