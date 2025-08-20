/* eslint-disable @typescript-eslint/no-explicit-any */
export type Variables = Record<string, any>;

// export function replaceVariablesInJson<T = any>(
//   jsonObject: T,
//   variables: Variables
// ): T {
//   if (typeof jsonObject === 'string') {
//     // Проверка на наличие шаблона ${...}
//     const regex = /\$\{(\w+)\}/g;
//     let match;
//     let result = jsonObject;

//     // eslint-disable-next-line no-cond-assign
//     while ((match = regex.exec(jsonObject)) !== null) {
//       const variableName = match[1];
//       if (Object.prototype.hasOwnProperty.call(variables, variableName)) {
//         // Полное совпадение ${variableName}
//         if (jsonObject === `\${${variableName}}`) {
//           result = variables[variableName];
//         } else {
//           // Замена шаблона в строке
//           result = result.replace(
//             new RegExp(`\\$\\{${variableName}\\}`, 'g'),
//             String(variables[variableName])
//           ) as T & string;
//         }
//         break; // Заменяем только первое вхождение для каждой переменной
//       } else {
//         // Обработка случая, когда переменная не найдена (можно выкинуть ошибку или оставить как есть)
//         console.warn(
//           `Variable '${variableName}' not found in variables object.`
//         );
//       }
//     }

//     return result;
//   }
//   if (Array.isArray(jsonObject)) {
//     return jsonObject.map((item) =>
//       replaceVariablesInJson(item, variables)
//     ) as T & any[];
//   }
//   if (typeof jsonObject === 'object' && jsonObject !== null) {
//     const newObject: { [key: string]: any } = {};

//     // eslint-disable-next-line no-restricted-syntax
//     for (const key in jsonObject) {
//       if (Object.prototype.hasOwnProperty.call(jsonObject, key)) {
//         newObject[key] = replaceVariablesInJson(jsonObject[key], variables);
//       }
//     }

//     return newObject as T;
//   }

//   return jsonObject; // Возвращаем неизмененное значение для других типов данных
// }

export function replaceVariablesInJson(
  jsonObject: any,
  variables: Variables,
): any {
  if (typeof jsonObject === 'string') {
    const regex = /\$\{(\w+)\}/g;
    let match;
    let result = jsonObject;
    let hasMatches = false; // Flag to track if any matches were found

    // eslint-disable-next-line no-cond-assign
    while ((match = regex.exec(jsonObject)) !== null) {
      hasMatches = true; // At least one match found
      const variableName = match[1];
      if (Object.prototype.hasOwnProperty.call(variables, variableName)) {
        // Check for exact match
        if (jsonObject === `\${${variableName}}`) {
          result = variables[variableName];
          break; // Exit loop if exact match found
        } else {
          result = result.replace(
            new RegExp(`\\$\\{${variableName}\\}`, 'g'),
            String(variables[variableName]),
          );
        }
      } else {
        console.warn(
          `Variable '${variableName}' not found in variables object.`,
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
  if (typeof jsonObject === 'object' && jsonObject !== null) {
    const newObject: { [key: string]: any } = {};
    // eslint-disable-next-line no-restricted-syntax
    for (const key in jsonObject) {
      if (Object.prototype.hasOwnProperty.call(jsonObject, key)) {
        newObject[key] = replaceVariablesInJson(jsonObject[key], variables);
      }
    }

    return newObject;
  }

  return jsonObject;
}
