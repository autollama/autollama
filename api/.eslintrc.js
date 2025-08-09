/**
 * ESLint Configuration for AutoLlama API
 * Enforces code quality and consistency standards
 */

module.exports = {
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  extends: [
    'eslint:recommended',
    'prettier'
  ],
  plugins: [
    'prettier'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    // Prettier integration
    'prettier/prettier': 'error',
    
    // Code quality rules
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
    'no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_' 
    }],
    'prefer-const': 'error',
    'no-var': 'error',
    
    // Best practices
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-return-assign': 'error',
    'no-sequences': 'error',
    'no-throw-literal': 'error',
    'no-unmodified-loop-condition': 'error',
    'no-useless-call': 'error',
    'no-useless-concat': 'error',
    'no-useless-return': 'error',
    'prefer-promise-reject-errors': 'error',
    'require-await': 'error',
    
    // Node.js specific
    'no-buffer-constructor': 'error',
    'no-new-require': 'error',
    'no-path-concat': 'error',
    
    // Style rules (handled by Prettier, but some logical ones)
    'no-multiple-empty-lines': ['error', { max: 2 }],
    'no-trailing-spaces': 'error',
    'eol-last': 'error',
    
    // Security
    'no-script-url': 'error',
    
    // Error handling
    'handle-callback-err': 'error',
    'no-process-exit': 'error'
  },
  overrides: [
    {
      files: ['**/*.test.js', '**/*.spec.js'],
      env: {
        jest: true
      },
      rules: {
        'no-unused-expressions': 'off'
      }
    }
  ]
};