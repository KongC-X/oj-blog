// ESLint 扁平配置（ESLint 9+）
// 目标：捕获真错误（未定义变量、重复声明、不可达代码），不强制代码风格，
// 避免一次性产生几百条格式告警淹没真正的问题。

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  location: 'readonly',
  navigator: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  fetch: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  AbortController: 'readonly',
  IntersectionObserver: 'readonly',
  MutationObserver: 'readonly',
  Event: 'readonly',
  CustomEvent: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  Blob: 'readonly',
  matchMedia: 'readonly',
  getComputedStyle: 'readonly',
  history: 'readonly',
  crypto: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  EventSource: 'readonly',
  marked: 'readonly',
  hljs: 'readonly',
};

const nodeGlobals = {
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  __dirname: 'readonly',
  __filename: 'readonly',
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  URL: 'readonly',
};

const baseRules = {
  'no-undef': 'error',
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-unreachable': 'error',
  'no-cond-assign': 'warn',
  'no-constant-condition': ['warn', { checkLoops: false }],
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
  'no-empty': ['warn', { allowEmptyCatch: true }],
};

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'vendor/**',
      'p/**',
      'solutions/**',
      'courseware/**',
      'templates/**',
      'data/**',
      'fonts/**',
    ],
  },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: browserGlobals,
    },
    rules: baseRules,
  },
  {
    files: ['*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: nodeGlobals,
    },
    rules: baseRules,
  },
];
