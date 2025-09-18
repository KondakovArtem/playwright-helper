/* eslint-disable @typescript-eslint/no-explicit-any */
export type Variables = Record<string, any>;

export function replaceVariablesInJson(
  jsonObject: any,
  variables: Variables
): any {
  if (typeof jsonObject === "string") {
    const regex = /\$\{(\w+)\}/g;
    let match;
    let result = jsonObject;
    let hasMatches = false; // Flag to track if any matches were found

    // eslint-disable-next-line no-cond-assign
    while ((match = regex.exec(jsonObject)) !== null) {
      hasMatches = true; // At least one match found
      const variableName = match[1];
      if (Object.hasOwn(variables, variableName)) {
        // Check for exact match
        if (jsonObject === `\${${variableName}}`) {
          result = variables[variableName];
          break; // Exit loop if exact match found
        } else {
          result = result.replace(
            new RegExp(`\\$\\{${variableName}\\}`, "g"),
            String(variables[variableName])
          );
        }
      } else {
        console.warn(
          `Variable '${variableName}' not found in variables object.`
        );
      }
    }

    // If no matches were found, return original string. This prevents unnecessary changes.
    if (!hasMatches) return result;

    return result;
  }
  if (Array.isArray(jsonObject)) {
    return jsonObject.map((item) => replaceVariablesInJson(item, variables));
  }
  if (typeof jsonObject === "object" && jsonObject !== null) {
    const newObject: { [key: string]: any } = {};
    // eslint-disable-next-line no-restricted-syntax
    for (const key in jsonObject) {
      if (Object.hasOwn(jsonObject, key)) {
        newObject[key] = replaceVariablesInJson(jsonObject[key], variables);
      }
    }

    return newObject;
  }

  return jsonObject;
}
