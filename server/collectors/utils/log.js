export const log = (scope, ...args) => {
  console.log(`[collectors:${scope}]`, ...args);
};

export const warn = (scope, ...args) => {
  console.warn(`[collectors:${scope}]`, ...args);
};

export const error = (scope, ...args) => {
  console.error(`[collectors:${scope}]`, ...args);
};
