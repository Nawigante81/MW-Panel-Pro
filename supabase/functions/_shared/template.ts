export type TemplateVariables = Record<string, string | number | boolean | null | undefined>;

const VAR_REGEX = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

export function renderTemplate(input: string, variables: TemplateVariables = {}): string {
  return input.replace(VAR_REGEX, (_, key: string) => {
    const value = variables[key];
    return value === null || value === undefined ? '' : String(value);
  });
}
