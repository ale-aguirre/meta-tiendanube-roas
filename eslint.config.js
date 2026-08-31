'use strict';

const globals = require('globals');

/**
 * Config mínima y con intención: las reglas están para atajar errores reales,
 * no para discutir estilo. El formato se acuerda en .editorconfig.
 *
 * La regla que más paga es `no-undef` en el frontend: los scripts se cargan
 * sueltos, sin bundler, y un nombre mal escrito recién aparece cuando el
 * usuario hace clic.
 */
module.exports = [
  {
    ignores: ['node_modules/**', 'logs/**', 'credentials/**'],
  },
  {
    // Backend, tests y scripts: CommonJS sobre Node.
    files: ['src/**/*.js', 'test/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    ignores: ['src/public/**'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_|^next$', caughtErrors: 'none' }],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-throw-literal': 'error',
    },
  },
  {
    // Frontend: scripts clásicos, un solo scope global compartido.
    files: ['src/public/js/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        Chart: 'readonly',
        // Declarados en un archivo y usados en otro. Si agregás uno nuevo que
        // cruza archivos, sumalo acá: es la única red que hay sin bundler.
        CONFIG: 'writable',
        cargarConfig: 'readonly',
        aplicarConfig: 'readonly',
        $: 'readonly',
        fmt: 'readonly',
        fmtARS: 'readonly',
        pctOf: 'readonly',
        getAction: 'readonly',
        truncate: 'readonly',
        countUp: 'readonly',
        chart: 'writable',
        currentDatePreset: 'writable',
        lastMetaData: 'writable',
        lastTNData: 'writable',
        lastComparisonData: 'writable',
        tnaLoaded: 'writable',
        setDate: 'readonly',
        switchTab: 'readonly',
        switchHomeInsight: 'readonly',
        setLoading: 'readonly',
        showError: 'readonly',
        hideError: 'readonly',
        KPI_IDS: 'readonly',
        init: 'readonly',
        loadData: 'readonly',
        loadTiendaAnalytics: 'readonly',
        renderTNStats: 'readonly',
        render: 'readonly',
        runAnalysis: 'readonly',
        aggregate: 'readonly',
        pintarResumenV2: 'readonly',
        pintarGraficos: 'readonly',
        pintarMargenHint: 'readonly',
        initMargen: 'readonly',
        resumenEnError: 'readonly',
        resumenCargando: 'readonly',
        PERIODO_TXT: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      // vars:'local' — en scripts clásicos las funciones se llaman desde otro
      // archivo o desde un onclick del HTML; ESLint no puede verlo.
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', vars: 'local' }],
      'no-var': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
];
